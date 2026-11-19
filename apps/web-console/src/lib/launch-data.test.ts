import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { allSourced, sourceUrl } from './launch-data';

const repo = new URL('../../../../', import.meta.url);

describe('launch page figures', () => {
  const figures = allSourced();

  it('has figures to check', () => {
    expect(figures.length).toBeGreaterThanOrEqual(8);
  });

  it.each(figures.map((f) => [f.source, f.evidence] as const))(
    '%s contains "%s"',
    (source, evidence) => {
      const text = readFileSync(new URL(source, repo), 'utf8');
      expect(text).toContain(evidence);
    },
  );

  it('links a source to the repository on GitHub', () => {
    expect(sourceUrl('docs/reports/x.md')).toBe(
      'https://github.com/oblivionwing26/janus-arena/blob/main/docs/reports/x.md',
    );
  });
});
