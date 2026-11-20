'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  arcPosition,
  buildAttackTree,
  spreadLabels,
  type AttackTree,
  type Leaf,
  type LeafState,
  type RunEvent,
} from '@/lib/attack-tree';

import { LaunchSection } from './launch-section';
import { useReducedMotion } from './use-reduced-motion';

const RED_RUN = '01M79ZA35SZ9QRNF6K3AAGXNQN';
const BLUE_RUN = '01M79ZC3PHE7YQA5EQR02YHTBC';
const SOURCES = [
  `apps/web-console/public/demo/runs/${RED_RUN}.json`,
  `apps/web-console/public/demo/runs/${BLUE_RUN}.json`,
];

// Geometry of the drawing (SVG user units).
const W = 1000;
const H = 720;
const ORB = { x: 92, y: 360 };
const BOX = { x: 214, w: 178, h: 62, gap: 16 };
const ARC = { cx: 290, cy: 360, r: 410, from: -62, to: 62 };

const STATE_COLOR: Record<LeafState, string> = {
  exploited: 'var(--blood)',
  fixed: 'var(--aurora)',
  refused: 'var(--stone)',
  blocked: 'var(--gold)',
};

const STATE_LABEL: Record<LeafState, string> = {
  exploited: 'Exploitable · confirmed',
  fixed: 'Fixed · verified three ways',
  refused: 'Tried · refused',
  blocked: 'Blocked by the scope',
};

/** The fix replays as a story: exploited, then patched, then verified. */
type FixStage = 'exploited' | 'patched' | 'verified';

function arcPoint(t: number) {
  const a = ((ARC.from + (ARC.to - ARC.from) * t) * Math.PI) / 180;
  return { x: ARC.cx + ARC.r * Math.cos(a), y: ARC.cy + ARC.r * Math.sin(a) };
}

const leafKey = (l: Leaf) => `${l.testType}|${l.endpoint}`;

async function loadEvents(id: string): Promise<RunEvent[]> {
  const r = await fetch(`/demo/runs/${id}.json`);
  if (!r.ok) throw new Error(`run ${id}: ${r.status}`);
  return ((await r.json()) as { events: RunEvent[] }).events;
}

