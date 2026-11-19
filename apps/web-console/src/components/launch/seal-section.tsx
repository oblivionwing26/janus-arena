'use client';

import { useEffect, useRef, useState } from 'react';

import {
  verifyReport,
  type CheckId,
  type CheckResult,
  type DsseEnvelope,
  type StoredEvent,
} from '@/lib/verify-report';

import { JanusMark } from '../ui/janus-mark';
import { LaunchSection } from './launch-section';
import { useReducedMotion } from './use-reduced-motion';

const BASE = '/demo/verify/';
const GATE = 'docs/reports/gate-01M79YYR766FTNCYF5STGZ3ANY/dual-report.json';
const RED_RUN = '01M79ZA35SZ9QRNF6K3AAGXNQN';

const CHECKS: { id: CheckId; label: string; what: string }[] = [
  { id: 'signature', label: 'Signature', what: 'ECDSA P-256 over the exact bytes of the report' },
  {
    id: 'attestation',
    label: 'Attestation',
    what: 'an in-toto statement in a DSSE envelope, signed by the same key',
  },
  {
    id: 'report-digest',
    label: 'Report digest',
    what: 'the attestation names this report by its SHA-256',
  },
  {
    id: 'event-logs',
    label: 'Event logs',
    what: 'every run the report was built from, re-hashed from its events',
  },
];

type Forgery = 'none' | 'cost' | 'severity' | 'event';

const FORGERIES: { id: Exclude<Forgery, 'none'>; label: string; what: string }[] = [
  { id: 'cost', label: 'Lower the cost', what: 'totalEur 0.82 → 0.02' },
  { id: 'severity', label: 'Hide the critical finding', what: 'severity critical → low' },
  { id: 'event', label: 'Rewrite what the oracle saw', what: 'one event in the Red Team log' },
];

interface Loaded {
  reportText: string;
  signature: string;
  attestation: DsseEnvelope;
  publicPem: string;
  eventLogs: Record<string, StoredEvent[]>;
}

async function load(): Promise<Loaded> {
  const get = async (f: string) => {
    const r = await fetch(`${BASE}${f}`);
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.text();
  };
  const [reportText, signature, attestation, publicPem] = await Promise.all([
    get('dual-report.json'),
    get('dual-report.json.sig'),
    get('dual-report.intoto.json'),
    get('janus.pub'),
  ]);
  const report = JSON.parse(reportText) as { eventLogs: { runId: string }[] };
  const logs = await Promise.all(
    report.eventLogs.map(async ({ runId }) => {
      const r = await fetch(`/demo/runs/${runId}.json`);
      const run = (await r.json()) as { events: StoredEvent[] };
      return [runId, run.events] as const;
    }),
  );
  return {
    reportText,
    signature,
    attestation: JSON.parse(attestation) as DsseEnvelope,
    publicPem,
    eventLogs: Object.fromEntries(logs),
  };
}

function forge(
  base: Loaded,
  f: Forgery,
): { reportText: string; eventLogs: Record<string, StoredEvent[]> } {
  if (f === 'cost') {
    return {
      reportText: base.reportText.replace(/"totalEur": 0\.8/, '"totalEur": 0.0'),
      eventLogs: base.eventLogs,
    };
  }
  if (f === 'severity') {
    return {
      reportText: base.reportText.replace('"severity": "critical"', '"severity": "low"'),
      eventLogs: base.eventLogs,
    };
  }
  if (f === 'event') {
    const red = (base.eventLogs[RED_RUN] ?? []).map((e) =>
      e.type === 'finding.confirmed'
        ? {
            ...e,
            payload: {
              ...(e.payload as Record<string, unknown>),
              evidence: 'nothing was reachable',
            },
          }
        : e,
    );
    return { reportText: base.reportText, eventLogs: { ...base.eventLogs, [RED_RUN]: red } };
  }
  return { reportText: base.reportText, eventLogs: base.eventLogs };
}

/** A digest pair, with the first differing character onwards marked. */
function Digest({ expected, actual }: { expected: string; actual: string }) {
  const n = 20;
  const e = expected.slice(0, n);
  const a = actual.slice(0, n);
  let i = 0;
  while (i < n && e[i] === a[i]) i++;
  return (
    <span className="digest">
      <span>
        signed <code>{e}…</code>
      </span>
      <span data-same={e === a}>
        now&nbsp;&nbsp;&nbsp;&nbsp;
        <code>
          {a.slice(0, i)}
          <mark>{a.slice(i)}</mark>…
        </code>
      </span>
    </span>
  );
}

