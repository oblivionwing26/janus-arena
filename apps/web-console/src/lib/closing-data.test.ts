import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CLAIMS, FINOPS, LINKS, NPM_INSTALL, PRICES } from './closing-data';

const repo = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, repo), 'utf8');

describe('what Janus does not claim', () => {
  it.each(CLAIMS.map((c) => [c.instead, c] as const))('"%s" is backed by its file', (_, c) => {
    expect(read(c.source)).toContain(c.evidence);
  });
});

describe('prices', () => {
  const ledger = read(FINOPS).split('\n');

  it.each(PRICES.map((p) => [p.what, p] as const))('%s matches its FinOps row', (_, p) => {
    const row = ledger.find((line) => line.includes(p.row));
    expect(row).toBeDefined();
    // The last cell holds the price, with "(total)" when it covers a whole command.
    expect(row?.split('|').at(-2)?.trim().replace(' (total)', '')).toBe(p.eur);
  });
});

describe('links', () => {
  it('are the ones the README publishes', () => {
    const readme = read('README.md');
    for (const href of [LINKS.demo, LINKS.video, LINKS.npm, ...LINKS.articles.map((a) => a.href)]) {
      expect(readme).toContain(href);
    }
    expect(readme).toContain(LINKS.repo);
    expect(read('packages/friction-engine/README.md')).toContain(NPM_INSTALL);
  });
});
