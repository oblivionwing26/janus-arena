// The launch page's "close the hole, lose the customer" simulation, as pure state. Shoppers and
// attackers walk from arrival to checkout; with the defense on, a shield at checkout stops every
// attacker and turns away the share of shoppers the recorded Launch Day run measured.

export type Kind = 'shopper' | 'attacker';
export type Fate = 'walking' | 'through' | 'stopped';

export interface Walker {
  id: number;
  kind: Kind;
  /** Position along the path, 0 (arrival) to 1 (done). */
  x: number;
  /** Lateral offset in the lane, -1 to 1. */
  lane: number;
  speed: number;
  fate: Fate;
  /** Whether the shield would turn this walker away (decided at spawn, so it is reproducible). */
  wouldBlock: boolean;
  /** Seconds since the walker hit the shield, for the bounce. */
  bounce: number;
}

export interface SimRates {
  /** Share of attackers that get through with the defense on (0-1). */
  attackPassWithDefense: number;
  /** Share of shoppers the defense turns away (0-1). */
  shopperBlockWithDefense: number;
  /** Share of arrivals that are attackers. */
  attackerShare: number;
}

export const SHIELD_X = 0.74;
const WINDOW = 60;
/** Below this many outcomes a share would mislead, so it reads as unknown. */
export const MIN_SAMPLE = 12;

export interface Sim {
  walkers: Walker[];
  defense: boolean;
  /** Last outcomes per kind (true = got through), newest last. */
  outcomes: Record<Kind, boolean[]>;
  nextId: number;
  spawnClock: number;
  rand: () => number;
  rates: SimRates;
}

export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createSim(rates: SimRates, seed = 42): Sim {
  return {
    walkers: [],
    defense: false,
    outcomes: { shopper: [], attacker: [] },
    nextId: 0,
    spawnClock: 0,
    rand: seeded(seed),
    rates,
  };
}

function record(sim: Sim, kind: Kind, through: boolean) {
  const list = sim.outcomes[kind];
  list.push(through);
  if (list.length > WINDOW) list.shift();
}

/** Switching the defense starts the counts afresh, so the numbers show this state only. */
export function setDefense(sim: Sim, on: boolean) {
  if (sim.defense === on) return;
  sim.defense = on;
  sim.outcomes = { shopper: [], attacker: [] };
}

export function step(sim: Sim, dt: number, spawnEvery = 0.12) {
  const { rand, rates } = sim;
  sim.spawnClock += dt;
  while (sim.spawnClock >= spawnEvery) {
    sim.spawnClock -= spawnEvery;
    const kind: Kind = rand() < rates.attackerShare ? 'attacker' : 'shopper';
    const blockShare =
      kind === 'attacker' ? 1 - rates.attackPassWithDefense : rates.shopperBlockWithDefense;
    sim.walkers.push({
      id: sim.nextId++,
      kind,
      x: 0,
      lane: rand() * 2 - 1,
      speed: kind === 'attacker' ? 0.32 + rand() * 0.1 : 0.16 + rand() * 0.08,
      fate: 'walking',
      wouldBlock: rand() < blockShare,
      bounce: 0,
    });
  }
  for (const w of sim.walkers) {
    if (w.fate === 'stopped') {
      w.bounce += dt;
      w.x -= dt * 0.12;
      continue;
    }
    const before = w.x;
    w.x += w.speed * dt;
    if (w.fate === 'walking' && before < SHIELD_X && w.x >= SHIELD_X) {
      if (sim.defense && w.wouldBlock) {
        w.fate = 'stopped';
        w.x = SHIELD_X;
        record(sim, w.kind, false);
      } else {
        w.fate = 'through';
        record(sim, w.kind, true);
      }
    }
  }
  sim.walkers = sim.walkers.filter((w) => w.x <= 1.04 && w.bounce < 1.4);
}

/** Share (0-100) of attackers that got through and of shoppers turned away, over the window. */
export function liveRates(sim: Sim): {
  attacksThrough: number | null;
  shoppersBlocked: number | null;
} {
  const pct = (list: boolean[], value: boolean) =>
    list.length < MIN_SAMPLE
      ? null
      : Math.round((100 * list.filter((v) => v === value).length) / list.length);
  return {
    attacksThrough: pct(sim.outcomes.attacker, true),
    shoppersBlocked: pct(sim.outcomes.shopper, false),
  };
}
