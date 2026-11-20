'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from './use-reduced-motion';

const AngelScene = dynamic(() => import('./angel-scene'), { ssr: false });

const STACK = [
  'OWASP Juice Shop',
  'Playwright',
  'Semgrep',
  'Docker',
  'cosign',
  'in-toto',
  'Claude',
];

function canWebGL(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/**
 * The first screen: an angel drawn in points, the scanned Janus at its heart with a halo that burns
 * warm on the attacking side and cool on the defending one, and the two words it stands between.
 */
export function AngelHero() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  const [webgl, setWebgl] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      const on = e?.isIntersecting ?? true;
      setVisible(on);
      if (on) setWebgl((w) => w || canWebGL());
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} id="top" className="angel" aria-labelledby="angel-title">
      <div className="angel__stage" aria-hidden>
        {webgl && <AngelScene running={visible} still={reduced} />}
      </div>
      <h1 id="angel-title" className="angel__title">
        <span className="sr-only">Janus: attack and defend every release</span>
        <span className="angel__word" data-face="attack" aria-hidden>
          Attack
        </span>
        <span className="angel__name" aria-hidden>
          Janus
        </span>
        <span className="angel__word" data-face="defense" aria-hidden>
          Defend
        </span>
      </h1>
      <div className="angel__foot">
        <p className="angel__eyebrow">
          <span>Open source</span> · <time dateTime="2026-11">November 2026</time>
        </p>
        <p className="angel__sub">
          Every release has two faces. Janus attacks your pull request and defends it, then tells
          you what each fix costs the people it protects.
        </p>
        <div className="angel__cta">
          <a className="angel__btn" href="#teams">
            See both faces
          </a>
          <Link className="angel__link" href="/runs">
            Replay a real run →
          </Link>
        </div>
      </div>
      <ul className="angel__stack" aria-label="Built with and tested against">
        {STACK.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </section>
  );
}
