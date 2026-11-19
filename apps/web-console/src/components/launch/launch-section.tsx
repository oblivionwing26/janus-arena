import type { ReactNode } from 'react';

import { sourceUrl } from '@/lib/launch-data';

import { SECTIONS, sectionNumber, type SectionId } from './sections';

/** The frame every launch section shares: number, title, lede, content and its sources. */
export function LaunchSection({
  id,
  title,
  lede,
  sources,
  children,
}: {
  id: SectionId;
  title: ReactNode;
  lede?: ReactNode;
  sources: readonly string[];
  children: ReactNode;
}) {
  const label = SECTIONS.find((s) => s.id === id)?.label ?? '';
  return (
    <section id={id} className="launch-section" aria-labelledby={`${id}-title`}>
      <header className="launch-section__head">
        <p className="eyebrow">
          <span className="launch-section__num">{sectionNumber(id)}</span> {label}
        </p>
        <h2 id={`${id}-title`}>{title}</h2>
        {lede && <p className="launch-section__lede">{lede}</p>}
      </header>
      {children}
      <footer className="launch-section__sources">
        <span>Source{sources.length > 1 ? 's' : ''}:</span>
        {sources.map((s) => (
          <a key={s} href={sourceUrl(s)} target="_blank" rel="noreferrer">
            {s.replace('docs/reports/', '')}
          </a>
        ))}
      </footer>
    </section>
  );
}
