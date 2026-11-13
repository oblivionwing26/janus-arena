import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { InfrastructureError } from '../../domain/run/run-errors.js';
import { describePullRequestContract } from '../../test-support/pull-request-contract.js';
import { GitHubPullRequests, MAX_BODY, type GitPush } from './github-pull-requests.js';

const privatePem = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();
const TOKEN = 'ghs_scripted-installation-token';
const workspace = {
  id: '01JC0F2PB7E0000000000000WS',
  path: '/workspaces/ws',
  url: 'file:///workspaces/ws',
  baseSha: 'a'.repeat(40),
};

/** A scripted GitHub REST API: one repository, its open pull requests. */
class ScriptedGitHub {
  readonly calls: { method: string; path: string; body: unknown; auth: string }[] = [];
  readonly pulls: { number: number; head: string; title: string; body: string }[] = [];
  readonly pushes: { branch: string; remote: string; token: string }[] = [];
  refuse = false;

  fetch: typeof fetch = (url, init) => {
    const { pathname, searchParams } = new URL(url instanceof Request ? url.url : url.toString());
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const auth = new Headers(init?.headers).get('authorization') ?? '';
    this.calls.push({ method, path: pathname, body, auth });
    const json = (status: number, value: unknown) =>
      Promise.resolve(new Response(JSON.stringify(value), { status }));
    if (this.refuse) return json(403, { message: 'Resource not accessible by integration' });
    if (method === 'POST' && pathname === '/app/installations/42/access_tokens') {
      return json(201, { token: TOKEN });
    }
    if (method === 'GET' && pathname === '/repos/oblivionwing26/janus-shoplab') {
      return json(200, { default_branch: 'main' });
    }
    if (method === 'GET' && pathname === '/repos/oblivionwing26/janus-shoplab/pulls') {
      const head = searchParams.get('head')?.split(':')[1];
      return json(
        200,
        this.pulls
          .filter((pull) => pull.head === head)
          .map((pull) => ({
            number: pull.number,
            html_url: `https://github.com/oblivionwing26/janus-shoplab/pull/${String(pull.number)}`,
            base: { ref: 'main' },
          })),
      );
    }
    if (method === 'POST' && pathname === '/repos/oblivionwing26/janus-shoplab/pulls') {
      const { head, title, body: text } = body as { head: string; title: string; body: string };
      const number = this.pulls.length + 7;
      this.pulls.push({ number, head, title, body: text });
      return json(201, {
        number,
        html_url: `https://github.com/oblivionwing26/janus-shoplab/pull/${String(number)}`,
        base: { ref: 'main' },
      });
    }
    return json(404, { message: 'Not Found' });
  };

  push: GitPush = (_path, branch, remote, token) => {
    this.pushes.push({ branch, remote, token });
    return Promise.resolve();
  };
}

function adapter(github = new ScriptedGitHub()) {
  return {
    github,
    port: new GitHubPullRequests({
      appId: '123456',
      privatePem,
      installationId: '42',
      fetchImpl: github.fetch,
      push: github.push,
      now: () => 1_700_000_000,
    }),
  };
}

describePullRequestContract('GitHubPullRequests (scripted GitHub API)', {
  create: () => ({ port: adapter().port, workspace }),
});

describe('GitHubPullRequests (F3.8)', () => {
  const input = {
    owner: 'oblivionwing26',
    repo: 'janus-shoplab',
    branch: 'janus/variant-01JC0F2PB7E0000000000000AA',
    workspace,
    title: 'Janus: variant B',
    body: '# Janus dual report',
  };

  it('asks for a token on this repository only, with only contents and pull requests', async () => {
    const { github, port } = adapter();

    await port.open(input);

    expect(github.calls[0]).toMatchObject({
      method: 'POST',
      path: '/app/installations/42/access_tokens',
      auth: expect.stringMatching(/^Bearer ey/) as string,
      body: {
        repositories: ['janus-shoplab'],
        permissions: { contents: 'write', pull_requests: 'write' },
      },
    });
    expect(github.calls.slice(1).every((call) => call.auth === `Bearer ${TOKEN}`)).toBe(true);
    expect(github.pushes).toEqual([
      {
        branch: input.branch,
        remote: 'https://github.com/oblivionwing26/janus-shoplab.git',
        token: TOKEN,
      },
    ]);
  });

  it('never lets the token into an error', async () => {
    const github = new ScriptedGitHub();
    const { port } = adapter(github);
    github.refuse = true;

    const error = await port.open(input).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InfrastructureError);
    expect(String(error)).toContain('403');
    expect(String(error)).not.toContain(TOKEN);
  });

  it('cuts a body over GitHub’s limit and says where to read the rest', async () => {
    const { github, port } = adapter();

    await port.open({ ...input, body: 'x'.repeat(MAX_BODY + 5000) });

    const sent = github.pulls[0]?.body ?? '';
    expect(sent.length).toBeLessThanOrEqual(MAX_BODY);
    expect(sent).toContain('janus-report/dual-report.md');
  });
});
