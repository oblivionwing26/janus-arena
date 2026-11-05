import type { ConsoleEvent } from './console-event';

export type PlayerMode = 'live' | 'replay';
export type PlayerSpeed = 1 | 4 | 16;
export const SPEEDS: readonly PlayerSpeed[] = [1, 4, 16];

/** Longest real-time gap a replay waits for between two events, before dividing by speed. */
export const MAX_GAP_MS = 2000;

export interface PlayerState {
  readonly mode: PlayerMode;
  /** Every event received so far, by seq, without duplicates. */
  readonly events: readonly ConsoleEvent[];
  /** How many of `events` are shown. */
  readonly cursor: number;
  readonly playing: boolean;
  readonly speed: PlayerSpeed;
}

export type PlayerAction =
  | { readonly type: 'received'; readonly events: readonly ConsoleEvent[] }
  | { readonly type: 'play' }
  | { readonly type: 'pause' }
  | { readonly type: 'speed'; readonly speed: PlayerSpeed }
  | { readonly type: 'seek'; readonly seq: number }
  | { readonly type: 'tick' };

export function initialPlayerState(mode: PlayerMode): PlayerState {
  return { mode, events: [], cursor: 0, playing: true, speed: 1 };
}

function merge(current: readonly ConsoleEvent[], incoming: readonly ConsoleEvent[]) {
  const bySeq = new Map(current.map((event) => [event.seq, event]));
  for (const event of incoming) if (!bySeq.has(event.seq)) bySeq.set(event.seq, event);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * The one state machine behind every run view. In live mode the cursor follows the newest
 * event while playing; in replay mode it advances on `tick`, paced by nextDelayMs.
 */
export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'received': {
      const events = merge(state.events, action.events);
      const follow = state.mode === 'live' && state.playing;
      return { ...state, events, cursor: follow ? events.length : state.cursor };
    }
    case 'play': {
      if (state.mode === 'live') return { ...state, playing: true, cursor: state.events.length };
      const atEnd = state.cursor >= state.events.length;
      return { ...state, playing: true, cursor: atEnd ? 0 : state.cursor };
    }
    case 'pause':
      return { ...state, playing: false };
    case 'speed':
      return { ...state, speed: action.speed };
    case 'seek': {
      const index = state.events.findIndex((event) => event.seq >= action.seq);
      if (index === -1) return { ...state, cursor: state.events.length };
      const exact = state.events[index]?.seq === action.seq;
      return { ...state, cursor: exact ? index + 1 : index };
    }
    case 'tick': {
      const cursor = Math.min(state.cursor + 1, state.events.length);
      const ended = state.mode === 'replay' && cursor >= state.events.length;
      return { ...state, cursor, playing: ended ? false : state.playing };
    }
  }
}

/** Milliseconds until the next replay tick, or null when nothing should tick. */
export function nextDelayMs(state: PlayerState): number | null {
  if (state.mode !== 'replay' || !state.playing) return null;
  const next = state.events[state.cursor];
  if (next === undefined) return null;
  const previous = state.events[state.cursor - 1];
  if (previous === undefined) return 0;
  const gap = Date.parse(next.ts) - Date.parse(previous.ts);
  return Math.min(Math.max(gap, 0), MAX_GAP_MS) / state.speed;
}
