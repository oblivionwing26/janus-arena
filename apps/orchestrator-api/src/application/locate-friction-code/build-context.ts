import { estimateTokens } from '@janus/observation-builder';

import { pageFilesFor } from './next-routes.js';
import type { CodeCandidate } from './rank-candidates.js';
import type { ZoneHints } from './zone-hints.js';

export interface CodeSnippet {
  readonly path: string;
  /** 1-based, inclusive. */
  readonly startLine: number;
  readonly endLine: number;
  /** The lines, each prefixed with its number. */
  readonly text: string;
}

export interface CodeContext {
  readonly snippets: readonly CodeSnippet[];
  /** Estimated tokens of every snippet together. */
  readonly tokens: number;
  /** Candidates whose snippets did not fit in the budget. */
  readonly omitted: readonly string[];
}

const AROUND = 3;
const PAGE_HEAD = 40;

function windows(lines: readonly string[], hits: readonly number[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const hit of [...hits].sort((a, b) => a - b)) {
    const start = Math.max(0, hit - AROUND);
    const end = Math.min(lines.length - 1, hit + AROUND);
    const last = ranges.at(-1);
    if (last !== undefined && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  return ranges;
}

/**
 * A compact view of the best candidates (F2.2): the lines around each text of the zone, ±3,
 * merged when they overlap, and the imports of the page that renders the route. Whole files
 * only when nothing matched in a short page. Stops at `maxTokens`.
 */
export function buildContext(
  hints: ZoneHints,
  candidates: readonly CodeCandidate[],
  sources: ReadonlyMap<string, string>,
  options: { readonly maxFiles?: number; readonly maxTokens?: number } = {},
): CodeContext {
  const maxTokens = options.maxTokens ?? 6000;
  const needles = [...new Set([hints.element?.name ?? '', ...hints.texts, ...hints.alerts])].filter(
    (text) => text !== '',
  );
  const pages = new Set(pageFilesFor(hints.route, [...sources.keys()]));

  const snippets: CodeSnippet[] = [];
  const omitted: string[] = [];
  let tokens = 0;
  for (const candidate of candidates.slice(0, options.maxFiles ?? 5)) {
    const lines = (sources.get(candidate.path) ?? '').split('\n');
    const hits = lines.flatMap((line, index) =>
      needles.some((needle) => line.includes(needle)) ? [index] : [],
    );
    if (pages.has(candidate.path)) {
      const imports = lines.flatMap((line, index) => (/^import\s/.test(line) ? [index] : []));
      if (hits.length === 0) hits.push(...lines.slice(0, PAGE_HEAD).map((_, index) => index));
      else hits.push(...imports);
    }
    const parts = windows(lines, hits).map(([start, end]) => ({
      path: candidate.path,
      startLine: start + 1,
      endLine: end + 1,
      text: lines
        .slice(start, end + 1)
        .map((line, offset) => `${String(start + offset + 1).padStart(4)}| ${line}`)
        .join('\n'),
    }));
    const cost = parts.reduce((sum, part) => sum + estimateTokens(part.text), 0);
    if (parts.length === 0) continue;
    if (tokens + cost > maxTokens) {
      omitted.push(candidate.path);
      continue;
    }
    snippets.push(...parts);
    tokens += cost;
  }
  return { snippets, tokens, omitted };
}
