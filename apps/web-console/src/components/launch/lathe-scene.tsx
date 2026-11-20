'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  type BufferGeometry,
  type Group,
  type Mesh,
  LineBasicMaterial,
  DoubleSide,
  LineSegments,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  WireframeGeometry,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { damp } from '@/lib/janus-points';
import { latheAngle } from '@/lib/lathe';

const MODEL = '/models/janus-wire.glb';
/** The head sways this far either side of the angle the scroll gives it. */
const SWAY = (5 * Math.PI) / 180;

interface Shell {
  solid: Mesh;
  edges: LineSegments;
  dots: Points;
}

/** The low-poly scan as a faceted dark shell with its edges and vertices drawn in white. */
function shellOf(geometry: BufferGeometry, mesh: Mesh): Shell {
  mesh.material = new MeshStandardMaterial({
    color: '#161616',
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
    // the scan's winding is not consistent, so both sides hide what is behind them
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const edges = new LineSegments(
    new WireframeGeometry(geometry),
    new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.42 }),
  );
  const dots = new Points(
    geometry,
    new PointsMaterial({
      color: '#ffffff',
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.85,
    }),
  );
  return { solid: mesh, edges, dots };
}

function Bust({ progress, onReady }: { progress: RefObject<number>; onReady: () => void }) {
  const group = useRef<Group>(null);
  const [shell, setShell] = useState<Shell | null>(null);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    let alive = true;
    new GLTFLoader().load(MODEL, (gltf) => {
      if (!alive) return;
      let found: Mesh | null = null;
      gltf.scene.traverse((o) => {
        if (!found && (o as Mesh).isMesh) found = o as Mesh;
      });
      if (found) {
        const m = found as Mesh;
        setShell(shellOf(m.geometry, m));
        onReady();
        invalidate();
      }
    });
    return () => {
      alive = false;
    };
  }, [onReady, invalidate]);

  useFrame(({ clock }, dt) => {
    const g = group.current;
    if (!g) return;
    const sway = Math.sin(clock.elapsedTime * 0.35) * SWAY;
    g.rotation.y = damp(g.rotation.y, latheAngle(progress.current) + sway, 5, Math.min(dt, 0.05));
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <directionalLight position={[-4, 1, -2]} intensity={0.5} />
      <group ref={group} position={[-0.12, 0, 0]} rotation={[0, latheAngle(0), 0]}>
        {shell && (
          <>
            <primitive object={shell.solid} />
            <primitive object={shell.edges} />
            <primitive object={shell.dots} />
          </>
        )}
      </group>
    </>
  );
}

export default function LatheScene({
  progress,
  running,
  onReady,
}: {
  progress: RefObject<number>;
  running: boolean;
  onReady: () => void;
}) {
  return (
    <Canvas
      className="lathe__canvas"
      camera={{ position: [0, 1.95, 3.1], fov: 30 }}
      onCreated={({ camera }) => camera.lookAt(0, 1.82, 0)}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      frameloop={running ? 'always' : 'never'}
      aria-hidden
    >
      <Bust progress={progress} onReady={onReady} />
    </Canvas>
  );
}
