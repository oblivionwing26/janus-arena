'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
  type Points,
  ShaderMaterial,
  Vector2,
} from 'three';

import { damp, type JanusPoints, nextPixelRatio, turnForScroll } from '@/lib/janus-points';

// The two faces' colours, from tokens.css (approximate sRGB of the OKLCH values).
const EMBER = new Color('#f2733a');
const AURORA = new Color('#5fd6c8');
const MARBLE = new Color('#ece6dc');

export interface Pointer {
  x: number;
  y: number;
  active: boolean;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const HEAD_VERTEX = /* glsl */ `
  uniform float uTime, uAssemble, uPixelRatio, uSize, uMouseStrength;
  uniform vec2 uMouse;
  uniform vec3 uEmber, uAurora, uMarble;
  attribute vec3 aScatter;
  attribute float aRandom;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float t = clamp(uAssemble * 1.6 - aRandom * 0.6, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);
    vec3 p = mix(aScatter, position, e);
    p += normal * sin(uTime * 1.2 + aRandom * 40.0) * 0.006;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;
    vec2 d = clip.xy / clip.w - uMouse;
    float push = uMouseStrength * smoothstep(0.24, 0.0, length(d));
    mv.xy += normalize(d + 1e-5) * push * 0.32;
    gl_Position = projectionMatrix * mv;

    vec3 n = normalize(normalMatrix * normal);
    float light = 0.2 + 0.8 * max(dot(n, normalize(vec3(0.15, 0.55, 0.8))), 0.0);
    float rim = pow(1.0 - abs(n.z), 2.2);
    float old = 1.0 - smoothstep(-0.75, -0.3, position.x);
    float young = smoothstep(0.3, 0.75, position.x);
    vec3 tint = mix(mix(uMarble, uEmber, old), uAurora, young);
    vColor = uMarble * light * 0.85 + tint * rim * 1.1 + uEmber * push * 0.6;
    vAlpha = e * (0.45 + 0.55 * light);
    gl_PointSize = uSize * uPixelRatio * (0.6 + aRandom * 0.8) / -mv.z;
  }
`;

const HALO_VERTEX = /* glsl */ `
  uniform float uTime, uPixelRatio, uAssemble;
  attribute float aRandom;
  varying vec3 vColor;
  varying float vAlpha;
  uniform vec3 uEmber;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float flicker = 0.75 + 0.25 * sin(uTime * 3.0 + aRandom * 50.0);
    vColor = uEmber * 1.2;
    vAlpha = flicker * smoothstep(0.0, 1.0, uAssemble * 1.4 - aRandom * 0.3);
    gl_PointSize = (22.0 + aRandom * 14.0) * uPixelRatio / -mv.z;
  }
`;

const SPARK_VERTEX = /* glsl */ `
  uniform float uTime, uPixelRatio;
  attribute float aRandom;
  varying vec3 vColor;
  varying float vAlpha;
  uniform vec3 uEmber;
  void main() {
    vec3 p = position;
    float span = 3.8;
    p.y = mod(p.y + 1.9 + uTime * (0.05 + aRandom * 0.12), span) - 1.9;
    p.x += sin(uTime * 0.6 + aRandom * 20.0) * 0.05;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float edge = smoothstep(-1.9, -1.3, p.y) * (1.0 - smoothstep(1.2, 1.9, p.y));
    vColor = uEmber * 1.4;
    vAlpha = edge * (0.4 + 0.6 * aRandom);
    gl_PointSize = (10.0 + aRandom * 16.0) * uPixelRatio / -mv.z;
  }
`;

const DOT_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.05, r) * vAlpha);
  }
