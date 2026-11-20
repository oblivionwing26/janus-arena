'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { JanusMark } from '../ui/janus-mark';
import { useReducedMotion } from './use-reduced-motion';

const STACK = [
  'OWASP Juice Shop',
  'Playwright',
  'Semgrep',
  'Docker',
  'cosign',
  'in-toto',
  'Claude',
];

/**
 * Two dunes of fine lines that breathe on either side of a clear path to the centre: ember on the
 * attacker's side, aurora on the defender's.
 */
function Dunes() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let W = 0;
    let H = 0;
    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(cv);

    const LINES = 64;
    const draw = (time: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const side of [-1, 1] as const) {
        for (let i = 0; i < LINES; i++) {
          const t = i / (LINES - 1);
          ctx.beginPath();
          const steps = 90;
          for (let s = 0; s <= steps; s++) {
            const u = s / steps; // 0 at the outer edge, 1 at the centre path
            const x = side === -1 ? u * W * 0.5 : W - u * W * 0.5;
            // the dune rises at the edge and falls into the clear centre
            const crest = Math.pow(1 - u, 1.6);
            const wave = Math.sin(u * 6 + t * 4 + time * 0.00035 * (side === -1 ? 1 : -1)) * 0.05;
            const y = H * (0.18 + 0.82 * t) - H * 0.55 * crest * (1 - t * 0.6) + H * wave * crest;
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          const a = 0.05 + 0.22 * (1 - t) * (1 - t);
          ctx.strokeStyle = side === -1 ? `rgba(255,255,255,${a})` : `rgba(200,200,200,${a})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    };

    let raf = 0;
    let running = true;
    const loop = (time: number) => {
      if (!running) return;
      draw(time);
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      running = (e?.isIntersecting ?? true) && !reduced;
      cancelAnimationFrame(raf);
      if (running) raf = requestAnimationFrame(loop);
      else draw(0);
    });
    io.observe(cv);
    draw(0);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [reduced]);

  return <canvas ref={canvas} className="mono__dunes" aria-hidden />;
}

export function MonolithHero() {
  return (
    <section id="top" className="mono" aria-labelledby="mono-title">
      <Dunes />
      <div className="mono__beam" aria-hidden />
      <div className="mono__inner">
        <p className="mono__eyebrow">
          <span>Open source</span> · <time dateTime="2026-11">November 2026</time>
        </p>
        <h1 id="mono-title" className="mono__title">
          Every release has two faces
        </h1>
        <p className="mono__sub">
          Janus attacks your pull request and defends it, then tells you what each fix costs the
          people it protects.
        </p>
        <div className="mono__cta">
          <a className="mono__btn" href="#teams">
            See both faces
          </a>
          <Link className="mono__link" href="/runs">
            Replay a real run →
          </Link>
        </div>
        <div className="mono__tile">
          <JanusMark size={64} />
        </div>
      </div>
      <ul className="mono__stack" aria-label="Built with and tested against">
        {STACK.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </section>
  );
}
