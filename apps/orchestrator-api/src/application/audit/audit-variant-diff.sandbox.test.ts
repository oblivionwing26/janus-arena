// F2.7 "Done when", local only (`pnpm test:sandbox`; Docker and network, no API spend): on a
// real ShopLab clone, a variant B with a flaw injected on purpose (a new endpoint that demands a
// session but reads any order by its id) is blocked by the differential audit, and a harmless
// variant B (the UI Engineer's coupon fix of F2.3) passes. Real Semgrep, gitleaks,
// dependency-cruiser and surface map on both sides.

import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { newUlid } from '@janus/shared-kernel';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { JanusBranch } from '../../domain/vcs/janus-branch.js';
import { DepcruiseAnalysis } from '../../infrastructure/analysis/depcruise-analysis.js';
import { GitleaksAnalysis } from '../../infrastructure/analysis/gitleaks-analysis.js';
import { SemgrepAnalysis } from '../../infrastructure/analysis/semgrep-analysis.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { loadSandboxDefinition } from '../../infrastructure/sandbox/sandbox-definition.js';
import {
  loadSurfaceConfig,
  repoSurfaceConfigPath,
} from '../../infrastructure/surface/surface-config.js';
import { TypeScriptAttackSurface } from '../../infrastructure/surface/typescript-attack-surface.js';
import { LocalGitAdapter } from '../../infrastructure/vcs/local-git-adapter.js';
import { AuditVariantDiff, type AuditVariantDiffResult } from './audit-variant-diff.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const MINUTES = 60_000;
const vcs = new LocalGitAdapter();
const created: VcsWorkspace[] = [];

// The flaw, on purpose: a session is demanded, but the order is read by its id alone.
const INJECTED_IDOR = [
  'diff --git a/src/app/api/orders/[id]/invoice/route.ts b/src/app/api/orders/[id]/invoice/route.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/src/app/api/orders/[id]/invoice/route.ts',
  '@@ -0,0 +1,17 @@',
  "+import { NextResponse, type NextRequest } from 'next/server';",
  '+',
  "+import { db } from '@/lib/db';",
  "+import { handle, requireUser } from '@/lib/http';",
  '+',
  '+interface Context {',
  '+  params: Promise<{ id: string }>;',
  '+}',
  '+',
  '+export function GET(request: NextRequest, { params }: Context) {',
  '+  return handle(async () => {',
  '+    await requireUser(request);',
  '+    const order = await db().order.findUnique({ where: { id: Number((await params).id) } });',
  '+    return NextResponse.json({ invoice: order });',
  '+  });',
  '+}',
  '+',
  '',
].join('\n');
// The checkout may have CRLF line endings (core.autocrlf); patches need LF.
const COUPON_FIX = readFileSync(
  `${root}recordings/fixtures/ui-engineer/ux-2/expected.diff`,
  'utf8',
).replace(/\r\n/g, '\n');

let shoplab: Awaited<ReturnType<typeof loadSandboxDefinition>>;
let audit: AuditVariantDiff;

/** A variant B: ShopLab main plus a patch, committed on janus/variant-<id> in a local clone. */
async function variant(patch: string): Promise<{ repo: string; ref: string }> {
  const runId = newUlid();
  const workspace = await vcs.clone(shoplab.repo, {
    runId,
    ref: 'main',
    excludeFiles: shoplab.excludeFiles,
  });
  created.push(workspace);
  const branch = JanusBranch.variant(runId);
  await vcs.branch(workspace, branch);
  await vcs.applyPatch(workspace, patch);
  await vcs.commit(workspace, 'variant B for the differential audit test');
  return { repo: workspace.url, ref: branch };
}

async function run(patch: string): Promise<AuditVariantDiffResult> {
  const result = await audit.execute({
    runId: newUlid(),
    repo: shoplab.repo,
    excludeFiles: shoplab.excludeFiles,
    base: { ref: 'main' },
    variant: await variant(patch),
  });
  created.push(...result.workspaces);
  return result;
}

beforeAll(async () => {
  shoplab = await loadSandboxDefinition('shoplab');
  const surface = (await loadSurfaceConfig(repoSurfaceConfigPath())).shoplab;
  if (surface === undefined) throw new Error('no surface config for shoplab');
  const docker = new DockerCli();
  audit = new AuditVariantDiff({
    vcs,
    tools: [
      new SemgrepAnalysis(docker, `${root}rules/semgrep`),
      new GitleaksAnalysis(docker),
      new DepcruiseAnalysis(`${root}config/arch/shoplab.depcruise.cjs`),
    ],
    surface: new TypeScriptAttackSurface(surface),
    store: new InMemoryEventStore(),
  });
}, MINUTES);

afterAll(async () => {
  for (const workspace of created) await rm(workspace.path, { recursive: true, force: true });
});

describe('F2.7 done when: the differential audit blocks a variant with an injected flaw', () => {
  it(
    'blocks B when it adds an endpoint with a session but no owner check',
    async () => {
      const result = await run(INJECTED_IDOR);
      console.log(result.verdict.reasons.join('\n'));

      expect(result.endpoints).toContainEqual(
        expect.objectContaining({ change: 'new-idor-lead', severity: 'high' }),
      );
      expect(result.endpoints[0]?.endpoint).toMatchObject({
        method: 'GET',
        route: '/api/orders/:id/invoice',
        auth: true,
        ownerCheck: false,
      });
      expect(result.verdict.blocked).toBe(true);
    },
    20 * MINUTES,
  );

  it(
    'lets a harmless B pass: the UI Engineer coupon fix introduces nothing',
    async () => {
      const result = await run(COUPON_FIX);

      expect(result.findings).toEqual([]);
      expect(result.endpoints).toEqual([]);
      expect(result.verdict).toEqual({ blocked: false, high: 0, critical: 0, reasons: [] });
    },
    20 * MINUTES,
  );
});
