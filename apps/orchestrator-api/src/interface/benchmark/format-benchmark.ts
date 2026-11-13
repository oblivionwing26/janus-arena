import { wilsonInterval } from '@janus/stats';

import type { RunBenchmarkResult } from '../../application/benchmark/run-benchmark.js';
import type { BenchmarkSpec } from '../../domain/benchmark/benchmark-spec.js';

export interface BenchmarkMeta {
  /** The exact command that produced the report. */
  readonly command: string;
  readonly target: string;
  readonly image: string;
  readonly janusCommit: string;
  readonly generatedAt: string;
}

const percent = (rate: number) => `${(rate * 100).toFixed(1)} %`;
const interval = (successes: number, n: number) => {
  const { low, high } = wilsonInterval(successes, n);
  return `[${percent(low)}, ${percent(high)}]`;
};
const seconds = (ms: number) => {
  const total = Math.round(ms / 1000);
  return total < 60
    ? `${String(total)} s`
    : `${String(Math.floor(total / 60))} min ${String(total % 60)} s`;
};
const cell = (text: string) => text.replace(/\|/g, '\\|');

/** Challenges a Janus request solved without the engine meaning to attack them, and why. */
function sideEffectLines(challenges: RunBenchmarkResult['score']['challenges']): string[] {
  const solved = challenges.filter((each) => each.sideEffect !== null && each.solvedRounds > 0);
  if (solved.length === 0) return ['None of the challenges solved is listed as a side effect.'];
  return [
    'Solved, and counted, because a Janus request did solve them; but not an attack the engine means to make. The recall is also given without them.',
    '',
    ...solved.map(
      (each) =>
        `- **${each.name}** (${String(each.solvedRounds)} rounds): ${each.sideEffect ?? ''}`,
    ),
  ];
}

/**
 * The benchmark report (F3.11) as Markdown: the command that reproduces it, the recall of every
 * round with its Wilson interval, the breakdown by category and by challenge, what was left out
 * of the count and why. Every figure comes from the rounds; no model writes any of it.
 */
