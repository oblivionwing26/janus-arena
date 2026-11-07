import { newUlid } from '@janus/shared-kernel';

import { DockerCommandError, type DockerCli } from '../sandbox/docker-cli.js';

export interface ToolRun {
  readonly image: string;
  readonly args: readonly string[];
  /** Local folders copied into the container before it starts: host path → container path. */
  readonly copy: readonly { readonly from: string; readonly to: string }[];
  /** `none` unless the tool must query a public database (osv-scanner). */
  readonly network: 'none' | 'bridge';
  /** Exit codes that still mean "ran fine" (e.g. 1 = findings for osv-scanner). */
  readonly okExitCodes?: readonly number[];
}

export interface ToolOutput {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs an analysis tool in a throwaway container (F2.5). No bind mounts (the proxy and
 * DockerCli refuse them): the code is copied in with `docker cp` before the container starts,
 * and the container is removed afterwards. Tools only read the code; they never run it.
 */
export async function runInContainer(docker: DockerCli, run: ToolRun): Promise<ToolOutput> {
  const name = `janus-tool-${newUlid().toLowerCase()}`;
  await docker.run([
    'create',
    '--name',
    name,
    '--network',
    run.network,
    '--memory',
    '4g',
    run.image,
    ...run.args,
  ]);
  try {
    for (const { from, to } of run.copy) {
      await docker.run(['cp', `${from}/.`, `${name}:${to}`], { timeoutMs: 10 * 60_000 });
    }
    try {
      const { stdout, stderr } = await docker.run(['start', '--attach', name], {
        timeoutMs: 20 * 60_000,
      });
      return { stdout, stderr };
    } catch (error) {
      if (!(error instanceof DockerCommandError)) throw error;
      const { stdout } = await docker.run(['inspect', '--format', '{{.State.ExitCode}}', name]);
      if ((run.okExitCodes ?? []).includes(Number(stdout.trim()))) {
        return { stdout: error.stdout, stderr: error.stderr };
      }
      throw error;
    }
  } finally {
    await docker.run(['rm', '--force', name]).catch(() => undefined);
  }
}
