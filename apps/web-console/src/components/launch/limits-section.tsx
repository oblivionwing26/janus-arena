'use client';

import { useEffect, useRef, useState } from 'react';

import { CLAIMS } from '@/lib/closing-data';
import { sourceUrl } from '@/lib/launch-data';

import { LaunchSection } from './launch-section';

export function LimitsSection() {
  const grid = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <LaunchSection
      id="limits"
      title={
        <>
          What we <em>do not</em> claim
        </>
      }
      lede="A tool that measures trade-offs should not oversell its own. Six things a launch page might say, and what Janus says instead, each pinned to the file in the repository that commits it to that."
      sources={[...new Set(CLAIMS.map((c) => c.source))]}
    >
      <div className="limits" ref={grid} data-seen={seen}>
        {CLAIMS.map((c, i) => (
          <article key={c.not} className="limit" style={{ ['--i' as string]: i }}>
            <p className="limit__not">
              <span className="sr-only">Not: </span>
              <s>{c.not}</s>
            </p>
            <h3 className="limit__instead">{c.instead}</h3>
            <p className="limit__detail">{c.detail}</p>
            <a className="limit__src" href={sourceUrl(c.source)} target="_blank" rel="noreferrer">
              {c.source}
            </a>
          </article>
        ))}
      </div>
    </LaunchSection>
  );
}
