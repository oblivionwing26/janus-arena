'use client';

import Link from 'next/link';
import type { RefObject } from 'react';

import data from '@/lib/gate-board.data.json';
import { formatDuration, formatEur, type GateTrack } from '@/lib/gate-board';
import type { Face } from '@/lib/pipeline-data';

const GATES: readonly { label: string; track: GateTrack }[] = [
  { label: 'ShopLab gate', track: data.shoplab as GateTrack },
  { label: 'Juice Shop gate', track: data.juice as GateTrack },
];

export const GATE_BOARD_SOURCES = GATES.map(
  (g) => `apps/web-console/public/demo/runs/${g.track.gateRunId}.json`,
);

const short = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`;

interface BoardStation {
  key: string;
  face: Face;
  name: string;
}

/**
 * The pipeline as two real gates ran it: one row per station, one lane per gate, each bar placed on
 * the gate's own clock. The active station opens its runs, or the reason the gate skipped it.
 */
export function GateBoard({
  stations,
  active,
  onJump,
  boardRef,
}: {
  stations: readonly BoardStation[];
  active: number;
  onJump: (i: number) => void;
  boardRef: RefObject<HTMLDivElement | null>;
}) {
  const current = stations[active];

  return (
    <div ref={boardRef} className="board">
      <div className="board__head">
        <span className="board__corner">Two real gates, one clock each</span>
        {GATES.map(({ label, track }) => (
          <div key={track.gateRunId} className="board__lane-head">
            <b>{label}</b>
            <span>
              {formatDuration(track.seconds)} · {formatEur(track.spentEur)} of{' '}
              {formatEur(track.budgetEur)}
            </span>
            <Link href={`/runs/${track.gateRunId}`}>Replay the gate →</Link>
          </div>
        ))}
      </div>

      <ol className="board__rows">
        {stations.map((s, i) => (
          <li
            key={s.key}
            className="board__row"
            data-face={s.face}
            data-on={i <= active}
            data-here={i === active}
          >
            <button type="button" className="board__name" onClick={() => onJump(i)}>
              <span className="board__num">{String(i + 1).padStart(2, '0')}</span>
              {s.name}
            </button>
            {GATES.map(({ track }) => {
              const row = track.stages[i];
              if (!row) return <span key={track.gateRunId} />;
              const ran = row.status === 'completed';
              const left = (row.at / track.seconds) * 100;
              const width = Math.max(0.8, (row.seconds / track.seconds) * 100);
              return (
                <div key={track.gateRunId} className="board__cell" data-status={row.status}>
                  <span className="board__track" aria-hidden>
                    <span
                      className="board__bar"
                      style={{ left: `${Math.min(left, 99.2)}%`, width: `${width}%` }}
                    />
                  </span>
                  <span className="board__meta">
                    {ran ? (
                      <>
                        {formatDuration(row.seconds)}
                        {row.spentEur !== null && row.spentEur > 0 && (
                          <> · {formatEur(row.spentEur)}</>
                        )}
                      </>
                    ) : (
                      row.status
                    )}
                  </span>
                </div>
              );
            })}
          </li>
        ))}
      </ol>

      {current && (
        <div className="board__detail" aria-live="polite">
          <span className="board__corner">{current.name}</span>
          {GATES.map(({ label, track }) => {
            const row = track.stages[active];
            if (!row) return <span key={track.gateRunId} />;
            return (
              <div key={track.gateRunId} className="board__detail-cell" data-status={row.status}>
                <span className="sr-only">{label}: </span>
                {row.status === 'completed' ? (
                  <>
                    {row.runIds.length === 0 && !row.pr && (
                      <span>written by code, no run of its own</span>
                    )}
                    {row.runIds.map((id) => (
                      <Link key={id} href={`/runs/${id}`}>
                        Replay run {short(id)} →
                      </Link>
                    ))}
                    {row.pr && (
                      <a href={row.pr.url} target="_blank" rel="noreferrer">
                        Pull request #{row.pr.number} →
                      </a>
                    )}
                    {row.allowanceEur !== null && (
                      <span>allowance {formatEur(row.allowanceEur)}</span>
                    )}
                  </>
                ) : (
                  <span className="board__reason">{row.reason}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
