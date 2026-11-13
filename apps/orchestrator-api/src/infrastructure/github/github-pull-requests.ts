import { spawn } from 'node:child_process';

import { InfrastructureError } from '../../domain/run/run-errors.js';
import { JanusBranch } from '../../domain/vcs/janus-branch.js';
import type {
  OpenedPullRequest,
  PullRequestInput,
  PullRequestPort,
} from '../../domain/vcs/pull-request-port.js';
import { appJwt } from './github-app-auth.js';

/** Pushes a workspace's branch to a remote with an installation token. */
export type GitPush = (
  path: string,
  branch: string,
  remote: string,
  token: string,
) => Promise<void>;

/** GitHub refuses pull request bodies over 65 536 characters. */
export const MAX_BODY = 65_000;
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

/**
 * `git push` with the token in an HTTP header passed through the environment
 * (GIT_CONFIG_COUNT), never in the URL or the arguments, and with no credential helper.
 */
export const gitPush: GitPush = (path, branch, remote, token) =>
  new Promise((resolve, reject) => {
    const header = Buffer.from(`x-access-token:${token}`).toString('base64');
    const child = spawn(
      'git',
      ['-c', 'credential.helper=', 'push', '--quiet', remote, `${branch}:refs/heads/${branch}`],
      {
        cwd: path,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
          GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${header}`,
        },
      },
    );
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new InfrastructureError(
            `git push of ${branch} failed: ${stderr.trim().split('\n').at(-1) ?? ''}`,
          ),
        );
    });
  });

interface GitHubPull {
  readonly number: number;
  readonly html_url: string;
  readonly base: { readonly ref: string };
}

/**
 * PullRequestPort over GitHub (F3.8) as a GitHub App, with fetch and no SDK: the app's JWT buys
 * an installation token narrowed to the one repository and to contents and pull requests; the
 * branch is pushed with git; the pull request is opened into the default branch, unless one is
 * already open for the branch. Nothing here merges or approves.
 */
export class GitHubPullRequests implements PullRequestPort {
  private readonly fetchImpl: typeof fetch;
  private readonly push: GitPush;
  private readonly now: () => number;
  private readonly api: string;

  constructor(
    private readonly options: {
      readonly appId: string;
      readonly privatePem: string;
      readonly installationId: string;
      readonly fetchImpl?: typeof fetch;
      readonly push?: GitPush;
      readonly now?: () => number;
      readonly apiUrl?: string;
    },
  ) {
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.push = options.push ?? gitPush;
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
    this.api = options.apiUrl ?? 'https://api.github.com';
  }

  async open(input: PullRequestInput): Promise<OpenedPullRequest> {
    JanusBranch.assert(input.branch);
    if (!NAME.test(input.owner) || !NAME.test(input.repo)) {
      throw new InfrastructureError(`${input.owner}/${input.repo} is not a repository name`);
    }
    const jwt = appJwt(this.options.appId, this.options.privatePem, this.now());
    const { token } = await this.call<{ token: string }>(
      jwt,
      'POST',
      `/app/installations/${encodeURIComponent(this.options.installationId)}/access_tokens`,
      { repositories: [input.repo], permissions: { contents: 'write', pull_requests: 'write' } },
    );
    const repo = `/repos/${input.owner}/${input.repo}`;
    const { default_branch: base } = await this.call<{ default_branch: string }>(
      token,
      'GET',
      repo,
    );

    await this.push(
      input.workspace.path,
      input.branch,
      `https://github.com/${input.owner}/${input.repo}.git`,
      token,
    );

    const head = encodeURIComponent(`${input.owner}:${input.branch}`);
    const open = await this.call<GitHubPull[]>(
      token,
      'GET',
      `${repo}/pulls?head=${head}&state=open`,
    );
    const existing = open[0];
    if (existing !== undefined) {
      return {
        number: existing.number,
        url: existing.html_url,
        base: existing.base.ref,
        existed: true,
      };
    }
    const body =
      input.body.length <= MAX_BODY
        ? input.body
        : `${input.body.slice(0, MAX_BODY - 200)}\n\n…cut to fit GitHub's limit: the whole report is in \`janus-report/dual-report.md\` on this branch.`;
    const created = await this.call<GitHubPull>(token, 'POST', `${repo}/pulls`, {
      title: input.title,
      head: input.branch,
      base,
      body,
      maintainer_can_modify: false,
    });
    return {
      number: created.number,
      url: created.html_url,
      base: created.base.ref,
      existed: false,
    };
  }

  /** One REST call; a failure says the status and GitHub's message, never the credentials. */
  private async call<T>(
    credential: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.api}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${credential}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'janus-arena',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) {
      const message = gitHubMessage(text);
      throw new InfrastructureError(
        `GitHub ${method} ${path.split('?')[0] ?? path} answered ${String(response.status)}${message === '' ? '' : `: ${message.slice(0, 200)}`}`,
      );
    }
    return JSON.parse(text) as T;
  }
}

/** GitHub's own `message` from an error body; empty when there is none. */
function gitHubMessage(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' &&
      parsed !== null &&
      'message' in parsed &&
      typeof parsed.message === 'string'
      ? parsed.message
      : '';
  } catch {
    return '';
  }
}
