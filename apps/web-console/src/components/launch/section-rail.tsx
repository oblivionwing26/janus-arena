'use client';

import { useEffect, useState } from 'react';

import { SECTIONS } from './sections';

/** The index, pinned to the left once the hero has scrolled away; lights the current section. */
export function SectionRail() {
  const [current, setCurrent] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('top');
    const heroIo = new IntersectionObserver(([e]) => setShown(!(e?.isIntersecting ?? true)), {
      threshold: 0.15,
    });
    if (hero) heroIo.observe(hero);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        const first = visible.sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
        )[0];
        if (first) setCurrent(first.target.id);
      },
      { rootMargin: '-40% 0px -50% 0px' },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => {
      heroIo.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <nav className="section-rail" data-shown={shown} aria-label="Sections">
      <ol>
        {SECTIONS.map((s, i) => (
          <li key={s.id}>
            <a href={`#${s.id}`} aria-current={current === s.id ? 'true' : undefined}>
              <span className="section-rail__num">{String(i + 1).padStart(2, '0')}</span>
              <span className="section-rail__label">{s.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
