'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { HowItWorks } from '@/components/landing/how-it-works';
import { Observatory } from '@/components/landing/observatory';
import { StoryCard } from '@/components/landing/story-card';
import { RunsTable } from '@/components/runs-table';
import { fetchDemoIndex, listRuns, type FeaturedRun, type RunRow } from '@/lib/backend';
import { DEMO } from '@/lib/demo';

const REPO = 'https://github.com/oblivionwing26/janus-arena';

export default function HomePage() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [featured, setFeatured] = useState<readonly FeaturedRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const loaded = await listRuns();
        if (DEMO) {
          const index = await fetchDemoIndex();
          if (!cancelled) setFeatured(index.featured);
        }
        if (!cancelled) {
          setRuns(loaded);
          setNow(Date.now());
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      }
    };
    void load();
    // A demo is recorded once; a live backend is polled.
    const timer = DEMO ? null : setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, []);

  const firstGate = featured.find((story) =>
    story.links.some((link) => link.href.endsWith('/attack')),
  );

  return (
    <>
      {DEMO ? (
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-dot" aria-hidden="true" />
              Pre-release gate · UX and security
            </p>
            <h1 id="hero-title" className="hero-title">
              Every release has <em>two faces.</em>
            </h1>
            <p className="hero-lede">
              Janus sends synthetic users through your flows and attacks a sandboxed copy of your
              app, on the same pull request. Then it measures what each security fix costs the
              people it is meant to protect.
            </p>
            <div className="hero-actions">
              {firstGate?.links[0] !== undefined && (
                <Link className="btn btn-primary btn-lg" href={firstGate.links[0].href}>
                  Watch a gate attack, fix and verify
                  <span aria-hidden="true">→</span>
                </Link>
              )}
              <a className="btn btn-lg" href="#stories">
                Explore the recorded runs
              </a>
            </div>
            <ul className="hero-proof" aria-label="What Janus guarantees">
              <li>Deterministic oracles, never a model&apos;s opinion</li>
              <li>Signed reports you can verify</li>
              <li>A person merges, never Janus</li>
            </ul>
          </div>
          <div className="hero-visual">
            <Observatory />
          </div>
        </section>
      ) : (
        <header className="page-head">
          <p className="eyebrow">Orchestrator</p>
          <h1>Runs</h1>
          <p className="muted">Live from the event log, refreshed every few seconds.</p>
        </header>
      )}

      {DEMO && <HowItWorks />}

      {featured.length > 0 && (
        <section id="stories" className="stories" aria-labelledby="stories-title">
          <p className="eyebrow">Start here</p>
          <h2 id="stories-title" className="section-title">
            {featured.length} recorded stories, replayed from their event logs.
          </h2>
          <div className="story-grid">
            {featured.map((story, index) => (
              <StoryCard key={story.runId} story={story} index={index} />
            ))}
          </div>
        </section>
      )}

      <section className="all-runs" aria-labelledby="runs-title">
        {DEMO && (
          <>
            <p className="eyebrow">Event log</p>
            <h2 id="runs-title" className="section-title">
              Every run in the demo
            </h2>
          </>
        )}
        {!DEMO && (
          <h2 id="runs-title" className="visually-hidden">
            All runs
          </h2>
        )}
        {error !== null && (
          <p role="alert" className="notice notice-error">
            {DEMO ? error : `The orchestrator cannot be reached (${error}).`} You can still{' '}
            <Link href="/replay">replay an exported run</Link> without a backend.
          </p>
        )}
        {runs === null && error === null && (
          <div className="skeleton-table" aria-busy="true" aria-label="Loading runs">
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
        )}
        {runs !== null && runs.length === 0 && <p className="muted">No runs yet.</p>}
        {runs !== null && runs.length > 0 && <RunsTable runs={runs} now={now} />}
      </section>

      {DEMO && (
        <footer className="site-footer">
          <p>
            Synthetic users do not predict revenue: reports speak of synthetic task success, with
            confidence intervals. <a href={REPO}>Read the code and the reports</a>.
          </p>
        </footer>
      )}
    </>
  );
}
