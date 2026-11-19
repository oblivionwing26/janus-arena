// Phase 7 of the launch page, "a benchmark without makeup": the Juice Shop benchmark report
// (docs/reports/benchmark-juice-shop.md) read into data. Pure: markdown in, figures out.

export interface BenchRound {
  round: number;
  solved: number;
  total: number;
  recall: number;
  lo: number;
  hi: number;
  withoutSideEffects: number;
  reference: string;
  findings: number;
  seconds: number;
  run: string;
}

export interface BenchCategory {
  name: string;
  classes: string[];
  challenges: number;
  everyRound: number;
  someRound: number;
}

export interface BenchChallenge {
  name: string;
  category: string;
  difficulty: number;
  classes: string[];
  solvedRounds: number;
  rounds: number;
  sideEffect: boolean;
}

export interface Benchmark {
  target: string;
  rounds: BenchRound[];
  categories: BenchCategory[];
  challenges: BenchChallenge[];
  reference: { name: string; solvedRounds: number; rounds: number }[];
  controlRun: string | null;
}

function table(md: string, heading: string): string[][] {
  const start = md.indexOf(heading);
  if (start === -1) return [];
  const lines = md.slice(start).split('\n').slice(1);
  const rows: string[][] = [];
  let seen = false;
  for (const line of lines) {
    if (line.startsWith('|')) {
      seen = true;
      rows.push(
        line
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim()),
      );
    } else if (seen) {
      break;
    }
  }
  // drop the header and the separator
  return rows.slice(2);
}

const num = (s: string | undefined) => Number.parseFloat((s ?? '').replace(',', '.'));
const fraction = (s: string | undefined): [number, number] => {
  const m = /(\d+)\/(\d+)/.exec(s ?? '');
  return [Number(m?.[1] ?? 0), Number(m?.[2] ?? 0)];
};

export function parseBenchmark(md: string): Benchmark {
  const target = /^# Janus benchmark: (.+)$/m.exec(md)?.[1]?.trim() ?? 'unknown';

  const rounds = table(md, '## Result').map((c) => {
    const [solved, total] = fraction(c[1]);
    const interval = /\[([\d.]+) %, ([\d.]+) %\]/.exec(c[2] ?? '');
    return {
      round: Number(c[0]),
      solved,
      total,
      recall: num(/= ([\d.]+) %/.exec(c[1] ?? '')?.[1]),
      lo: num(interval?.[1]),
      hi: num(interval?.[2]),
      withoutSideEffects: fraction(c[3])[0],
      reference: c[4] ?? '',
      findings: Number(c[5]),
      seconds: num(c[6]),
      run: (c[8] ?? '').replace(/`/g, ''),
    };
  });

  const categories = table(md, '## By category').map((c) => ({
    name: c[0] ?? '',
    classes: (c[1] ?? '').split(',').map((s) => s.trim()),
    challenges: Number(c[2]),
    everyRound: Number(c[3]),
    someRound: Number(c[4]),
  }));

  const challenges = table(md, '## Challenge by challenge').map((c) => {
    const [solvedRounds, rounds] = fraction(c[4]);
    const sideEffect = (c[0] ?? '').includes('(side effect');
    return {
      name: (c[0] ?? '').replace(/\s*\(side effect.*\)$/, ''),
      category: c[1] ?? '',
      difficulty: [...(c[2] ?? '')].filter((ch) => ch === '★').length,
      classes: (c[3] ?? '').split(',').map((s) => s.trim()),
      solvedRounds,
      rounds,
      sideEffect,
    };
  });

  const reference = table(md, '## Reference challenges').map((c) => {
    const [solvedRounds, rounds] = fraction(c[1]);
    return { name: (c[0] ?? '').replace(/\s*\(`.*`\)$/, ''), solvedRounds, rounds };
  });

  const controlRun = /Control round: run `([^`]+)`/.exec(md)?.[1] ?? null;

  return { target, rounds, categories, challenges, reference, controlRun };
}
