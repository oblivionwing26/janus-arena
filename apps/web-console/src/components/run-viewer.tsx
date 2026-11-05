'use client';

import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';

import { summarizeCost } from '@/lib/cost';
import {
  initialPlayerState,
  nextDelayMs,
  playerReducer,
  SPEEDS,
  type PlayerMode,
} from '@/lib/player';
import type { RunEventSource } from '@/lib/sources';
import { buildTimeline } from '@/lib/timeline';
import type { ConsoleEvent } from '@/lib/console-event';

import { CostPanel } from './cost-panel';
import { TimelineView } from './timeline-view';

interface RunViewerProps {
  source: RunEventSource;
  mode: PlayerMode;
  /** Extra controls (export, open offline) that get the events received so far. */
  actions?: (events: readonly ConsoleEvent[]) => ReactNode;
}

/**
 * The only component that renders a run, whatever its source: live SSE or a recording
 * (CLAUDE.md: live view and replay use the same rendering code).
 */
export function RunViewer({ source, mode, actions }: RunViewerProps) {
  const [state, dispatch] = useReducer(playerReducer, mode, initialPlayerState);
  const [status, setStatus] = useState<'loading' | 'streaming' | 'ended' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [seekTo, setSeekTo] = useState('');

  useEffect(() => {
    return source.start({
      onEvents: (events) => {
        setStatus((current) => (current === 'loading' ? 'streaming' : current));
        dispatch({ type: 'received', events });
      },
      onEnd: () => {
        setStatus('ended');
      },
      onError: (message) => {
        setError(message);
        setStatus('error');
      },
    });
  }, [source]);

  const delay = nextDelayMs(state);
  useEffect(() => {
    if (delay === null) return;
    const timer = setTimeout(() => {
      dispatch({ type: 'tick' });
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [delay, state.cursor]);

  const visible = useMemo(() => state.events.slice(0, state.cursor), [state.events, state.cursor]);
  const allTypes = useMemo(() => buildTimeline(state.events).types, [state.events]);
  const shownTypes = useMemo(
    () => new Set(allTypes.filter((type) => !hidden.has(type))),
    [allTypes, hidden],
  );
  const timeline = useMemo(() => buildTimeline(visible, shownTypes), [visible, shownTypes]);
  const cost = useMemo(() => summarizeCost(visible), [visible]);
  const lastSeq = state.events.at(-1)?.seq;

  return (
    <div className="run-viewer">
      <section className="toolbar" aria-label="Reproductor">
        <span className={`badge badge-${status}`}>
          {mode === 'live' ? 'En vivo' : 'Replay'} ·{' '}
          {
            { loading: 'cargando', streaming: 'recibiendo', ended: 'completo', error: 'error' }[
              status
            ]
          }
        </span>
        {state.playing ? (
          <button type="button" onClick={() => dispatch({ type: 'pause' })}>
            Pausa
          </button>
        ) : (
          <button type="button" onClick={() => dispatch({ type: 'play' })}>
            Play
          </button>
        )}
        {mode === 'replay' && (
          <div className="speeds" role="group" aria-label="Velocidad">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                aria-pressed={state.speed === speed}
                onClick={() => dispatch({ type: 'speed', speed })}
              >
                {speed}×
              </button>
            ))}
          </div>
        )}
        <form
          className="seek"
          onSubmit={(event) => {
            event.preventDefault();
            const seq = Number(seekTo);
            if (Number.isInteger(seq)) dispatch({ type: 'seek', seq });
          }}
        >
          <label>
            Ir a seq
            <input
              type="number"
              min={0}
              value={seekTo}
              onChange={(event) => setSeekTo(event.target.value)}
            />
          </label>
          <button type="submit">Ir</button>
        </form>
        <span className="position">
          {state.cursor} / {state.events.length} eventos
          {lastSeq === undefined ? '' : ` · último seq ${String(lastSeq)}`}
        </span>
        {actions?.(state.events)}
      </section>

      {error !== null && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <section aria-label="Filtro por tipo" className="filters">
        {allTypes.map((type) => (
          <label key={type}>
            <input
              type="checkbox"
              checked={!hidden.has(type)}
              onChange={(event) => {
                const next = new Set(hidden);
                if (event.target.checked) next.delete(type);
                else next.add(type);
                setHidden(next);
              }}
            />
            {type}
          </label>
        ))}
      </section>

      <div className="run-body">
        <TimelineView timeline={timeline} />
        <CostPanel cost={cost} />
      </div>
    </div>
  );
}