export function formatBenchmark(
  meta: BenchmarkMeta,
  spec: BenchmarkSpec,
  outcome: RunBenchmarkResult,
): string {
  const { score, rounds, control } = outcome;
  const n = score.inScope;
  const runs = rounds.length;
  const solvedEvery = score.challenges.filter((each) => each.solvedRounds === runs).length;
  const solvedSome = score.challenges.filter((each) => each.solvedRounds > 0).length;
  const lines: string[] = [];
  const add = (...text: string[]) => lines.push(...text);

  add(
    `# Janus benchmark: ${meta.target}`,
    '',
    'Reproduce it with:',
    '',
    '```bash',
    meta.command,
    '```',
    '',
    '| | |',
    '| --- | --- |',
    `| Target | \`${meta.image}\` |`,
    `| Janus | \`${meta.janusCommit}\` |`,
    `| Generated | ${meta.generatedAt} |`,
    `| Rounds | ${String(runs)} attack rounds, each on a fresh instance, after one control round with no attack |`,
    `| Attacks | the deterministic engine (ADR 0011), every class: no model is called, so the cost is the sandbox's time only |`,
    '',
    '## Result',
    '',
    `Recall on the **${String(n)} challenges** Juice Shop files under the categories where a Red Team class acts, as Juice Shop itself marks them solved after each round.`,
    '',
    '| Round | Recall | 95 % interval (Wilson) | Without side effects | Reference challenges | Findings confirmed | Time | Cost | Red Team run |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...score.rounds.map((round, index) => {
      const result = rounds[index];
      return `| ${String(index + 1)} | ${String(round.solved)}/${String(n)} = ${percent(round.solved / n)} | ${interval(round.solved, n)} | ${String(round.solvedOnPurpose)}/${String(n)} = ${percent(round.solvedOnPurpose / n)} | ${String(round.referenceSolved)}/${String(round.referenceTotal)} | ${String(result?.findings.length ?? 0)} | ${seconds(result?.durationMs ?? 0)} | ${(result?.costEur ?? 0).toFixed(2)} € | \`${result?.runId ?? ''}\` |`;
    }),
    '',
    `Solved in **every** round: ${String(solvedEvery)} of ${String(n)}. Solved in **at least one**: ${String(solvedSome)} of ${String(n)}.`,
    '',
    'How to read it:',
    '',
    '- The denominator includes challenges no class even tries (a chatbot, a captcha, a forged token): the recall is on what Juice Shop files under those categories, not on what the engine was built to do.',
    '- The interval is over the set of challenges (a Wilson interval for a proportion of `n` challenges). The rounds are repeats of a deterministic engine, so they are expected to agree; a disagreement would be a real instability.',
    '- A challenge counts when Juice Shop marks it solved after the round and had not marked it solved after the control. Janus does not say which request solved it.',
    '- This is a ceiling of recall, not a measure of how many vulnerabilities Juice Shop has: the engine only generates the attacks it was programmed for.',
    '',
    '## By category',
    '',
    '| Category | Classes that act | Challenges | Solved in every round | Solved in some round | Recall (some round) |',
    '| --- | --- | --- | --- | --- | --- |',
    ...score.categories.map(
      (each) =>
        `| ${cell(each.category)} | ${each.classes.join(', ')} | ${String(each.total)} | ${String(each.solvedAll)} | ${String(each.solvedAny)} | ${percent(each.solvedAny / each.total)} |`,
    ),
    '',
    '## Reference challenges',
    '',
    'The challenges the engine was built around (F3.2), apart from the rest.',
    '',
    '| Challenge | Solved in rounds |',
    '| --- | --- |',
    ...score.reference.map(
      (each) =>
        `| ${cell(each.name)} (\`${each.key}\`) | ${String(each.solvedRounds)}/${String(runs)} |`,
    ),
    '',
    '## Challenge by challenge',
    '',
    '| Challenge | Category | Difficulty | Classes that act | Solved in rounds |',
    '| --- | --- | --- | --- | --- |',
    ...[...score.challenges]
      .sort(
        (a, b) =>
          a.category.localeCompare(b.category) ||
          a.difficulty - b.difficulty ||
          a.name.localeCompare(b.name),
      )
      .map(
        (each) =>
          `| ${cell(each.name)}${each.incidental ? ' (solved by the control: not counted)' : ''}${each.sideEffect === null || each.solvedRounds === 0 ? '' : ' (side effect, see below)'} | ${cell(each.category)} | ${'★'.repeat(each.difficulty)} | ${each.classes.join(', ')} | ${String(each.solvedRounds)}/${String(runs)} |`,
      ),
    '',
    '## Side effects',
    '',
    ...sideEffectLines(score.challenges),
    '',
    '## Not counted',
    '',
  );
  if (score.incidental.length === 0) add('- **Solved by the control**: none.');
  else {
    add(
      `- **Solved by the control** (the target was up and nobody attacked it): ${score.incidental.map((each) => `${each.name} (${each.category})`).join(', ')}.`,
    );
  }
  if (score.outside.length === 0) {
    add('- **Solved outside the categories in scope**: none.');
  } else {
    add(
      `- **Solved outside the categories in scope** (reported, never counted): ${score.outside.map((each) => `${each.name} (${each.category}, ${String(each.solvedRounds)}/${String(runs)})`).join(', ')}.`,
    );
  }
  add(
    '',
    `Categories in scope: ${Object.keys(spec.categories).join(', ')} (config/benchmarks.yaml). Control round: run \`${control.runId}\`, ${seconds(control.durationMs)}.`,
    '',
    'Not run: Nuclei, ZAP baseline and the Argus subset (optional in the roadmap). Nuclei and ZAP crawl the target and would read its own ground truth (`/api/Challenges`, `/snippets/**`), and none of the three is an approved dependency.',
    '',
  );
  return lines.join('\n');
}

/** The same rounds as structured data, next to the Markdown. */
export function benchmarkJson(
  meta: BenchmarkMeta,
  spec: BenchmarkSpec,
  outcome: RunBenchmarkResult,
): Record<string, unknown> {
  const n = outcome.score.inScope;
  return {
    ...meta,
    spec,
    inScope: n,
    control: {
      runId: outcome.control.runId,
      durationMs: outcome.control.durationMs,
      solved: outcome.controlSolved,
    },
    rounds: outcome.rounds.map((round, index) => ({
      runId: round.runId,
      findings: round.findings,
      durationMs: round.durationMs,
      costEur: round.costEur,
      solved: outcome.score.rounds[index]?.solved ?? 0,
      solvedOnPurpose: outcome.score.rounds[index]?.solvedOnPurpose ?? 0,
      referenceSolved: outcome.score.rounds[index]?.referenceSolved ?? 0,
      interval: wilsonInterval(outcome.score.rounds[index]?.solved ?? 0, n),
    })),
    categories: outcome.score.categories,
    reference: outcome.score.reference,
    challenges: outcome.score.challenges,
    outside: outcome.score.outside,
    incidental: outcome.score.incidental,
  };
}
