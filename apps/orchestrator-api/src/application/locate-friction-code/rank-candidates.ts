import { localImports, pageFilesFor } from './next-routes.js';
import type { ZoneHints } from './zone-hints.js';

export interface CodeCandidate {
  readonly path: string;
  readonly score: number;
  /** Why the file is here, for whoever reviews the result. */
  readonly reasons: readonly string[];
}

const WEIGHT = { page: 5, imported: 2, element: 3, text: 1 } as const;

/**
 * Source files worth searching (F2.2): code only. Tests, dependencies, build output, generated
 * code and every document (UX_FLAWS.md included, whatever the workspace hides) are left out.
 */
export function isCodeFile(path: string): boolean {
  if (!/\.(?:tsx|ts|jsx|js)$/.test(path) || path.endsWith('.d.ts')) return false;
  if (/(?:^|\/)(?:node_modules|\.next|dist|build|coverage|generated|__tests__)\//.test(path)) {
    return false;
  }
  return !/\.(?:test|spec)\.[jt]sx?$/.test(path) && !/ux_flaws/i.test(path);
}

/**
 * Ranks the target's files for a friction zone (F2.2), deterministically: the page that
 * renders the route (+5), the components it imports directly (+2), a file holding the element's
 * accessible name (+3) and one point per other text or alert of the zone it holds. Ties go to
 * the path in alphabetical order.
 */
export function rankCandidates(
  hints: ZoneHints,
  sources: ReadonlyMap<string, string>,
): CodeCandidate[] {
  const paths = [...sources.keys()].filter(isCodeFile).sort();
  const scores = new Map<string, { score: number; reasons: string[] }>();
  const add = (path: string, points: number, reason: string) => {
    const entry = scores.get(path) ?? { score: 0, reasons: [] };
    entry.score += points;
    entry.reasons.push(reason);
    scores.set(path, entry);
  };

  for (const page of pageFilesFor(hints.route, paths)) {
    add(page, WEIGHT.page, `renders ${hints.route}`);
    for (const imported of localImports(page, sources.get(page) ?? '', paths)) {
      add(imported, WEIGHT.imported, `imported by ${page}`);
    }
  }

  const name = hints.element?.name;
  const texts = [...new Set([...hints.texts, ...hints.alerts])].filter((text) => text !== name);
  for (const path of paths) {
    const content = sources.get(path) ?? '';
    if (name !== undefined && name !== '' && content.includes(name)) {
      add(path, WEIGHT.element, `contains the element name ${JSON.stringify(name)}`);
    }
    const found = texts.filter((text) => content.includes(text));
    if (found.length > 0) {
      add(
        path,
        found.length * WEIGHT.text,
        `contains ${String(found.length)} page text(s): ${found
          .slice(0, 5)
          .map((text) => JSON.stringify(text))
          .join(', ')}`,
      );
    }
  }

  return [...scores]
    .map(([path, { score, reasons }]) => ({ path, score, reasons }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}