export function SealSection() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [forgery, setForgery] = useState<Forgery>('none');
  const [verdict, setVerdict] = useState<{ forgery: Forgery; results: CheckResult[] } | null>(null);
  const [reveal, setReveal] = useState<{ forgery: Forgery; n: number }>({ forgery: 'none', n: 0 });
  const [started, setStarted] = useState(false);
  const section = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    let alive = true;
    load()
      .then((d) => alive && setData(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [started]);

  // Each verification is keyed by the forgery it ran on; a stale one reads as still verifying.
  useEffect(() => {
    if (!data) return;
    let alive = true;
    const { reportText, eventLogs } = forge(data, forgery);
    void verifyReport(window.crypto.subtle, {
      reportBytes: new TextEncoder().encode(reportText),
      signature: data.signature,
      attestation: data.attestation,
      publicPem: data.publicPem,
      eventLogs,
    }).then((out) => {
      if (alive) setVerdict({ forgery, results: out });
    });
    return () => {
      alive = false;
    };
  }, [data, forgery]);

  const results = verdict?.forgery === forgery ? verdict.results : null;
  const revealed = reveal.forgery === forgery ? reveal.n : 0;
  const shown = reduced && results ? results.length : revealed;

  // Reveal the checks one by one; the verdicts are already computed.
  useEffect(() => {
    if (!results || reduced || revealed >= results.length) return;
    const t = window.setTimeout(() => setReveal({ forgery, n: revealed + 1 }), 520);
    return () => clearTimeout(t);
  }, [results, revealed, reduced, forgery]);

  const done = results !== null && shown >= results.length;
  const valid = done && results.every((r) => r.ok);
  const state = !results || !done ? 'verifying' : valid ? 'valid' : 'broken';
  const firstProblem = results?.flatMap((r) => r.problems)[0];

  return (
    <LaunchSection
      id="trust"
      title={
        <>
          Do not trust it. <em>Verify it.</em>
        </>
      }
      lede="Every gate ends in one signed report for both faces. This page checks it right here, with your browser's own cryptography: the same four checks as pnpm janus verify, on the real files. Then try to forge it."
      sources={[GATE, 'keys/janus.pub']}
    >
      <div className="seal-wrap" ref={section}>
        <div className="seal-stage glass" data-state={state}>
          <svg className="seal" viewBox="0 0 300 300" aria-hidden>
            <defs>
              <path
                id="seal-ring"
                d="M 150 150 m -128 0 a 128 128 0 1 1 256 0 a 128 128 0 1 1 -256 0"
              />
              <linearGradient id="seal-holo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--aurora)" />
                <stop offset="0.5" stopColor="var(--gold)" />
                <stop offset="1" stopColor="var(--ember)" />
              </linearGradient>
            </defs>
            <g className="seal__spin">
              <circle
                cx="150"
                cy="150"
                r="140"
                fill="none"
                stroke="url(#seal-holo)"
                strokeWidth="1.2"
                strokeDasharray="2 5"
              />
              <text className="seal__ringtext">
                <textPath href="#seal-ring">
                  SIGNED · ECDSA P-256 · IN-TOTO · DSSE ·{' '}
                  {data ? Object.keys(data.eventLogs).length : 4} EVENT LOGS · JANUS ·
                </textPath>
              </text>
            </g>
            {CHECKS.map((c, i) => {
              const r = results?.[i];
              const st =
                !r || i >= shown
                  ? i === shown && results
                    ? 'running'
                    : 'pending'
                  : r.ok
                    ? 'ok'
                    : 'fail';
              const a0 = -90 + i * 90 + 4;
              const a1 = a0 + 82;
              const p = (a: number) => {
                const rad = (a * Math.PI) / 180;
                return `${150 + 108 * Math.cos(rad)} ${150 + 108 * Math.sin(rad)}`;
              };
              return (
                <path
                  key={c.id}
                  className="seal__arc"
                  data-st={st}
                  d={`M ${p(a0)} A 108 108 0 0 1 ${p(a1)}`}
                />
              );
            })}
            {state === 'broken' && (
              <path
                className="seal__crack"
                d="M 150 46 L 138 98 L 162 126 L 140 166 L 158 196 L 146 254"
              />
            )}
          </svg>
          <div className="seal__core">
            <JanusMark size={92} />
          </div>
          <p className="seal__verdict" role="status">
            {failed
              ? 'The signed files could not be loaded'
              : state === 'verifying'
                ? 'Verifying in your browser…'
                : state === 'valid'
                  ? 'Verified in your browser'
                  : 'Forgery detected'}
          </p>
          {state === 'broken' && firstProblem && <p className="seal__why">{firstProblem}</p>}
        </div>

        <div className="seal-side">
          <ol className="checks">
            {CHECKS.map((c, i) => {
              const r = results?.[i];
              const st = !r || i >= shown ? 'pending' : r.ok ? 'ok' : 'fail';
              return (
                <li key={c.id} className="check" data-st={st}>
                  <span className="check__icon" aria-hidden>
                    {st === 'ok' ? '✓' : st === 'fail' ? '✗' : '·'}
                  </span>
                  <span className="check__label">{c.label}</span>
                  <span className="check__what">{c.what}</span>
                  {st !== 'pending' && r?.detail && r.detail.length > 0 && (
                    <span className="check__detail">
                      {r.detail.map((d, k) => (
                        <Digest key={k} expected={d.expected} actual={d.actual} />
                      ))}
                    </span>
                  )}
                  {st === 'fail' &&
                    r?.problems.map((p) => (
                      <span key={p} className="check__problem">
                        {p}
                      </span>
                    ))}
                </li>
              );
            })}
          </ol>

          <div className="forge">
            <p className="eyebrow">Try to forge it</p>
            <div className="forge__buttons" role="group" aria-label="Forgeries">
              {FORGERIES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={forgery === f.id}
                  onClick={() => setForgery(forgery === f.id ? 'none' : f.id)}
                  disabled={!data}
                >
                  <b>{f.label}</b>
                  <span>{f.what}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="forge__reset"
              onClick={() => setForgery('none')}
              disabled={forgery === 'none'}
            >
              Restore the original
            </button>
          </div>

          <p className="seal-files">
            The files:{' '}
            {[
              'dual-report.json',
              'dual-report.json.sig',
              'dual-report.intoto.json',
              'janus.pub',
            ].map((f) => (
              <a key={f} href={`${BASE}${f}`}>
                {f}
              </a>
            ))}
            . Or offline:{' '}
            <code>
              cosign verify-blob --key janus.pub --signature dual-report.json.sig
              --insecure-ignore-tlog dual-report.json
            </code>
          </p>
        </div>
      </div>
    </LaunchSection>
  );
}
