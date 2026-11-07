// F2.2 "Done when" (`pnpm test:integration`, needs network): for each flaw seeded in ShopLab,
// the zone the heatmap puts it in (F1.10, from the scripted probes' recorded run) leads to one
// of the flaw's real files among the top 3 candidates. The flaw → file table below is ground
// truth for this test only; it never reaches LocateFrictionCode or any agent.

import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { newUlid, parseRunExport, type FrictionZone } from '@janus/shared-kernel';
import { frictionZones } from '@janus/synthlab-report';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { loadSandboxDefinition } from '../../infrastructure/sandbox/sandbox-definition.js';
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import { LocalGitAdapter } from '../../infrastructure/vcs/local-git-adapter.js';
import { LocateFrictionCode } from './locate-friction-code.js';

const ROUTES = ['/products/:slug', '/orders/:id'];
const { events } = parseRunExport(
  readFileSync(
    new URL(
      '../../../../../packages/synthlab-report/fixtures/flaw-probes-f110.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const zones = frictionZones(events, { routes: ROUTES, top: 5 });
const zoneWith = (route: string, detector: string): FrictionZone => {
  const zone = zones.find(
    (candidate) =>
      candidate.route === route && candidate.detectors.some((entry) => entry.detector === detector),
  );
  if (zone === undefined) throw new Error(`no ${detector} zone on ${route} in the top 5`);
  return zone;
};

// "Main code" of each flaw in janus-shoplab's UX_FLAWS.md, and the zone the probes put it in.
const FLAWS = [
  {
    flaw: 'UX-1 shipping only at checkout',
    zone: () => zoneWith('/checkout', 'backtrack'),
    files: ['src/app/cart/page.tsx', 'src/components/totals-table.tsx'],
  },
  {
    flaw: 'UX-2 hidden coupon field',
    zone: () => zoneWith('/cart', 'extra-steps'),
    files: ['src/app/cart/page.tsx', 'src/components/more-options.tsx'],
  },
  {
    flaw: 'UX-3 sign-up form cleared on error',
    zone: () => zoneWith('/register', 'form-error'),
    files: ['src/app/register/page.tsx', 'src/components/json-form.tsx'],
  },
];

const runId = newUlid();
const vcs = new LocalGitAdapter();
let workspace: VcsWorkspace;

beforeAll(async () => {
  const shoplab = await loadSandboxDefinition('shoplab');
  workspace = await vcs.clone(shoplab.repo, {
    runId,
    ref: 'main',
    excludeFiles: shoplab.excludeFiles,
  });
}, 120_000);

afterAll(async () => {
  await rm(join(workspacesRoot(), runId), { recursive: true, force: true });
});

describe('locating the code behind each seeded ShopLab flaw', () => {
  for (const { flaw, zone, files } of FLAWS) {
    it(`${flaw}: a real file is among the top 3 candidates`, async () => {
      const found = await new LocateFrictionCode({ vcs }).execute({
        zone: zone(),
        events,
        workspace,
        routes: ROUTES,
      });
      const top = found.candidates.slice(0, 3).map((candidate) => candidate.path);
      console.log(
        `${flaw}\n${found.candidates
          .slice(0, 5)
          .map(
            (candidate) =>
              `  ${String(candidate.score)} ${candidate.path}: ${candidate.reasons.join('; ')}`,
          )
          .join('\n')}\n  context: ${String(found.context.tokens)} tokens`,
      );

      expect(top.some((path) => files.includes(path))).toBe(true);
      expect(found.context.tokens).toBeLessThanOrEqual(6000);
      expect(JSON.stringify(found)).not.toMatch(/UX_FLAWS|UX-[123]/);
    });
  }
});
