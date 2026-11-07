import type { BuildChecksPort, BuildChecksResult } from '../../domain/checks/build-checks-port.js';
import type { VcsPort, VcsWorkspace } from '../../domain/vcs/vcs-port.js';

/**
 * Fake BuildChecksPort for tests: the checks fail while any file of the workspace contains
 * one of the `breaking` texts, and pass otherwise. Reads the workspace through VcsPort.
 */
export class ScriptedBuildChecks implements BuildChecksPort {
  readonly runs: string[] = [];

  constructor(
    private readonly vcs: VcsPort,
    private readonly breaking: readonly string[] = ['BROKEN'],
  ) {}

  async run(workspace: VcsWorkspace): Promise<BuildChecksResult> {
    this.runs.push(workspace.id);
    for (const path of await this.vcs.listFiles(workspace)) {
      const content = await this.vcs.readFile(workspace, path);
      const found = this.breaking.find((text) => content.includes(text));
      if (found !== undefined) {
        return {
          passed: false,
          output: `${path}: error TS2304: Cannot find name '${found}'.`,
          durationMs: 1,
        };
      }
    }
    return { passed: true, output: 'lint ok\ntypecheck ok\nTests 8 passed (8)', durationMs: 1 };
  }
}