`;

function dotMaterial(vertexShader: string, uniforms: Record<string, { value: unknown }>) {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader: DOT_FRAGMENT,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

function Scene({
  points,
  pointer,
  progress,
}: {
  points: JanusPoints;
  pointer: RefObject<Pointer>;
  progress: RefObject<number>;
}) {
  const head = useRef<Group>(null);
  const headPoints = useRef<Points>(null);
  const world = useRef<Group>(null);
  const dpr = useThree((s) => s.viewport.dpr);
  const setDpr = useThree((s) => s.setDpr);
  const frames = useRef({ warm: 0, count: 0, total: 0 });
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));

  const { headGeometry, haloGeometry, sparkGeometry } = useMemo(() => {
    const rand = seeded(7);
    const headGeometry = new BufferGeometry();
    headGeometry.setAttribute('position', new BufferAttribute(points.positions, 3));
    headGeometry.setAttribute('normal', new BufferAttribute(points.normals, 3));
    const random = new Float32Array(points.count);
    const scatter = new Float32Array(points.count * 3);
    for (let i = 0; i < points.count; i++) {
      random[i] = rand();
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const r = 3 + rand() * 3;
      const q = Math.sqrt(1 - u * u);
      scatter.set([q * Math.cos(th) * r, u * r, q * Math.sin(th) * r - 1], i * 3);
    }
    headGeometry.setAttribute('aRandom', new BufferAttribute(random, 1));
    headGeometry.setAttribute('aScatter', new BufferAttribute(scatter, 3));

    // Halo of fire behind the head: the ring of the Blender scene (radius 1.3, 0.75 behind).
    const haloCount = 2400;
    const halo = new Float32Array(haloCount * 3);
    const haloRandom = new Float32Array(haloCount);
    for (let i = 0; i < haloCount; i++) {
      const a = rand() * Math.PI * 2;
      const r = 1.3 + (rand() - 0.5) * 0.03;
      halo.set([Math.cos(a) * r, 0.28 + Math.sin(a) * r, -0.75 + (rand() - 0.5) * 0.03], i * 3);
      haloRandom[i] = rand();
    }
    const haloGeometry = new BufferGeometry();
    haloGeometry.setAttribute('position', new BufferAttribute(halo, 3));
    haloGeometry.setAttribute('aRandom', new BufferAttribute(haloRandom, 1));

    const sparkCount = 260;
    const sparks = new Float32Array(sparkCount * 3);
    const sparkRandom = new Float32Array(sparkCount);
    for (let i = 0; i < sparkCount; i++) {
      sparks.set([(rand() - 0.5) * 5, rand() * 3.8 - 1.9, -1.6 + rand() * 2.2], i * 3);
      sparkRandom[i] = rand();
    }
    const sparkGeometry = new BufferGeometry();
    sparkGeometry.setAttribute('position', new BufferAttribute(sparks, 3));
    sparkGeometry.setAttribute('aRandom', new BufferAttribute(sparkRandom, 1));
    return { headGeometry, haloGeometry, sparkGeometry };
  }, [points]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAssemble: { value: 0 },
      uPixelRatio: { value: 1 },
      uSize: { value: 21 },
      uMouse: { value: new Vector2(9, 9) },
      uMouseStrength: { value: 0 },
      uEmber: { value: EMBER },
      uAurora: { value: AURORA },
      uMarble: { value: MARBLE },
    }),
    [],
  );
  const materials = useMemo(
    () => ({
      head: dotMaterial(HEAD_VERTEX, uniforms),
      halo: dotMaterial(HALO_VERTEX, uniforms),
      sparks: dotMaterial(SPARK_VERTEX, uniforms),
    }),
    [uniforms],
  );

  useEffect(
    () => () => {
      headGeometry.dispose();
      haloGeometry.dispose();
      sparkGeometry.dispose();
      Object.values(materials).forEach((m) => m.dispose());
    },
    [headGeometry, haloGeometry, sparkGeometry, materials],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    // Every 90 frames, step the resolution down if the machine cannot hold 45 fps. The first
    // 120 frames (loading, shader compile) do not count.
    const f = frames.current;
    if (f.warm < 120) f.warm += 1;
    else {
      f.count += 1;
      f.total += rawDt * 1000;
    }
    if (f.count === 90) {
      const next = nextPixelRatio(f.total / f.count, dpr);
      if (next !== dpr) setDpr(next);
      f.count = 0;
      f.total = 0;
    }
    const p = pointer.current;
    const material = headPoints.current?.material;
    if (!(material instanceof ShaderMaterial)) return;
    // The three materials share one uniforms object, so this drives the halo and sparks too.
    const u = material.uniforms as unknown as typeof uniforms;
    u.uTime.value += dt;
    u.uAssemble.value = Math.min(1, u.uAssemble.value + dt / 2.6);
    u.uPixelRatio.value = dpr;
    u.uMouse.value.set(p.x, p.y);
    u.uMouseStrength.value = damp(u.uMouseStrength.value, p.active ? 1 : 0, 4, dt);
    if (head.current) {
      const turn = turnForScroll(progress.current);
      head.current.rotation.y = damp(head.current.rotation.y, turn + p.x * 0.18, 3, dt);
      head.current.rotation.x = damp(head.current.rotation.x, -p.y * 0.08, 3, dt);
    }
    if (world.current) {
      // On wide screens the head stands to the right of the headline.
      const shift = aspect > 1.25 ? Math.min(1.45, (aspect - 1) * 1.3) : 0;
      world.current.position.x = damp(world.current.position.x, shift, 6, dt);
      world.current.position.y = 0;
    }
  });

  return (
    <group ref={world}>
      <points geometry={sparkGeometry} material={materials.sparks} />
      <points geometry={haloGeometry} material={materials.halo} />
      <group ref={head}>
        <points ref={headPoints} geometry={headGeometry} material={materials.head} />
      </group>
    </group>
  );
}

export default function JanusScene({
  points,
  pointer,
  progress,
  running,
  onReady,
}: {
  points: JanusPoints;
  pointer: RefObject<Pointer>;
  progress: RefObject<number>;
  running: boolean;
  onReady: () => void;
}) {
  return (
    <Canvas
      className="janus-hero__canvas"
      camera={{ position: [0, 0.1, 7.4], fov: 32 }}
      dpr={[1, 1.75]}
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      frameloop={running ? 'always' : 'never'}
      onCreated={() => onReady()}
      aria-hidden
    >
      <Scene points={points} pointer={pointer} progress={progress} />
    </Canvas>
  );
}
