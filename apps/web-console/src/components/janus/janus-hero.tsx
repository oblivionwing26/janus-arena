'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

import { SECTIONS } from '@/components/launch/sections';
import { decodeJanusPoints, type JanusPoints } from '@/lib/janus-points';

import type { Pointer } from './janus-scene';

// three.js loads after the first paint; until then (and for reduced motion or no WebGL) the hero
// shows the still render of the same head.
const JanusScene = dynamic(() => import('./janus-scene'), { ssr: false });

const POINTS_URL = '/models/janus-points.bin';
const FALLBACK_URL = '/models/janus-fallback.webp';
const TITLE = 'Introducing Janus';

function canAnimate(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/** The dawn: a horizon split in the two faces' colours, with Janus rising where they meet. */
function Horizon() {
  return (
    <svg className="dawn" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id="dawn-rim" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--ember)" stopOpacity="0" />
          <stop offset="0.22" stopColor="var(--ember)" />
          <stop offset="0.5" stopColor="oklch(0.97 0.03 80)" />
          <stop offset="0.78" stopColor="var(--aurora)" />
          <stop offset="1" stopColor="var(--aurora)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="dawn-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="oklch(0.98 0.03 80)" />
          <stop offset="0.25" stopColor="oklch(0.85 0.12 60)" stopOpacity="0.7" />
          <stop offset="1" stopColor="var(--ember)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dawn-planet" cx="0.5" cy="0" r="0.8">
          <stop offset="0" stopColor="oklch(0.2 0.02 50)" />
          <stop offset="1" stopColor="var(--void)" />
        </radialGradient>
        <filter id="dawn-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <circle cx="800" cy="2050" r="1420" fill="url(#dawn-planet)" />
      <circle
        className="dawn__glow"
        cx="800"
        cy="2050"
        r="1420"
        fill="none"
        stroke="url(#dawn-rim)"
        strokeWidth="26"
        filter="url(#dawn-glow)"
      />
      <circle
        className="dawn__rim"
        cx="800"
        cy="2050"
        r="1420"
        fill="none"
        stroke="url(#dawn-rim)"
        strokeWidth="2.4"
        pathLength="100"
      />
      <ellipse className="dawn__sun" cx="800" cy="632" rx="260" ry="90" fill="url(#dawn-sun)" />
    </svg>
  );
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
      pointer.current = {
        x: ((e.clientX - r.left) / r.width) * 2 - 1,
        y: -(((e.clientY - r.top) / r.height) * 2 - 1),
        active: e.clientY >= r.top && e.clientY <= r.bottom,
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
      id="top"
      ref={section}
      className="launch-hero"
      data-ready={ready}
      aria-labelledby="launch-title"
    >
      <Horizon />
      {/* eslint-disable-next-line @next/next/no-img-element -- a static export with no image optimiser */}
      <img
        className="launch-hero__still"
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
          layout="center"
        />
      )}
      <div className="launch-hero__top">
        <p className="eyebrow launch-hero__date">
          <time dateTime="2026-11">November 2026</time> · Open source
        </p>
        <h1 id="launch-title" className="launch-hero__title" aria-label={TITLE}>
          {TITLE.split(' ').map((word, w) => (
            <span key={word} className="launch-hero__word" aria-hidden>
              {[...word].map((ch, i) => (
                <span
                  key={i}
                  className="launch-hero__char"
                  style={{ animationDelay: `${(w * 9 + i) * 45}ms` }}
                >
                  {ch}
                </span>
              ))}
            </span>
          ))}
        </h1>
        <p className="launch-hero__sub">
          A pre-release gate that tests your users and your attackers on the same pull request, and
          tells you what every security fix costs the people it protects.
        </p>
      </div>
      <nav className="launch-hero__toc" aria-label="Contents">
        <ol>
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>
                <span className="launch-hero__toc-num">[{String(i + 1).padStart(2, '0')}]</span>
                <span className="launch-hero__toc-dots" aria-hidden />
                <span>{s.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}
