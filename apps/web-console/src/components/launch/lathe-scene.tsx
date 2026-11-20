'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Color, type Group, type Mesh, MeshStandardMaterial, type PointLight } from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { damp } from '@/lib/janus-points';
import { latheAngle, turnProgress } from '@/lib/lathe';

const MODEL = '/models/janus-bust.glb';
const EMBER = new Color('#ff6a2b');
const AURORA = new Color('#4fd9c9');

function Bust({ progress, onReady }: { progress: RefObject<number>; onReady: () => void }) {
  const group = useRef<Group>(null);
  const ember = useRef<PointLight>(null);
  const aurora = useRef<PointLight>(null);
  const [mesh, setMesh] = useState<Mesh | null>(null);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    let alive = true;
    const draco = new DRACOLoader().setDecoderPath('/draco/');
    const loader = new GLTFLoader().setDRACOLoader(draco);
    loader.load(MODEL, (gltf) => {
      if (!alive) return;
      let found: Mesh | null = null;
      gltf.scene.traverse((o) => {
        if (!found && (o as Mesh).isMesh) found = o as Mesh;
      });
      if (found) {
        const m = found as Mesh;
        m.material = new MeshStandardMaterial({
          color: new Color('#d6cfc3'),
          roughness: 0.48,
          metalness: 0,
        });
        setMesh(m);
        onReady();
        invalidate();
      }
      draco.dispose();
    });
    return () => {
      alive = false;
    };
  }, [onReady, invalidate]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const p = progress.current;
    g.rotation.y = damp(g.rotation.y, latheAngle(p), 6, Math.min(dt, 0.05));
    const t = turnProgress(p);
    if (ember.current) ember.current.intensity = 60 * (1 - t);
    if (aurora.current) aurora.current.intensity = 60 * t;
  });

  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight position={[2.5, 4, 5]} intensity={1.6} color="#fff1e4" />
      <pointLight
        ref={ember}
        position={[-2.6, 2.6, -1.4]}
        color={EMBER}
        intensity={60}
        distance={12}
        decay={1.6}
      />
      <pointLight
        ref={aurora}
        position={[2.6, 2.6, -1.4]}
        color={AURORA}
        intensity={0}
        distance={12}
        decay={1.6}
      />
      <pointLight position={[0, 0.6, 3]} color="#ffffff" intensity={2} distance={8} />
      <group ref={group} rotation={[0, latheAngle(0), 0]}>
        {mesh && <primitive object={mesh} />}
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
      camera={{ position: [0, 1.75, 7.2], fov: 26 }}
      onCreated={({ camera }) => camera.lookAt(0, 1.45, 0)}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      frameloop={running ? 'always' : 'never'}
      aria-hidden
    >
      <Bust progress={progress} onReady={onReady} />
    </Canvas>
  );
}
