'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  type BufferGeometry,
  Color,
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
import { ATTACK_ANGLE, DEFENSE_ANGLE, latheAngle } from '@/lib/lathe';

const MODEL = '/models/janus-wire.glb';
/** The head sways this far either side of the angle the scroll gives it. */
const SWAY = (4 * Math.PI) / 180;
/** The attacking face is drawn in orange-red, the defending one in mint. */
const EMBER = new Color('#ff5a32');
const MINT = new Color('#5cf0c6');
/** Where the camera looks: the middle of the face, and how far away it stands. */
const EYE_Y = 2.02;
const DISTANCE = 2.4;
const FOV = 30;

interface Shell {
  solid: Mesh;
  edges: LineSegments;
  dots: Points;
}

/** The low-poly scan as a faceted dark shell, its edges and vertices drawn in its face's colour. */
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
    new LineBasicMaterial({ color: EMBER, transparent: true, opacity: 0.6 }),
  );
  const dots = new Points(
    geometry,
    new PointsMaterial({
      color: EMBER,
      size: 2.4,
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

  const tint = useRef(new Color());

  useFrame(({ clock, size }, dt) => {
    const g = group.current;
    if (!g) return;
    // the head's axis sits on the window's left edge, so only the face turned to the text shows
    const halfWidth = Math.tan(((FOV / 2) * Math.PI) / 180) * DISTANCE * (size.width / size.height);
    g.position.x = -halfWidth;
    const sway = Math.sin(clock.elapsedTime * 0.35) * SWAY;
    g.rotation.y = damp(g.rotation.y, latheAngle(progress.current) + sway, 5, Math.min(dt, 0.05));
    if (shell) {
      // the colour follows the head as it actually turns, not the scroll
      const t = Math.min(
        1,
        Math.max(0, (g.rotation.y - ATTACK_ANGLE) / (DEFENSE_ANGLE - ATTACK_ANGLE)),
      );
      tint.current.lerpColors(EMBER, MINT, t);
      (shell.edges.material as LineBasicMaterial).color.copy(tint.current);
      (shell.dots.material as PointsMaterial).color.copy(tint.current);
    }
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 4, 5]} intensity={1.4} />
      <directionalLight position={[-4, 1, -2]} intensity={0.5} />
      <group ref={group} rotation={[0, latheAngle(0), 0]}>
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
      camera={{ position: [0, EYE_Y, DISTANCE], fov: FOV }}
      onCreated={({ camera }) => camera.lookAt(0, EYE_Y, 0)}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      frameloop={running ? 'always' : 'never'}
      aria-hidden
    >
      <Bust progress={progress} onReady={onReady} />
    </Canvas>
  );
}
