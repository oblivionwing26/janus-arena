// Local only (`pnpm test:sandbox`): needs Docker, the socket proxy from docker-compose.yml and
// access to the ShopLab repository. F0.8 "Done when" lives here.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { describeSandboxContract } from '../../test-support/sandbox-contract.js';
import { DockerCli } from './docker-cli.js';
import { DockerSandbox, SANDBOX_NETWORK } from './docker-sandbox.js';
import { workspacesRoot } from './workspace.js';

const BUILD_AND_START_MS = 10 * 60_000;
const docker = new DockerCli();
const sandbox = () => new DockerSandbox({ docker, workspacesRoot: workspacesRoot() });
const shoplab = (id: string) => ({ id, target: 'shoplab', ref: 'main' });

// A throwaway container on janus-sbx, standing in for an agent browser.
async function fetchFromSandbox(url: string): Promise<string> {
  const script = `fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(8000) })
    .then((r) => console.log('status', r.status))
    .catch((e) => console.log('error', e.cause?.code ?? e.name))`;
  const { stdout } = await docker.run([
    'run',
    '--rm',
    '--network',
    SANDBOX_NETWORK,
    'node:24-alpine',
    'node',
    '-e',
    script,
  ]);
  return stdout.trim();
}

describeSandboxContract('DockerSandbox (ShopLab)', {
  sandbox,
  variant: shoplab,
  timeoutMs: BUILD_AND_START_MS,
});

describe('F0.8 done when', () => {
  const adapter = sandbox();
  let baseUrl: string;

  beforeAll(async () => {
    ({ baseUrl } = await adapter.up(shoplab('a')));
  }, BUILD_AND_START_MS);

  afterAll(async () => {
    await adapter.down('a');
  }, 60_000);

  it('up("a") returns a URL that agents on janus-sbx can reach', async () => {
    expect(baseUrl).toBe('http://janus-a-app:3100');
    expect(await fetchFromSandbox(`${baseUrl}/api/health`)).toBe('status 200');
  }, 60_000);

  it('blocks requests from the sandbox to a public host', async () => {
    const result = await fetchFromSandbox('https://example.com/');

    expect(result).toMatch(/^error /);
  }, 60_000);

  it('runs on an internal network', async () => {
    const { stdout } = await docker.run([
      'network',
      'inspect',
      '--format',
      '{{.Internal}}',
      SANDBOX_NETWORK,
    ]);

    expect(stdout.trim()).toBe('true');
  });

  it('cloned the target without its ground-truth file', () => {
    const dir = join(workspacesRoot(), 'a');

    expect(existsSync(join(dir, 'package.json'))).toBe(true);
    expect(existsSync(join(dir, 'UX_FLAWS.md'))).toBe(false);
  });
});
