// `pnpm run:surface <target> [--ref <ref>] [--json]` (F2.6): clones the target (shallow) into a
// throwaway workspace, maps its HTTP surface from the code and prints it. Nothing of the target
// runs; no LLM is called.

import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { newUlid } from '@janus/shared-kernel';

import { loadSandboxDefinition } from '../../infrastructure/sandbox/sandbox-definition.js';
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import {
  loadSurfaceConfig,
  repoSurfaceConfigPath,
} from '../../infrastructure/surface/surface-config.js';
import { TypeScriptAttackSurface } from '../../infrastructure/surface/typescript-attack-surface.js';
import { LocalGitAdapter } from '../../infrastructure/vcs/local-git-adapter.js';

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const name = args[0];
if (name === undefined || name.startsWith('--')) {
  console.error('Usage: pnpm run:surface <target> [--ref <ref>] [--json]');
  process.exit(2);
}

const target = (await loadSurfaceConfig(repoSurfaceConfigPath()))[name];
if (target === undefined) {
  console.error(`config/surface.yaml has no target ${name}.`);
  process.exit(2);
}
const definition = target.repo === undefined ? await loadSandboxDefinition(name) : undefined;
const repo = target.repo ?? definition?.repo;
if (repo === undefined) throw new Error(`No repository for ${name}`);

const runId = newUlid();
try {
  const workspace = await new LocalGitAdapter().clone(repo, {
    runId,
    ref: option('ref') ?? target.ref ?? 'main',
    depth: 1,
    excludeFiles: definition?.excludeFiles ?? [],
  });
  const endpoints = await new TypeScriptAttackSurface(target).map(workspace);
  if (args.includes('--json')) {
    console.log(JSON.stringify(endpoints, null, 2));
  } else {
    for (const endpoint of endpoints) {
      const handler =
        endpoint.handler === null
          ? 'handler not found'
          : `${endpoint.handler.file}:${String(endpoint.handler.line)}`;
      console.log(
        `${endpoint.method.padEnd(7)} ${endpoint.route}  [${endpoint.params.join(', ')}]  ${handler}`,
      );
    }
    console.log(`\n${String(endpoints.length)} endpoints in ${name}.`);
  }
} finally {
  await rm(join(workspacesRoot(), runId), { recursive: true, force: true });
}
