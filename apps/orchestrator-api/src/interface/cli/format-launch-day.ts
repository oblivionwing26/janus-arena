import { isKnownEvent, type JanusEvent, type UnknownEvent } from '@janus/shared-kernel';
import { launchDayCurves, type LaunchDayVariant } from '@janus/synthlab-report';

/** One Launch Day run (F4.1) as the report reads it: what each variant ran with, and its curves. */
export interface LaunchDayRun {
  readonly runId: string;
  /** The settings each variant ran with, from run.started. */
  readonly settings: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Whether the shoppers had an address of their own, shared a few, or the run gave none. */
  readonly addresses: 'distinct' | 'shared' | 'none';
  readonly variants: readonly LaunchDayVariant[];
}

export interface LaunchDayReport {
  readonly format: 'janus-launch-day-report';
  readonly version: 1;
  readonly runs: readonly LaunchDayRun[];
}

/** A setting that is how the target is run, not a defense: it makes addresses count. */
const NOT_A_DEFENSE = new Set(['SHOPLAB_TRUST_FORWARDED_FOR']);

/** The defenses a variant ran with, in words; `none` when it had none. */
export function describeDefenses(settings: Readonly<Record<string, string>> | undefined): string {
  const parts = Object.entries(settings ?? {})
    .filter(([key]) => !NOT_A_DEFENSE.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      switch (key) {
        case 'SHOPLAB_RATE_LIMIT_IP':
          return `rate limit per client ${value}`;
        case 'SHOPLAB_RATE_LIMIT_ACCOUNT':
          return `rate limit per account ${value}`;
        case 'SHOPLAB_STEP_UP_CHECKOUT':
          return `checkout step-up (${value})`;
        default:
          return `${key}=${value}`;
      }
    });
  return parts.length === 0 ? 'none' : parts.join(' + ');
}

/** One run's report row, from its events only. */
export function launchDayRunOf(
  runId: string,
  events: readonly (JanusEvent | UnknownEvent)[],
): LaunchDayRun {
  const known = events.filter(isKnownEvent);
  const started = known.find((event) => event.type === 'run.started');
  const settings: Record<string, Record<string, string>> = {};
  if (started?.type === 'run.started') {
    for (const variant of started.payload.variants ?? []) {
      settings[variant.key] = { ...(variant.env ?? {}) };
    }
  }
  // A pair presents the same address on both variants and a retried session keeps its slot's, so
  // addresses are counted per slot (persona, task and seed) within a variant.
  const byVariant = new Map<string, Map<string, string | undefined>>();
  for (const event of known) {
    if (event.type === 'session.started' && event.payload.role === 'legitimate') {
      const { variant, persona, task, seed, client } = event.payload;
      const slots = byVariant.get(variant) ?? new Map<string, string | undefined>();
      slots.set(`${persona ?? ''}#${task ?? ''}#${String(seed)}`, client);
      byVariant.set(variant, slots);
    }
  }
  const groups = [...byVariant.values()].map((slots) => [...slots.values()]);
  const addresses: LaunchDayRun['addresses'] = groups.every((clients) =>
    clients.every((client) => client === undefined),
  )
    ? 'none'
    : groups.some((clients) => new Set(clients).size < clients.length)
      ? 'shared'
      : 'distinct';
  return { runId, settings, addresses, variants: launchDayCurves(events).variants };
}

const pct = (share: number) => `${String(Math.round(share * 100))} %`;
const rate = (value: LaunchDayVariant['legitimate']['success']) =>
  value === null
    ? '—'
    : `${pct(value.rate)} (${pct(value.low)}–${pct(value.high)}, ${String(value.successes)}/${String(value.n)})`;
const steps = (value: LaunchDayVariant | undefined) =>
  value?.legitimate.medianSteps === null || value === undefined
    ? '—'
    : String(value.legitimate.medianSteps);
const plain = (value: LaunchDayVariant['legitimate']['success']) =>
  value === null ? '—' : pct(value.rate);

/**
 * The Launch Day report (F4.1c) as Markdown: a summary line per run (what the defense did to the
 * attacks, to the shoppers' success and to how many shoppers it blocked), then each run's variants
 * with intervals. All numbers come from the events; nothing is written by a model.
 */
export function formatLaunchDay(report: LaunchDayReport): string {
  const summary = report.runs.map((run) => {
    const [a, b] = run.variants;
    const defense = describeDefenses(Object.values(run.settings).at(-1));
    return `| ${defense} | ${run.addresses} | ${plain(a?.attacks.success ?? null)} → ${plain(b?.attacks.success ?? null)} | ${plain(a?.legitimate.success ?? null)} → ${plain(b?.legitimate.success ?? null)} | ${plain(a?.legitimate.blocked ?? null)} → ${plain(b?.legitimate.blocked ?? null)} | ${steps(a)} → ${steps(b)} |`;
  });
  const details = report.runs.flatMap((run) => [
    `## ${describeDefenses(Object.values(run.settings).at(-1))} · addresses ${run.addresses}`,
    '',
    `Run \`${run.runId}\`.`,
    '',
    '| Variant | Defenses | Shoppers | Shopper success | Shoppers blocked | Median steps | Attack success | Contaminated |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...run.variants.map(
      (each) =>
        `| ${each.variant.toUpperCase()} | ${describeDefenses(run.settings[each.variant])} | ${String(each.legitimate.sessions)} | ${rate(each.legitimate.success)} | ${rate(each.legitimate.blocked)} | ${each.legitimate.medianSteps === null ? '—' : String(each.legitimate.medianSteps)} | ${rate(each.attacks.success)} | ${String(each.contaminated)} |`,
    ),
    '',
    ...run.variants.flatMap((each) =>
      each.attacks.byTask.map(
        (task) =>
          `- ${each.variant.toUpperCase()} · ${task.task}: ${String(task.exploitable)}/${String(task.verdicts)} exploitable${task.refusedAfter.length === 0 ? ', never refused' : `, refused after ${task.refusedAfter.join(', ')} answered requests`}.`,
      ),
    ),
    '',
  ]);
  return [
    '# Launch Day: what a defense does to abuse and to the shoppers it protects',
    '',
    'Synthetic shoppers (personas) and saboteurs on ShopLab, variant A without the defense and B with it. ' +
      'Rates are synthetic task success with 95 % Wilson intervals, not predictions of real revenue. ' +
      'Attack success is the share of saboteurs that nothing stopped, as a deterministic oracle judged it.',
    '',
    '| Defense (variant B) | Addresses | Attack success A → B | Shopper success A → B | Shoppers blocked A → B | Median steps A → B |',
    '| --- | --- | --- | --- | --- | --- |',
    ...summary,
    '',
    ...details,
  ].join('\n');
}
