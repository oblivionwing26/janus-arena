'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

import { decodeJanusPoints, type JanusPoints } from '@/lib/janus-points';

import type { Pointer } from './janus-scene';

// three.js loads after the first paint; until then (and for reduced motion or no WebGL) the hero
// shows the still render of the same head.
const JanusScene = dynamic(() => import('./janus-scene'), { ssr: false });

const POINTS_URL = '/models/janus-points.bin';
const FALLBACK_URL = '/models/janus-fallback.webp';

function canAnimate(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

export function JanusHero() {
  const section = useRef<HTMLElement>(null);
  const pointer = useRef<Pointer>({ x: 9, y: 9, active: false });
  const progress = useRef(0);
  const [points, setPoints] = useState<JanusPoints | null>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!canAnimate()) return;
    const controller = new AbortController();
    fetch(POINTS_URL, { signal: controller.signal })
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => setPoints(decodeJanusPoints(buf)))
      .catch(() => {
        // The still image stays: the hero is complete without the particles.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const inside = e.clientY >= r.top && e.clientY <= r.bottom;
      pointer.current = {
        x: ((e.clientX - r.left) / r.width) * 2 - 1,
        y: -(((e.clientY - r.top) / r.height) * 2 - 1),
        active: inside,
      };
    };
    const onLeave = () => {
      pointer.current = { ...pointer.current, active: false };
    };
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      progress.current = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height * 0.8)));
    };
    const io = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true));
    io.observe(el);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <section
      ref={section}
      className="janus-hero"
      data-ready={ready}
      aria-labelledby="janus-hero-title"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a static export with no image optimiser */}
      <img
        className="janus-hero__still"
        src={FALLBACK_URL}
        alt="A marble head of Janus with two faces, an old bearded one and a young one, under a ring of fire."
        width={1600}
        height={1000}
        fetchPriority="high"
      />
      {points && (
        <JanusScene
          points={points}
          pointer={pointer}
          progress={progress}
          running={visible}
          onReady={() => setReady(true)}
        />
      )}
      <div className="janus-hero__copy">
        <p className="eyebrow">Pre-release gate · UX and security</p>
        <h1 id="janus-hero-title">Every release has two faces</h1>
        <p className="janus-hero__lede">
          Janus sends synthetic shoppers and a deterministic attacker at the same pull request, then
          signs one report that says what each security fix costs the people it protects.
        </p>
        <ul className="janus-hero__faces" aria-label="The two faces">
          <li>
            <span className="chip" data-tone="aurora">
              UX face
            </span>
            Synthetic shoppers, friction, task success
          </li>
          <li>
            <span className="chip" data-tone="ember">
              Security face
            </span>
            Attacks by code, oracles, reproducible PoCs
          </li>
        </ul>
        <a className="janus-hero__cta" href="#runs">
          Explore the runs
        </a>
      </div>
    </section>
  );
}
