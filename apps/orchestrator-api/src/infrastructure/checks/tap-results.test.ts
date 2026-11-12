import { describe, expect, it } from 'vitest';

import { tapResults } from './tap-results.js';

// What the runner prints: a `# janus-file` line per file, then Node's TAP for that file.
const OUTPUT = [
  '# janus-file test/api/basket.test.ts',
  'TAP version 13',
  '# Subtest: /rest/basket/:id',
  '    # Subtest: GET existing basket by id is not allowed via public API',
  '    ok 1 - GET existing basket by id is not allowed via public API',
  '      ---',
  '      duration_ms: 12.3',
  '      ...',
  '    # Subtest: GET existing basket of another user',
  '    not ok 2 - GET existing basket of another user',
  '      ---',
  "      error: 'Expected values to be strictly equal'",
  '      ...',
  'not ok 1 - /rest/basket/:id',
  '# Subtest: top-level test',
  'ok 2 - top-level test',
  '1..2',
  '# janus-file test/api/angular-dist.test.ts',
  'TAP version 13',
  '# Subtest: test/api/angular-dist.test.ts',
  'not ok 1 - test/api/angular-dist.test.ts',
  '1..1',
  '# janus-file test/server/order.unit.test.ts',
  'TAP version 13',
  '# Subtest: placeOrder',
  '    # Subtest: nested',
  '        # Subtest: deep',
  '        ok 1 - deep # SKIP not here',
  '    ok 1 - nested',
  'ok 1 - placeOrder',
].join('\n');

describe('tapResults (F3.5, V2)', () => {
  it('names each leaf test by its file and suites, with its result', () => {
    expect(Object.fromEntries(tapResults(OUTPUT))).toEqual({
      'test/api/basket.test.ts > /rest/basket/:id > GET existing basket by id is not allowed via public API':
        'pass',
      'test/api/basket.test.ts > /rest/basket/:id > GET existing basket of another user': 'fail',
      'test/api/basket.test.ts > top-level test': 'pass',
      // A file that fails before any test runs counts as one failing test.
      'test/api/angular-dist.test.ts > (file)': 'fail',
      'test/server/order.unit.test.ts > placeOrder > nested > deep': 'pass',
    });
  });

  it('reads nothing from output without file markers', () => {
    expect(tapResults('ok 1 - x').size).toBe(0);
  });
});
