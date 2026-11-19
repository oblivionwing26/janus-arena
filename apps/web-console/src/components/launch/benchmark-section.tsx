'use client';

import { useState } from 'react';

import type { BenchChallenge, Benchmark } from '@/lib/benchmark';
import data from '@/lib/benchmark.data.json';

import { LaunchSection } from './launch-section';

// Parsed from docs/reports/benchmark-juice-shop.md; benchmark.test.ts keeps it equal to the report.
const B = data as unknown as Benchmark;
const REPORT = 'docs/reports/benchmark-juice-shop.md';
const COMMAND = 'pnpm run:benchmark juice-shop --runs 3';

const round = B.rounds[0];
const referenceSet = new Set(B.reference.map((r) => r.name));

function Stars({ n }: { n: number }) {
  return (
    <span className="stars" aria-label={`difficulty ${n} of 6`}>
      {'★'.repeat(n)}
    </span>
  );
}

function Tile({ c }: { c: BenchChallenge }) {
  const solved = c.solvedRounds > 0;
  return (
    <li
      className="tile"
      data-solved={solved}
      data-side={c.sideEffect}
      tabIndex={0}
      aria-label={`${c.name}, ${c.category}, difficulty ${c.difficulty}: ${solved ? `solved in ${c.solvedRounds} of ${c.rounds} rounds${c.sideEffect ? ', as a side effect' : ''}` : 'not solved'}`}
    >
      <span className="tile__name">{c.name}</span>
      <Stars n={c.difficulty} />
      {solved && (
        <span className="tile__badge">
          {c.solvedRounds}/{c.rounds}
          {c.sideEffect ? ' · side effect' : referenceSet.has(c.name) ? ' · reference' : ''}
        </span>
      )}
    </li>
  );
}

export function BenchmarkSection() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const byCategory = B.categories.map((cat) => ({
    cat,
    list: B.challenges
      .filter((c) => c.category === cat.name)
      .sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name)),
  }));

  return (
    <LaunchSection
      id="benchmark"
      title={
        <>
          A benchmark <em>without makeup</em>
        </>
      }
      lede="Recall on OWASP Juice Shop, counted by Juice Shop itself: it marks a challenge solved when something breaks it. Three rounds, each on a fresh instance, after a control round with no attack. No model is called, so it costs nothing to run."
      sources={[REPORT]}
    >
      {round && (
        <div className="bench-head">
          <div className="bench-hero glass">
            <p className="eyebrow">Recall · {B.target} v20.3.0</p>
            <p className="bench-hero__big">
              {round.solved}
              <span>/{round.total}</span>
            </p>
            <p className="bench-hero__pct">
              {round.recall.toFixed(1)} %{' '}
              <small>
                95 % interval [{round.lo} %, {round.hi} %]
              </small>
            </p>
            <div className="bench-hero__ci" aria-hidden>
              <i style={{ left: `${round.lo}%`, width: `${round.hi - round.lo}%` }} />
              <b style={{ left: `${round.recall}%` }} />
            </div>
            <p className="bench-hero__note">
              {round.withoutSideEffects}/{round.total} without one side effect · reference
              challenges {round.reference}
            </p>
          </div>
          <ol className="bench-rounds">
            <li className="bench-round" data-control>
              <span className="eyebrow">Control</span>
              <b>0</b>
              <span>solved with no attack</span>
              <span className="dots60" aria-hidden>
                {Array.from({ length: round?.total ?? 60 }, (_, i) => (
                  <i key={i} data-on={false} />
                ))}
              </span>
            </li>
            {B.rounds.map((r) => (
              <li key={r.round} className="bench-round">
                <span className="eyebrow">Round {r.round}</span>
                <b>
                  {r.solved}/{r.total}
                </b>
                <span>
                  {r.findings} findings · {r.seconds} s · 0.00 €
                </span>
                <span className="dots60" aria-hidden>
                  {Array.from({ length: r.total }, (_, i) => (
                    <i key={i} data-on={i < r.solved} />
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="bench-table glass">
        <table>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Red Team classes</th>
              <th scope="col">Solved, every round</th>
              <th scope="col" className="num">
                Recall
              </th>
            </tr>
          </thead>
          <tbody>
            {B.categories.map((c) => (
              <tr key={c.name}>
                <th scope="row">{c.name}</th>
                <td className="bench-classes">
                  {c.classes.map((k) => (
                    <code key={k}>{k}</code>
                  ))}
                </td>
                <td>
                  <span className="units" aria-label={`${c.everyRound} of ${c.challenges}`}>
                    {Array.from({ length: c.challenges }, (_, i) => (
                      <i key={i} data-on={i < c.everyRound} />
                    ))}
                  </span>
                  <span className="units__txt">
                    {c.everyRound}/{c.challenges}
                  </span>
                </td>
                <td className="num">{((100 * c.someRound) / c.challenges).toFixed(1)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mosaic">
        {byCategory.map(({ cat, list }) => (
          <section key={cat.name} className="mosaic__col" aria-label={cat.name}>
            <h3>
              {cat.name}{' '}
              <span>
                {list.filter((c) => c.solvedRounds > 0).length}/{list.length}
              </span>
            </h3>
            <ul>
              {list.map((c) => (
                <Tile key={c.name} c={c} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="bench-why">
        <div>
          <h3>Why it is low, on purpose</h3>
          <ul>
            <li>
              The denominator includes every challenge in the categories where an attack class acts,
              even the ones no class tries: a chatbot, a captcha, a forged token.
            </li>
            <li>
              Attacks are generated by code, never by a model, so the engine only finds what it was
              programmed to try. It hits the five challenges it was built around in every round.
            </li>
            <li>
              One solved challenge, Repetitive Registration, is a side effect of a login probe; the
              recall without it is 5/60, and the report says so.
            </li>
            <li>
              Nuclei and ZAP were not run: they crawl the target and would read Juice Shop&apos;s
              own answers, which no agent of Janus may see.
            </li>
          </ul>
        </div>
        <div className="bench-cmd">
          <p className="eyebrow">Reproduce it · needs Docker, no API key</p>
          <pre>
            <code>{COMMAND}</code>
          </pre>
          <button type="button" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy command'}
          </button>
        </div>
      </div>
    </LaunchSection>
  );
}
