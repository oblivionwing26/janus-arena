import type { ObservationLine } from './prune.js';
import type { ElementLocator } from './ref-registry.js';

export const MAX_TEXTS = 40;

/**
 * The plain texts a shopper sees on the page, in order and without duplicates: headings,
 * notices, prose (table rows split into cells) and the accessible names of the controls. Kept
 * with each step (F2.2) so friction can be traced back to the code that renders those texts.
 */
export function visibleTexts(
  lines: readonly ObservationLine[],
  locators: ReadonlyMap<string, ElementLocator>,
): string[] {
  const texts = new Set<string>();
  const add = (value: string) => {
    const clean = value.trim().replace(/:$/, '').trim();
    if (clean !== '') texts.add(clean);
  };
  for (const line of lines) {
    if (texts.size >= MAX_TEXTS) break;
    switch (line.kind) {
      case 'element':
        add(locators.get(line.ref)?.name ?? '');
        break;
      case 'heading':
        add(line.text.replace(/^#+ /, ''));
        break;
      case 'notice': {
        const quoted = /^! \S+ (".*")$/.exec(line.text)?.[1];
        add(quoted === undefined ? '' : String(JSON.parse(quoted)));
        break;
      }
      case 'text':
        for (const cell of line.text.split(' | ')) add(cell);
        break;
    }
  }
  return [...texts].slice(0, MAX_TEXTS);
}
