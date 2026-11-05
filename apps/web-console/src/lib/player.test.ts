import { describe, expect, it } from 'vitest';

import { sampleRun } from '@/test-support/sample-run';

import { initialPlayerState, MAX_GAP_MS, nextDelayMs, playerReducer } from './player';

const events = sampleRun();

describe('player in replay mode', () => {
  const loaded = playerReducer(initialPlayerState('replay'), { type: 'received', events });

  it('starts playing from the beginning with nothing shown', () => {
    expect(loaded).toMatchObject({ cursor: 0, playing: true, speed: 1, mode: 'replay' });
    expect(loaded.events).toHaveLength(events.length);
  });

  it('shows one more event per tick and stops at the end', () => {
    let state = loaded;
    for (let i = 0; i < events.length; i++) state = playerReducer(state, { type: 'tick' });

    expect(state.cursor).toBe(events.length);
    expect(state.playing).toBe(false);
    expect(nextDelayMs(state)).toBeNull();
  });

  it('waits the real gap between events divided by the speed, capped at MAX_GAP_MS', () => {
    const atStep = { ...loaded, cursor: 3 }; // next event (seq 3) is 0.5 s after seq 2
    expect(nextDelayMs(atStep)).toBe(500);
    expect(nextDelayMs(playerReducer(atStep, { type: 'speed', speed: 4 }))).toBe(125);

    const beforeLongGap = { ...loaded, cursor: 4 }; // seq 4 is 10 s after seq 3
    expect(nextDelayMs(beforeLongGap)).toBe(MAX_GAP_MS);
    expect(nextDelayMs(playerReducer(beforeLongGap, { type: 'speed', speed: 16 }))).toBe(
      MAX_GAP_MS / 16,
    );
  });

  it('shows the first event right away', () => {
    expect(nextDelayMs(loaded)).toBe(0);
  });

  it('pauses, resumes and does not tick while paused', () => {
    const paused = playerReducer(loaded, { type: 'pause' });

    expect(nextDelayMs(paused)).toBeNull();
    expect(playerReducer(paused, { type: 'play' }).playing).toBe(true);
  });

  it('jumps to a seq, showing every event up to and including it', () => {
    const jumped = playerReducer(loaded, { type: 'seek', seq: 4 });

    expect(jumped.cursor).toBe(5);
    expect(playerReducer(loaded, { type: 'seek', seq: 999 }).cursor).toBe(events.length);
  });

  it('restarts from the beginning when play is pressed at the end', () => {
    const ended = { ...loaded, cursor: events.length, playing: false };

    expect(playerReducer(ended, { type: 'play' })).toMatchObject({ cursor: 0, playing: true });
  });
});

describe('player in live mode', () => {
  it('follows the newest event while playing', () => {
    let state = initialPlayerState('live');
    state = playerReducer(state, { type: 'received', events: events.slice(0, 3) });
    expect(state.cursor).toBe(3);
    state = playerReducer(state, { type: 'received', events: events.slice(3) });
    expect(state.cursor).toBe(events.length);
  });

  it('freezes the view while paused and catches up on play', () => {
    let state = playerReducer(initialPlayerState('live'), {
      type: 'received',
      events: events.slice(0, 2),
    });
    state = playerReducer(state, { type: 'pause' });
    state = playerReducer(state, { type: 'received', events: events.slice(2) });
    expect(state.cursor).toBe(2);

    expect(playerReducer(state, { type: 'play' }).cursor).toBe(events.length);
  });

  it('ignores duplicates and keeps events ordered by seq', () => {
    const state = playerReducer(initialPlayerState('live'), {
      type: 'received',
      events: [events[2], events[0], events[1], events[0]].filter((e) => e !== undefined),
    });

    expect(state.events.map((event) => event.seq)).toEqual([0, 1, 2]);
  });
});
