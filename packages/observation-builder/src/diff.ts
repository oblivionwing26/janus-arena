import type { ObservationLine } from './prune.js';

function keyed(lines: readonly ObservationLine[]): Map<string, ObservationLine> {
  const result = new Map<string, ObservationLine>();
  const seen = new Map<string, number>();
  for (const line of lines) {
    if (line.kind === 'element') {
      result.set(line.ref, line);
      continue;
    }
    const base = `${line.kind}\u0000${line.text}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    result.set(`${base}\u0000${String(count)}`, line);
  }
  return result;
}

/**
 * What changed between two observations of the same page: changed controls (same ref,
 * different state) first, then removed lines, then added ones. Empty when nothing changed.
 */
export function diffLines(
  previous: readonly ObservationLine[],
  current: readonly ObservationLine[],
): string[] {
  const before = keyed(previous);
  const after = keyed(current);
  const changed: string[] = [];
  const added: string[] = [];
  for (const [key, line] of after) {
    const old = before.get(key);
    if (old === undefined) added.push(`+ ${line.text}`);
    else if (old.text !== line.text) changed.push(`~ ${line.text}`);
  }
  const removed = [...before]
    .filter(([key]) => !after.has(key))
    .map(([, line]) => `- ${line.text}`);
  return [...changed, ...removed, ...added];
}
