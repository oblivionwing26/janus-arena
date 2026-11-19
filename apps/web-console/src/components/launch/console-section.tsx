'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { COLUMNS, type BoardCard, type Column } from '@/lib/console-board';
import data from '@/lib/console-board.data.json';

import { JanusMark } from '../ui/janus-mark';
import { LaunchSection } from './launch-section';

// Built by buildCard from the recorded demo runs; console-board.test.ts keeps it equal to them.
const CARDS = data as unknown as BoardCard[];

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

const OUTCOME: Record<BoardCard['outcome'], string> = {
  success: 'Completed',
  error: 'Some sessions failed',
  unknown: 'Recorded',
};

const GLYPH: Record<Column, string> = {
  gate: 'G',
  synthlab: 'S',
  'launch-day': 'L',
  variant: 'V',
  'red-team': 'R',
  'blue-team': 'B',
};

function Card({ c, lifted }: { c: BoardCard; lifted: boolean }) {
  return (
    <Link
      href={`/runs/${c.runId}`}
      className="bcard"
      data-lifted={lifted}
      data-col={c.column}
      title={`Run ${c.runId}`}
    >
      <span className="bcard__top">
        <span className="bcard__glyph" aria-hidden>
          {GLYPH[c.column]}
        </span>
        <span className="bcard__date">{day.format(new Date(c.startedAt))}</span>
      </span>
      <span className="bcard__title">{c.title}</span>
      <span className="bcard__line">{c.line}</span>
      <span className="bcard__meta">
        <i data-outcome={c.outcome} aria-hidden />
        {OUTCOME[c.outcome]} · {c.events.toLocaleString('en')} events
      </span>
    </Link>
  );
}

export function ConsoleSection() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'board' | 'list'>('board');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CARDS;
    return CARDS.filter((c) =>
      `${c.title} ${c.line} ${c.runId} ${c.column}`.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <LaunchSection
      id="console"
      title={
        <>
          Inside <em>the console</em>
        </>
      }
      lede="Every run Janus records can be replayed, event by event, with nothing but a browser: no backend, no keys, no model calls. These are the thirteen runs behind this page. Open any of them."
      sources={['apps/web-console/public/demo/index.json', 'assets/janus/temple.py']}
    >
      <div className="vista">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static export with no image optimiser */}
        <img
          className="vista__bg"
          src="/models/temple-dawn.webp"
          alt=""
          width={2400}
          height={1350}
          loading="lazy"
        />
        <div className="app glass">
          <nav className="app__rail" aria-label="Console sections">
            <span className="app__logo">
              <JanusMark size={26} />
            </span>
            <Link href="/runs" aria-label="Runs" data-on="true">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M5 4v16M12 4v10M19 4v6" />
              </svg>
            </Link>
            <Link href="/replay" aria-label="Replay an exported run">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M7 5v14l11-7z" />
              </svg>
            </Link>
            <a href="#trust" aria-label="Verify a signed report">
              <svg viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="10" r="6" />
                <path d="M9 15.5 8 21l4-2 4 2-1-5.5" />
              </svg>
            </a>
          </nav>
          <div className="app__main">
            <div className="app__bar">
              <label className="app__search">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <circle cx="11" cy="11" r="6" />
                  <path d="m20 20-4.5-4.5" />
                </svg>
                <span className="sr-only">Search the recorded runs</span>
                <input
                  id="console-search"
                  type="search"
                  placeholder="Search runs: juice shop, attack, ab…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <span className="app__spacer" />
              <Link className="app__ghost" href="/replay">
                Replay a file
              </Link>
              <Link className="app__solid" href="/runs">
                Open the console
              </Link>
            </div>
            <div className="app__head">
              <h3>Recorded runs</h3>
              <span className="app__seg" role="group" aria-label="View">
                <button
                  type="button"
                  aria-pressed={view === 'board'}
                  onClick={() => setView('board')}
                >
                  Board
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                >
                  List
                </button>
              </span>
              <span className="app__count">
                {shown.length} of {CARDS.length}
              </span>
            </div>

            {view === 'board' ? (
              <div className="board2">
                {COLUMNS.map((col) => {
                  const cards = shown.filter((c) => c.column === col.id);
                  return (
                    <section key={col.id} className="bcol" aria-label={col.label}>
                      <h4>
                        {col.label} <span>{cards.length}</span>
                      </h4>
                      {cards.length === 0 && <p className="bcol__empty">No run matches</p>}
                      {cards.map((c, i) => (
                        <Card
                          key={c.runId}
                          c={c}
                          lifted={col.id === 'red-team' && i === 0 && !query}
                        />
                      ))}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="blist">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Run</th>
                      <th scope="col">Kind</th>
                      <th scope="col">What it recorded</th>
                      <th scope="col" className="num">
                        Events
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => (
                      <tr key={c.runId}>
                        <td>
                          <Link href={`/runs/${c.runId}`}>{c.title}</Link>
                        </td>
                        <td>{COLUMNS.find((k) => k.id === c.column)?.label}</td>
                        <td>{c.line}</td>
                        <td className="num">{c.events.toLocaleString('en')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="app__pill">Replays in your browser · no backend · no model calls</p>
        </div>
      </div>
    </LaunchSection>
  );
}
