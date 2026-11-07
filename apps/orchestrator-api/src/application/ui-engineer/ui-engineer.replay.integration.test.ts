// F2.3 "Done when", replayed (`pnpm test:integration`: clones ShopLab, never calls the API).
// The UI Engineer's real answers for the three seeded flaws were recorded with
// `pnpm run:ui-engineer --record recordings/fixtures/ui-engineer/<flaw>`; replaying them over the
// same zone, code and screenshot must produce the same patches. Docker is not used here: the
// checks are scripted to pass (the real ones passed when the run was recorded).

import { existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { newUlid, parseRunExport } from '@janus/shared-kernel';
import { frictionZones } from '@janus/synthlab-report';
import { afterAll, describe, expect, it } from 'vitest';

import { Budget } from '../../domain/llm/budget.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { ScriptedBuildChecks } from '../../infrastructure/checks/scripted-build-checks.js';
import { InMemoryEventStore } from '../../infrastructure/event-store/in-memory-event-store.js';
import { AnthropicGateway } from '../../infrastructure/llm/anthropic-gateway.js';
import { loadModelsConfig, repoModelsConfigPath } from '../../infrastructure/llm/models-config.js';
import { RecordedLLMAdapter } from '../../infrastructure/llm/recorded-llm-adapter.js';
import { loadSandboxDefinition } from '../../infrastructure/sandbox/sandbox-definition.js';
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import { LocalGitAdapter } from '../../infrastructure/vcs/local-git-adapter.js';
import { LlmEventObserver } from '../llm-event-observer.js';
import { ProposeVariant } from './propose-variant.js';

const ROUTES = ['/products/:slug', '/orders/:id'];
const fixtures = fileURLToPath(
  new URL('../../../../../recordings/fixtures/ui-engineer/', import.meta.url),
);
const { events } = parseRunExport(
  readFileSync(
    new URL(
      '../../../../../packages/synthlab-report/fixtures/flaw-probes-f110.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const zones = frictionZones(events, { routes: ROUTES, top: 10 });
const runIds: string[] = [];

afterAll(async () => {
  for (const runId of runIds) {
    await rm(join(workspacesRoot(), runId), { recursive: true, force: true });
  }
});

describe('the recorded UI Engineer patches for the seeded flaws', () => {
  for (const [flaw, rank] of [
    ['ux-1', 3],
    ['ux-2', 1],
    ['ux-3', 4],
  ] as const) {
    it(`${flaw}: replays to the same verified patch`, async () => {
      const zone = zones.find((candidate) => candidate.rank === rank);
      if (zone === undefined) throw new Error(`no zone #${String(rank)}`);
      const shoplab = await loadSandboxDefinition('shoplab');
      if (shoplab.uiEngineer === undefined) throw new Error('no uiEngineer policy');
      const runId = newUlid();
      runIds.push(runId);
      const vcs = new LocalGitAdapter();
      const workspace = await vcs.clone(shoplab.repo, {
        runId,
        ref: 'main',
        excludeFiles: shoplab.excludeFiles,
      });
      const store = new InMemoryEventStore();
      const gateway = new AnthropicGateway(
        new RecordedLLMAdapter({ mode: 'replay', dir: join(fixtures, flaw) }),
        await loadModelsConfig(repoModelsConfigPath()),
        new LlmEventObserver(store),
      );
      const screenshot = join(fixtures, flaw, 'screenshot.png');

      const result = await new ProposeVariant({
        gateway,
        vcs,
        store,
        checks: new ScriptedBuildChecks(vcs),
      }).execute({
        runId,
        zone,
        events,
        workspace,
        policy: new EditPolicy(shoplab.uiEngineer),
        allowed: shoplab.uiEngineer.allow,
        routes: ROUTES,
        ...(existsSync(screenshot) ? { screenshot: readFileSync(screenshot) } : {}),
        budget: new Budget({ maxTokens: 2_000_000, maxEur: 1 }),
      });

      expect(result.status).toBe('verified');
      expect(result.status === 'verified' ? result.diff.trim() : '').toBe(
        readFileSync(join(fixtures, flaw, 'expected.diff'), 'utf8').trim(),
      );
      expect(result.status === 'verified' && result.stats.filesChanged).toBeLessThanOrEqual(5);
    }, 120_000);
  }
});
