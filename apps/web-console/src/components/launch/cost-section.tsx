'use client';

import { useState } from 'react';

import {
  DEFENSES,
  LAUNCH_DAY_REPORT,
  LOCKOUT_ALTERNATIVES,
  TRADEOFF_REPORT,
  type Defense,
  type Rate,
} from '@/lib/tradeoff-data';

import { LaunchSection } from './launch-section';

// Chart geometry: x = synthetic shopper success, y = share of attacks that got through.
const W = 640;
const H = 470;
const M = { l: 58, r: 28, t: 26, b: 56 };
const X = { min: 50, max: 100 };
const sx = (p: number) => M.l + ((p - X.min) / (X.max - X.min)) * (W - M.l - M.r);
const sy = (p: number) => M.t + (1 - p / 100) * (H - M.t - M.b);

/** Short names for the direct labels on the chart. */
const SHORT: Record<string, string> = {
  'client-20-distinct': '20/min per client',
  'client-20-shared': '20/min, shared IPs',
  'account-3': '3/min per account',
  'step-up': 'Checkout step-up',
  'client-6-shared': '6/min, shared IPs',
};

/** Label offsets, so labels sharing a row do not collide (dx, dy, anchor). */
const LABEL_AT: Record<string, [number, number, 'start' | 'end' | 'middle']> = {
  'client-20-distinct': [12, 18, 'start'],
  'client-20-shared': [-12, 18, 'end'],
  'account-3': [12, -12, 'start'],
  'step-up': [-12, 26, 'end'],
  'client-6-shared': [14, -16, 'start'],
};

const fmt = (x: Rate) => `${x.p} %`;
const ci = (x: Rate) => `[${x.lo}–${x.hi}] · ${x.k}/${x.n}`;

