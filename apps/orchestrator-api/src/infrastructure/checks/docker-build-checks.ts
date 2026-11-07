import type { BuildChecksPort, BuildChecksResult } from '../../domain/checks/build-checks-port.js';
import type { VcsWorkspace } from '../../domain/vcs/vcs-port.js';
import { DockerCommandError, type DockerCli } from '../sandbox/docker-cli.js';

const MAX_OUTPUT = 8000;

const tail = (text: string) => (text.length > MAX_OUTPUT ? text.slice(-MAX_OUTPUT) : text);

/**
 * BuildChecksPort over Docker (F2.3): builds the target's checks image from the workspace
 * through the socket proxy, runs the checks command in a throwaway container with no network
 * (`--network none`) and removes the image. A build that fails counts as failed checks.
 */
export class DockerBuildChecks implements BuildChecksPort {
  constructor(
    private readonly docker: DockerCli,
    private readonly checks: { readonly target: string; readonly command: readonly string[] },
    private readonly now: () => number = () => performance.now(),
  ) {}

  async run(workspace: VcsWorkspace): Promise<BuildChecksResult> {
    const started = this.now();
    const image = `janus/checks-${workspace.id.toLowerCase()}:latest`;
    const finish = (passed: boolean, output: string): BuildChecksResult => ({
      passed,
      output: tail(output),
      durationMs: Math.max(0, this.now() - started),
    });
    try {
      try {
        await this.docker.run(
          ['build', '--target', this.checks.target, '-t', image, workspace.path],
          {
            timeoutMs: 15 * 60_000,
          },
        );
      } catch (error) {
        if (!(error instanceof DockerCommandError)) throw error;
        return finish(false, `The image did not build:\n${error.stdout}\n${error.stderr}`);
      }
      try {
        const { stdout, stderr } = await this.docker.run(
          ['run', '--rm', '--network', 'none', '--memory', '2g', image, ...this.checks.command],
          { timeoutMs: 15 * 60_000 },
        );
        return finish(true, `${stdout}\n${stderr}`);
      } catch (error) {
        if (!(error instanceof DockerCommandError)) throw error;
        return finish(false, `${error.stdout}\n${error.stderr}`);
      }
    } finally {
      await this.docker.run(['rmi', '--force', image]).catch(() => undefined);
    }
  }
}
