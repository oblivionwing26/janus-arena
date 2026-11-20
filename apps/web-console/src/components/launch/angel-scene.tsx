'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  type Group,
  type Mesh,
  type PerspectiveCamera,
  type Points as ThreePoints,
  type Texture,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

import { damp } from '@/lib/janus-points';
import { COOL, EMBERS, WARM, embers, halo, rng, wing, type Cloud, type Side } from '@/lib/angel';

const MODEL = '/models/janus-wire.glb';
const BUST_POINTS = 26000;
/** Where the head's centre sits and how big the halo behind it is. */
const HEAD = new Vector3(0, 0.62, 0);
const HALO_RADIUS = 1.15;
const SHOULDER_Y = 0.02;

/** A soft round dot, drawn once, for every point in the scene. */
function dotTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

function geometryOf({ positions, colors }: Cloud): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

function Dots({
  cloud,
  size,
  map,
  pointsRef,
}: {
  cloud: Cloud;
  size: number;
  map: Texture;
  pointsRef?: React.Ref<ThreePoints>;
}) {
  const geometry = useMemo(() => geometryOf(cloud), [cloud]);
  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={size}
        map={map}
        vertexColors
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}

/** The scanned bust as a cloud of points: the bearded face looks left, warm; the young one right. */
function sampleBust(mesh: Mesh): Cloud {
  const sampler = new MeshSurfaceSampler(mesh).build();
  const positions = new Float32Array(BUST_POINTS * 3);
  const colors = new Float32Array(BUST_POINTS * 3);
  const p = new Vector3();
  const n = new Vector3();
  const random = rng(11);
  for (let k = 0; k < BUST_POINTS; k++) {
    sampler.sample(p, n);
    // half a turn: the bearded face (+X as scanned) now looks left, towards "Attack"
    const x = -p.x;
    const z = -p.z;
    const y = p.y - 2.1 + HEAD.y;
    positions.set([x, y, z], k * 3);
    const t = Math.min(1, Math.abs(x) / 0.75);
    const tint = x < 0 ? WARM : COOL;
    // drawn by its outline, so both profiles read: surfaces seen edge-on burn, those facing the
    // camera fade; and the chest fades out under the words
    const rim = Math.pow(1 - Math.abs(n.z), 2.5);
    const fall = Math.min(1, Math.max(0, (y + 1.1) / 1.4));
    const light = (0.06 + 0.94 * rim) * fall * (0.7 + 0.3 * random());
    colors.set(
      [0, 1, 2].map((i) => (1 - 0.55 * t + (tint[i] ?? 0) * 0.55 * t) * light),
      k * 3,
    );
  }
  return { positions, colors };
}

function Wing({ side, map }: { side: Side; map: Texture }) {
  const ref = useRef<Group>(null);
  const cloud = useMemo(() => wing(side, rng(side === -1 ? 21 : 22)), [side]);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = side * Math.sin(clock.elapsedTime * 0.55) * 0.035;
  });
  return (
    <group ref={ref} position={[0.32 * side, SHOULDER_Y, -0.45]}>
      <Dots cloud={cloud} size={0.024} map={map} />
    </group>
  );
}

function Embers({ map }: { map: Texture }) {
  const ref = useRef<ThreePoints>(null);
  const cloud = useMemo(() => embers(rng(31)), []);
  const speeds = useMemo(() => {
    const r = rng(32);
    return Array.from({ length: EMBERS }, () => 0.12 + 0.3 * r());
  }, []);
  useFrame((_, dt) => {
    const attr = ref.current?.geometry.getAttribute('position');
    if (!attr) return;
    const a = attr.array as Float32Array;
    for (let k = 0; k < EMBERS; k++) {
      let y = (a[k * 3 + 1] ?? 0) + (speeds[k] ?? 0.2) * Math.min(dt, 0.05);
      if (y > 2.6) y = -2.4;
      a[k * 3 + 1] = y;
    }
    attr.needsUpdate = true;
  });
  return <Dots cloud={cloud} size={0.04} map={map} pointsRef={ref} />;
}

function Angel({ still }: { still: boolean }) {
  const root = useRef<Group>(null);
  const map = useMemo(() => dotTexture(), []);
  const haloCloud = useMemo(() => halo(HALO_RADIUS, rng(41)), []);
  const [bust, setBust] = useState<Cloud | null>(null);
  const { camera, size, invalidate } = useThree();

  useEffect(() => {
    let alive = true;
    new GLTFLoader().load(MODEL, (gltf) => {
      if (!alive) return;
      let found: Mesh | null = null;
      gltf.scene.traverse((o) => {
        if (!found && (o as Mesh).isMesh) found = o as Mesh;
      });
      if (found) {
        setBust(sampleBust(found));
        invalidate();
      }
    });
    return () => {
      alive = false;
    };
  }, [invalidate]);

  // wide windows see both wings; narrow ones step back until the halo and most of the wings fit
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    cam.position.set(0, 0.2, Math.min(12, 6.2 * Math.max(1, 1.45 / aspect)));
    cam.lookAt(0, 0.2, 0);
    invalidate();
  }, [camera, size, invalidate]);

  useFrame(({ pointer }, dt) => {
    const g = root.current;
    if (!g || still) return;
    const d = Math.min(dt, 0.05);
    g.rotation.y = damp(g.rotation.y, pointer.x * 0.12, 2.5, d);
    g.rotation.x = damp(g.rotation.x, -pointer.y * 0.06, 2.5, d);
  });

  return (
    <group ref={root}>
      <group position={[HEAD.x, HEAD.y, -0.7]}>
        <Dots cloud={haloCloud} size={0.045} map={map} />
        <sprite position={[-HALO_RADIUS, 0, 0.02]} scale={[0.5, 0.5, 1]}>
          <spriteMaterial map={map} color={new Color(...WARM)} blending={AdditiveBlending} />
        </sprite>
        <sprite position={[HALO_RADIUS, 0, 0.02]} scale={[0.5, 0.5, 1]}>
          <spriteMaterial map={map} color={new Color(...COOL)} blending={AdditiveBlending} />
        </sprite>
      </group>
      <Wing side={-1} map={map} />
      <Wing side={1} map={map} />
      {bust && <Dots cloud={bust} size={0.02} map={map} />}
      {!still && <Embers map={map} />}
    </group>
  );
}

export default function AngelScene({ running, still }: { running: boolean; still: boolean }) {
  return (
    <Canvas
      className="angel__canvas"
      camera={{ position: [0, 0.2, 6.2], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: false, alpha: true }}
      frameloop={running && !still ? 'always' : 'demand'}
      aria-hidden
    >
      <Angel still={still} />
    </Canvas>
  );
}
