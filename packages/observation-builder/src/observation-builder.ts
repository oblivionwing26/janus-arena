import { estimateTokens } from './count-tokens.js';
import { diffLines } from './diff.js';
import { prune, type ObservationLine } from './prune.js';
import { parseCapture } from './raw-capture.js';
import { RefRegistry, type ElementLocator } from './ref-registry.js';
import { visibleTexts } from './visible-texts.js';

export interface Observation {
  /** `full` the first time and after navigating; otherwise `diff` when it is shorter. */
  readonly mode: 'full' | 'diff';
  /** What the agent reads this step. */
  readonly text: string;
  /** The complete observation of the page, whatever `mode` is. */
  readonly full: string;
  /** Estimated tokens of `text`. */
  readonly tokens: number;
  /** Every ref in this observation and how to find its element again. */
  readonly locators: ReadonlyMap<string, ElementLocator>;
  /** Texts of the page's `alert` notices, such as form validation errors. */
  readonly alerts: readonly string[];
  /** Plain texts on the page (headings, prose, control names), at most 40 (F2.2). */
  readonly texts: readonly string[];
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

/**
 * Turns page captures into what the navigator agent reads. One instance per agent session:
 * it keeps refs stable across steps and diffs each page against the previous observation.
 * Pure: no browser, no I/O.
 */
export class ObservationBuilder {
  private readonly registry = new RefRegistry();
  private previous: { readonly path: string; readonly lines: readonly ObservationLine[] } | null =
    null;

  observe(input: unknown): Observation {
    const capture = parseCapture(input);
    const { lines, locators, alerts } = prune(capture, this.registry);
    const path = pathOf(capture.url);
    const header = `page ${path} · ${JSON.stringify(capture.title)}`;
    const full = [header, ...lines.map((line) => line.text)].join('\n');

    let text = full;
    if (this.previous?.path === path) {
      const changes = diffLines(this.previous.lines, lines);
      const diff = [
        `${header} · changes since the last step:`,
        ...(changes.length === 0 ? ['(no changes)'] : changes),
      ].join('\n');
      if (diff.length < full.length) text = diff;
    }
    this.previous = { path, lines };

    return {
      mode: text === full ? 'full' : 'diff',
      text,
      full,
      tokens: estimateTokens(text),
      locators,
      alerts,
      texts: visibleTexts(lines, locators),
    };
  }
}