export function AttackTreeSection() {
  const [tree, setTree] = useState<AttackTree | null>(null);
  const [failed, setFailed] = useState(false);
  const [selClass, setSelClass] = useState<string | null>(null);
  const [selLeaf, setSelLeaf] = useState<string | null>(null);
  const [stage, setStage] = useState<FixStage>('verified');
  const [inView, setInView] = useState(false);
  const figure = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    let alive = true;
    Promise.all([loadEvents(RED_RUN), loadEvents(BLUE_RUN)])
      .then(([red, blue]) => alive && setTree(buildAttackTree(red, blue)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = figure.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tree]);

  // Seen for the first time: replay the fix, red to amber to green.
  const timers = useRef<number[]>([]);
  const replayFix = () => {
    timers.current.forEach(clearTimeout);
    if (reduced) {
      setStage('verified');
      return;
    }
    setStage('exploited');
    timers.current = [
      window.setTimeout(() => setStage('patched'), 1600),
      window.setTimeout(() => setStage('verified'), 3400),
    ];
  };
  useEffect(() => {
    if (!inView || !tree?.fix) return;
    const t = window.setTimeout(replayFix, 900);
    return () => clearTimeout(t);
    // replayFix only reads refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, tree]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const layout = useMemo(() => {
    if (!tree) return null;
    const boxesTop = ORB.y - (tree.classes.length * (BOX.h + BOX.gap) - BOX.gap) / 2;
    const boxes = tree.classes.map((c, i) => ({ c, y: boxesTop + i * (BOX.h + BOX.gap) }));
    const endpoints = [...new Set(tree.classes.flatMap((c) => c.leaves.map((l) => l.endpoint)))];
    const dots = new Map(endpoints.map((ep) => [ep, arcPoint(arcPosition(tree, ep))]));
    const labelYs = spreadLabels(
      endpoints.map((ep) => dots.get(ep)?.y ?? 0),
      38,
      24,
      H - 24,
    );
    const labels = new Map(endpoints.map((ep, i) => [ep, labelYs[i] ?? 0]));
    const surface = tree.surface.map((ep) => ({ ep, ...arcPoint(arcPosition(tree, ep)) }));
    return { boxes, dots, labels, surface, endpoints };
  }, [tree]);

  const allLeaves = useMemo(() => tree?.classes.flatMap((c) => c.leaves) ?? [], [tree]);
  const fixKey = tree?.fix ? allLeaves.find((l) => l.findingId === tree.fix?.findingId) : undefined;
  const selected =
    allLeaves.find((l) => leafKey(l) === selLeaf) ??
    fixKey ??
    allLeaves.find((l) => l.state === 'exploited');

  /** A leaf's colour, with the fixed one following the replay. */
  const stateOf = (l: Leaf): LeafState => {
    if (l.state !== 'fixed') return l.state;
    return stage === 'verified' ? 'fixed' : 'exploited';
  };
  const colorOf = (l: Leaf) =>
    l.state === 'fixed' && stage === 'patched' ? 'var(--gold)' : STATE_COLOR[stateOf(l)];

  const worstByEndpoint = (ep: string): Leaf | undefined => {
    const rank: LeafState[] = ['exploited', 'fixed', 'blocked', 'refused'];
    return allLeaves
      .filter((l) => l.endpoint === ep)
      .sort((a, b) => rank.indexOf(a.state) - rank.indexOf(b.state))[0];
  };

  return (
    <LaunchSection
      id="attack-tree"
      title={
        <>
          Every attack, <em>one tree</em>
        </>
      }
      lede="The Red Team reads the target's code, maps every HTTP endpoint, and attacks the ones each class can reach, inside a sandbox with no internet. This is the recorded Juice Shop gate: pick a class or an endpoint."
      sources={SOURCES}
    >
      <div className="atree" ref={figure} data-in-view={inView}>
        <div className="atree__canvas glass">
          {failed && <p className="atree__empty">The recorded run could not be loaded.</p>}
          {!tree && !failed && <p className="atree__empty">Loading the recorded run…</p>}
          {tree && layout && (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`Attack tree of the ${tree.target} gate`}
            >
              <defs>
                <radialGradient id="orb-core" cx="40%" cy="35%" r="65%">
                  <stop offset="0" stopColor="oklch(0.97 0 0)" />
                  <stop offset="0.45" stopColor="oklch(0.72 0 0)" />
                  <stop offset="1" stopColor="oklch(0.28 0 0)" />
                </radialGradient>
                <filter id="atree-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5" />
                </filter>
                <path
                  id="orb-ring"
                  d={`M ${ORB.x - 66} ${ORB.y} a 66 66 0 1 1 132 0 a 66 66 0 1 1 -132 0`}
                />
              </defs>

              {/* the surface map: every endpoint, faint, on the arc */}
              <path
                className="atree__arc"
                d={`M ${arcPoint(0).x} ${arcPoint(0).y} A ${ARC.r} ${ARC.r} 0 0 1 ${arcPoint(1).x} ${arcPoint(1).y}`}
              />
              {layout.surface.map((s) => (
                <circle key={s.ep} className="atree__surface" cx={s.x} cy={s.y} r="1.7" />
              ))}

              {/* spokes from the target to each class */}
              {layout.boxes.map(({ c, y }) => (
                <path
                  key={c.testType}
                  className="atree__spoke"
                  data-on={selClass === null || selClass === c.testType}
                  d={`M ${ORB.x + 46} ${ORB.y} C ${ORB.x + 100} ${ORB.y}, ${BOX.x - 60} ${y + BOX.h / 2}, ${BOX.x} ${y + BOX.h / 2}`}
                />
              ))}

              {/* the fan: each class to the endpoints it attacked */}
              <g className="atree__fan">
                {layout.boxes.flatMap(({ c, y }) =>
                  c.leaves.map((l, i) => {
                    const d = layout.dots.get(l.endpoint);
                    if (!d) return null;
                    const sy = y + BOX.h / 2;
                    const dim = selClass !== null && selClass !== c.testType;
                    return (
                      <path
                        key={leafKey(l)}
                        className="atree__curve"
                        data-dim={dim}
                        data-state={stateOf(l)}
                        style={{ stroke: colorOf(l), ['--i' as string]: i }}
                        d={`M ${BOX.x + BOX.w} ${sy} C ${BOX.x + BOX.w + 120} ${sy}, ${d.x - 140} ${d.y}, ${d.x - 6} ${d.y}`}
                        pathLength={1}
                      />
                    );
                  }),
                )}
              </g>

              {/* attacked endpoints: dot, leader and label */}
              {layout.endpoints.map((ep) => {
                const d = layout.dots.get(ep);
                const ly = layout.labels.get(ep) ?? d?.y ?? 0;
                const leaf = worstByEndpoint(ep);
                if (!d || !leaf) return null;
                const here = selected?.endpoint === ep;
                const lx = d.x + 34;
                const choose = () => {
                  const inClass = allLeaves.find(
                    (l) => l.endpoint === ep && l.testType === selClass,
                  );
                  setSelLeaf(leafKey(inClass ?? leaf));
                };
                return (
                  <g
                    key={ep}
                    className="atree__leaf"
                    data-state={stateOf(leaf)}
                    data-here={here}
                    tabIndex={0}
                    role="button"
                    aria-label={`${ep}: ${STATE_LABEL[leaf.state]}`}
                    onClick={choose}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        choose();
                      }
                    }}
                  >
                    {stateOf(leaf) === 'exploited' && (
                      <circle
                        className="atree__pulse"
                        cx={d.x}
                        cy={d.y}
                        r="9"
                        style={{ fill: colorOf(leaf) }}
                      />
                    )}
                    {leaf.state === 'fixed' && stage === 'verified' && (
                      <circle className="atree__ripple" cx={d.x} cy={d.y} r="8" />
                    )}
                    <circle cx={d.x} cy={d.y} r={here ? 7 : 5} style={{ fill: colorOf(leaf) }} />
                    <path className="atree__leader" d={`M ${d.x + 8} ${d.y} L ${lx - 6} ${ly}`} />
                    <text x={lx} y={ly - 2} className="atree__route">
                      {ep}
                    </text>
                    <text
                      x={lx}
                      y={ly + 14}
                      className="atree__status"
                      style={{ fill: colorOf(leaf) }}
                    >
                      {leaf.state === 'fixed'
                        ? stage === 'exploited'
                          ? 'Exploitable · confirmed'
                          : stage === 'patched'
                            ? 'Patched · verifying…'
                            : STATE_LABEL.fixed
                        : STATE_LABEL[leaf.state]}
                    </text>
                  </g>
                );
              })}

              {/* class boxes */}
              {layout.boxes.map(({ c, y }) => {
                const confirmed = c.leaves.filter(
                  (l) => l.state === 'exploited' || l.state === 'fixed',
                ).length;
                const on = selClass === c.testType;
                const toggle = () => setSelClass(on ? null : c.testType);
                return (
                  <g
                    key={c.testType}
                    className="atree__box"
                    data-on={on}
                    tabIndex={0}
                    role="button"
                    aria-pressed={on}
                    aria-label={`${c.label}: ${c.attempts} attempts, ${confirmed} confirmed`}
                    onClick={toggle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle();
                      }
                    }}
                  >
                    <rect x={BOX.x} y={y} width={BOX.w} height={BOX.h} rx="12" />
                    <text x={BOX.x + 16} y={y + 30} className="atree__count">
                      {c.attempts}
                    </text>
                    <text x={BOX.x + 16} y={y + 49} className="atree__label">
                      {c.label}
                    </text>
                    <text
                      x={BOX.x + BOX.w - 14}
                      y={y + 28}
                      textAnchor="end"
                      className="atree__conf"
                      data-any={confirmed > 0}
                    >
                      {confirmed} confirmed
                    </text>
                  </g>
                );
              })}

              {/* the target */}
              <g className="atree__orb">
                <circle cx={ORB.x} cy={ORB.y} r="84" className="atree__halo" />
                <circle
                  cx={ORB.x}
                  cy={ORB.y}
                  r="40"
                  fill="url(#orb-core)"
                  filter="url(#atree-glow)"
                  opacity="0.8"
                />
                <circle cx={ORB.x} cy={ORB.y} r="34" fill="url(#orb-core)" />
                <g className="atree__ring">
                  <text className="atree__ringtext">
                    <textPath href="#orb-ring">
                      {`JUICE SHOP · ${tree.totals.mapped} ENDPOINTS · ${tree.totals.attempts} ATTEMPTS · ${tree.totals.confirmed} CONFIRMED · `}
                    </textPath>
                  </text>
                </g>
                <text x={ORB.x} y={ORB.y + 118} textAnchor="middle" className="atree__orbname">
                  Juice Shop v20.3.0
                </text>
              </g>
            </svg>
          )}
          {tree && (
            <ul className="atree__legend" aria-hidden>
              {(['exploited', 'fixed', 'blocked', 'refused'] as const).map((s) => (
                <li key={s}>
                  <i style={{ background: STATE_COLOR[s] }} />
                  {STATE_LABEL[s]}
                </li>
              ))}
              <li>
                <i className="atree__legend-dot" /> mapped, not attacked
              </li>
            </ul>
          )}
        </div>

        <aside className="atree__panel glass" aria-live="polite">
          {tree && (
            <dl className="atree__tiles">
              <div>
                <dt>Endpoints mapped</dt>
                <dd>{tree.totals.mapped}</dd>
              </div>
              <div>
                <dt>Attack requests</dt>
                <dd>{tree.totals.attempts}</dd>
              </div>
              <div>
                <dt>Confirmed, with proof</dt>
                <dd data-tone="blood">{tree.totals.confirmed}</dd>
              </div>
              <div>
                <dt>Stopped by the scope</dt>
                <dd data-tone="gold">{tree.totals.blocked}</dd>
              </div>
            </dl>
          )}
          {selected && tree && (
            <LeafDetail
              leaf={selected}
              tree={tree}
              stage={selected.state === 'fixed' ? stage : 'verified'}
              color={colorOf(selected)}
              onReplay={replayFix}
            />
          )}
        </aside>
      </div>

      {tree && (
        <details className="atree__table">
          <summary>Every attack as a table</summary>
          <div className="atree__table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Endpoint</th>
                  <th scope="col">Requests</th>
                  <th scope="col">Result</th>
                  <th scope="col">What the oracle saw</th>
                </tr>
              </thead>
              <tbody>
                {tree.classes.flatMap((c) =>
                  c.leaves.map((l) => (
                    <tr key={leafKey(l)}>
                      <td>{c.label}</td>
                      <td>
                        <code>{l.endpoint}</code>
                      </td>
                      <td>{l.attempts.length}</td>
                      <td>{STATE_LABEL[l.state]}</td>
                      <td>
                        {l.evidence ??
                          l.attempts.at(-1)?.evidence ??
                          'excluded by the scope policy'}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </LaunchSection>
  );
}

function LeafDetail({
  leaf,
  tree,
  stage,
  color,
  onReplay,
}: {
  leaf: Leaf;
  tree: AttackTree;
  stage: FixStage;
  color: string;
  onReplay: () => void;
}) {
  const cls = tree.classes.find((c) => c.testType === leaf.testType);
  const fix = leaf.state === 'fixed' ? tree.fix : null;
  const diff = fix?.diff
    .split('\n')
    .filter((line) => line.startsWith('+') || line.startsWith('-'))
    .filter((line) => !line.startsWith('+++') && !line.startsWith('---'))
    .slice(0, 9);

  return (
    <div className="leaf" key={leafKey(leaf)}>
      <div className="leaf__chips">
        <span className="chip" data-tone="ember">
          {cls?.label ?? leaf.testType}
        </span>
        {leaf.severity && (
          <span className="chip" data-tone={leaf.severity === 'critical' ? 'blood' : 'ember'}>
            {leaf.severity}
          </span>
        )}
        <span className="leaf__state" style={{ color }}>
          {leaf.state === 'fixed' && stage !== 'verified'
            ? stage === 'patched'
              ? 'Patched · verifying…'
              : 'Exploitable · confirmed'
            : STATE_LABEL[leaf.state]}
        </span>
      </div>
      <h3 className="leaf__route">
        <code>{leaf.endpoint}</code>
      </h3>

      {leaf.evidence && (
        <blockquote className="leaf__quote">
          <span className="eyebrow">What the oracle saw, replayed with fresh users</span>
          <p>{leaf.evidence}</p>
        </blockquote>
      )}
      {leaf.state === 'blocked' && (
        <p className="leaf__note">
          Janus refused these requests itself: the path is excluded by the scope policy, because
          Juice Shop serves its own answers there. An agent never reads a target&apos;s ground
          truth.
        </p>
      )}

      {leaf.attempts.length > 0 && (
        <ol className="leaf__term" aria-label="Requests">
          {leaf.attempts.map((a, i) => (
            <li key={i} style={{ ['--i' as string]: i }}>
              <span className="leaf__n">#{a.number}</span>
              <span>{leaf.endpoint.split(' ')[0]}</span>
              <span className="leaf__status">{a.status ?? '—'}</span>
              <span data-ok={a.exploitable === true}>
                {a.exploitable === null
                  ? 'stopped by scope'
                  : a.exploitable
                    ? 'exploitable'
                    : 'not exploitable'}
              </span>
            </li>
          ))}
        </ol>
      )}

      {fix && (
        <div className="leaf__fix">
          <ol className="lifecycle" data-stage={stage}>
            <li data-done="true">Exploited</li>
            <li data-done={stage !== 'exploited'}>Patched in {fix.iterations} iteration</li>
            <li data-done={stage === 'verified'}>Verified</li>
          </ol>
          <pre className="leaf__diff">
            {diff?.map((line, i) => (
              <span key={i} data-sign={line[0]}>
                {line.length > 92 ? `${line.slice(0, 92)}…` : line}
                {'\n'}
              </span>
            ))}
          </pre>
          <ul className="leaf__checks" data-show={stage === 'verified'}>
            {fix.verifications.map((v, i) => (
              <li key={v.verifier} style={{ ['--i' as string]: i }}>
                <span aria-hidden>{v.passed ? '✓' : '✗'}</span> <b>{v.verifier}</b> {v.details}
              </li>
            ))}
          </ul>
          <button type="button" className="leaf__replay" onClick={onReplay}>
            Replay the fix
          </button>
        </div>
      )}
    </div>
  );
}