export function CostSection() {
  const [sel, setSel] = useState('client-6-shared');
  const [hover, setHover] = useState<string | null>(null);
  const focus = hover ?? sel;
  const chosen = DEFENSES.find((d) => d.id === sel) ?? DEFENSES[0];

  return (
    <LaunchSection
      id="cost"
      title={
        <>
          What a fix <em>costs</em>
        </>
      }
      lede="Five defenses against abuse, each run on ShopLab with and without it: synthetic shoppers and saboteurs together. Down means fewer attacks get through; right means more shoppers finish. The best defense moves down without moving left."
      sources={[LAUNCH_DAY_REPORT, TRADEOFF_REPORT]}
    >
      <div className="cost">
        <figure className="cost__chart glass">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="cost-chart-title">
            <title id="cost-chart-title">
              Attacks that got through against shopper success, before and after each defense
            </title>
            <defs>
              <marker
                id="cost-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
              </marker>
              <linearGradient id="cost-ideal" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--aurora)" stopOpacity="0" />
                <stop offset="1" stopColor="var(--aurora)" stopOpacity="0.16" />
              </linearGradient>
            </defs>

            {/* the corner every defense wants to reach */}
            <rect
              x={sx(80)}
              y={sy(25)}
              width={sx(100) - sx(80)}
              height={sy(0) - sy(25)}
              fill="url(#cost-ideal)"
              rx="8"
            />
            <text x={sx(100) - 10} y={sy(25) + 18} textAnchor="end" className="cost__ideal">
              attacks stopped, shoppers kept
            </text>

            {/* grid and axes */}
            {[0, 25, 50, 75, 100].map((y) => (
              <g key={y}>
                <line x1={M.l} x2={W - M.r} y1={sy(y)} y2={sy(y)} className="cost__grid" />
                <text x={M.l - 10} y={sy(y) + 4} textAnchor="end" className="cost__tick">
                  {y} %
                </text>
              </g>
            ))}
            {[50, 60, 70, 80, 90, 100].map((x) => (
              <text key={x} x={sx(x)} y={H - M.b + 20} textAnchor="middle" className="cost__tick">
                {x} %
              </text>
            ))}
            <text x={(M.l + W - M.r) / 2} y={H - 10} textAnchor="middle" className="cost__axis">
              Shoppers who finish their purchase →
            </text>
            <text
              transform={`translate(16 ${(M.t + H - M.b) / 2}) rotate(-90)`}
              textAnchor="middle"
              className="cost__axis"
            >
              Attacks that get through ↑
            </text>

            {/* intervals of the focused defense */}
            {DEFENSES.filter((d) => d.id === focus).map((d) => (
              <g key={d.id} className="cost__ci">
                <line
                  x1={sx(Math.max(X.min, d.b.success.lo))}
                  x2={sx(d.b.success.hi)}
                  y1={sy(d.b.attack.p)}
                  y2={sy(d.b.attack.p)}
                />
                <line
                  x1={sx(d.b.success.p)}
                  x2={sx(d.b.success.p)}
                  y1={sy(d.b.attack.lo)}
                  y2={sy(d.b.attack.hi)}
                />
              </g>
            ))}

            {/* one arrow per defense, from A (no defense) to B (with it) */}
            {DEFENSES.map((d) => {
              const on = d.id === focus;
              const [dx, dy, anchor] = LABEL_AT[d.id] ?? [12, 4, 'start'];
              const bx = sx(d.b.success.p);
              const by = sy(d.b.attack.p);
              return (
                <g
                  key={d.id}
                  className="cost__mark"
                  data-on={on}
                  tabIndex={0}
                  role="button"
                  aria-pressed={d.id === sel}
                  aria-label={`${d.label}: attacks ${fmt(d.a.attack)} to ${fmt(d.b.attack)}, shoppers finishing ${fmt(d.a.success)} to ${fmt(d.b.success)}, turned away ${fmt(d.b.blocked)}`}
                  onClick={() => setSel(d.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSel(d.id);
                    }
                  }}
                  onPointerEnter={() => setHover(d.id)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(d.id)}
                  onBlur={() => setHover(null)}
                >
                  <path
                    className="cost__arrow"
                    d={`M ${sx(d.a.success.p)} ${sy(d.a.attack.p)} Q ${(sx(d.a.success.p) + bx) / 2 + 18} ${(sy(d.a.attack.p) + by) / 2} ${bx} ${by}`}
                    markerEnd="url(#cost-arrow)"
                  />
                  <circle
                    cx={sx(d.a.success.p)}
                    cy={sy(d.a.attack.p)}
                    r="4.5"
                    className="cost__a"
                  />
                  {d.b.blocked.p > 0 && (
                    <circle cx={bx} cy={by} r={9 + d.b.blocked.p / 2} className="cost__blocked" />
                  )}
                  <circle cx={bx} cy={by} r="6" className="cost__b" />
                  <circle cx={bx} cy={by} r="18" className="cost__hit" />
                  <text x={bx + dx} y={by + dy} textAnchor={anchor} className="cost__label">
                    {SHORT[d.id]}
                    {d.b.blocked.p > 0 ? ` · ${d.b.blocked.p} % turned away` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
          <figcaption className="cost__legend">
            <span>
              <i className="cost__key cost__key--a" /> without the defense (A)
            </span>
            <span>
              <i className="cost__key cost__key--b" /> with it (B)
            </span>
            <span>
              <i className="cost__key cost__key--blocked" /> shoppers turned away
            </span>
            <span>Lines: 95 % intervals of the highlighted defense</span>
          </figcaption>
        </figure>

        <aside className="cost__detail glass" aria-live="polite">
          <ol className="cost__picker">
            {DEFENSES.map((d) => (
              <li key={d.id}>
                <button type="button" aria-pressed={d.id === sel} onClick={() => setSel(d.id)}>
                  {SHORT[d.id]}
                </button>
              </li>
            ))}
          </ol>
          {chosen && <DefenseDetail d={chosen} />}
        </aside>
      </div>

      <div className="alts">
        <header className="alts__head">
          <p className="eyebrow">Brute force on Juice Shop&apos;s login · three ways to stop it</p>
          <h3>The Blue Team tries the alternatives, and Janus measures each one</h3>
        </header>
        <div className="alts__grid">
          {LOCKOUT_ALTERNATIVES.map((a) => (
            <article
              key={a.name}
              className="alt glass"
              data-recommended={a.recommended}
              data-measured={a.measured}
            >
              <div className="alt__top">
                <h4>{a.name}</h4>
                {a.recommended && <span className="alt__badge">Recommended</span>}
              </div>
              {a.measured ? (
                <>
                  <p className="alt__closed">
                    <span aria-hidden>✓</span> Attack closed: the proof no longer works
                  </p>
                  {a.success && (
                    <div className="alt__row">
                      <span className="alt__k">Shoppers who finish</span>
                      <span
                        className="alt__dots"
                        aria-label={`${a.success.before} of ${a.success.of} before, ${a.success.after} after`}
                      >
                        {Array.from({ length: a.success.of }, (_, i) => (
                          <i
                            key={i}
                            data-before={i < (a.success?.before ?? 0)}
                            data-after={i < (a.success?.after ?? 0)}
                          />
                        ))}
                      </span>
                      <span className="alt__v" data-worse={a.success.after < a.success.before}>
                        {a.success.before}/{a.success.of} → {a.success.after}/{a.success.of}
                      </span>
                    </div>
                  )}
                  {a.p95 && (
                    <div className="alt__row">
                      <span className="alt__k">Login p95</span>
                      <span className="alt__bar" aria-hidden>
                        <i style={{ width: `${(a.p95.after / a.p95.budget) * 100}%` }} />
                        <b style={{ left: '100%' }} />
                      </span>
                      <span className="alt__v">
                        {a.p95.before} → {a.p95.after} ms <small>budget {a.p95.budget}</small>
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className="alt__closed" data-none>
                  Not measured
                </p>
              )}
              <p className="alt__note">{a.note}.</p>
            </article>
          ))}
        </div>
      </div>
    </LaunchSection>
  );
}

function Metric({
  label,
  a,
  b,
  worseIfUp,
}: {
  label: string;
  a: Rate;
  b: Rate;
  worseIfUp: boolean;
}) {
  const worse = worseIfUp ? b.p > a.p : b.p < a.p;
  const better = worseIfUp ? b.p < a.p : b.p > a.p;
  return (
    <div className="metric">
      <span className="metric__k">{label}</span>
      <span className="metric__track" aria-hidden>
        <i
          className="metric__ci"
          data-v="a"
          style={{ left: `${a.lo}%`, width: `${a.hi - a.lo}%` }}
        />
        <i
          className="metric__ci"
          data-v="b"
          style={{ left: `${b.lo}%`, width: `${b.hi - b.lo}%` }}
        />
        <b className="metric__pt" data-v="a" style={{ left: `${a.p}%` }} />
        <b className="metric__pt" data-v="b" style={{ left: `${b.p}%` }} />
      </span>
      <span className="metric__v" data-tone={worse ? 'worse' : better ? 'better' : 'same'}>
        {fmt(a)} → {fmt(b)}
      </span>
      <span className="metric__ci-text">
        A {ci(a)} · B {ci(b)}
      </span>
    </div>
  );
}

function DefenseDetail({ d }: { d: Defense }) {
  return (
    <div className="defense" key={d.id}>
      <p className="eyebrow">
        {d.addresses === 'shared' ? 'Shoppers share addresses' : 'One address per shopper'} · run{' '}
        <code>{d.run.slice(0, 10)}…</code>
      </p>
      <h3>{d.label}</h3>
      <Metric label="Attacks that get through" a={d.a.attack} b={d.b.attack} worseIfUp />
      <Metric label="Shoppers who finish" a={d.a.success} b={d.b.success} worseIfUp={false} />
      <Metric label="Shoppers turned away" a={d.a.blocked} b={d.b.blocked} worseIfUp />
      <p className="defense__note">
        Two saboteurs per variant, so the attack intervals are wide: this says which way a defense
        moves, not its exact rate. Synthetic task success, not conversion.
      </p>
    </div>
  );
}
