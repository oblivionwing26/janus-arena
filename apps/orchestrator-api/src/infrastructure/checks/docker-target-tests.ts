import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { newUlid } from '@janus/shared-kernel';

import type { GeneratedTest } from '../../domain/fix/generated-test.js';
import type { TestResults } from '../../domain/fix/judge-tests.js';
import type { TargetTestsPort } from '../../domain/fix/target-tests-port.js';
import { InfrastructureError } from '../../domain/run/run-errors.js';
import type { DockerCli } from '../sandbox/docker-cli.js';
import {
  isImageDefinition,
  loadAnySandboxDefinition,
  sandboxDefinitionsDir,
  type AnySandboxDefinition,
} from '../sandbox/sandbox-definition.js';
import { assertLocalRepo, git } from '../sandbox/workspace.js';
import { tapResults } from './tap-results.js';

const COMMIT = /^[0-9a-f]{40}$/;
const EXTRA_PATH = /^test\/[\w./-]+\.ts$/;
// The target's own .dockerignore leaves its tests out of images; this throwaway clone is ours.
const DOCKERIGNORE = '.git/\nnode_modules/\nfrontend/\nbuild/\n';

/**
 * A target's own tests in the `tests` stage of its patch Dockerfile (F3.5, V2, ADR 0012): a
 * throwaway clone at one commit, Janus's generated tests written in, built, then each test file
 * run in its own process in a container without network. Results come from the TAP output.
 */
export class DockerTargetTests implements TargetTestsPort {
  private readonly loadDefinition: (target: string) => Promise<AnySandboxDefinition>;

  constructor(
    private readonly options: {
      readonly docker: DockerCli;
      readonly workspacesRoot: string;
      readonly loadDefinition?: (target: string) => Promise<AnySandboxDefinition>;
    },
  ) {
    this.loadDefinition = options.loadDefinition ?? ((target) => loadAnySandboxDefinition(target));
  }

  async run(input: {
    readonly target: string;
    readonly repo: string;
    readonly commit: string;
    readonly extra: readonly GeneratedTest[];
  }): Promise<TestResults> {
    const definition = await this.loadDefinition(input.target);
    const tests = isImageDefinition(definition) ? definition.patch?.tests : undefined;
    if (!isImageDefinition(definition) || definition.patch === undefined || tests === undefined) {
      throw new InfrastructureError(`${input.target} declares no tests to run`);
    }
    if (!COMMIT.test(input.commit)) throw new InfrastructureError('commit must be a full id');
    const bad = input.extra.find((test) => !EXTRA_PATH.test(test.path));
    if (bad !== undefined) throw new InfrastructureError(`test path ${bad.path} is not allowed`);

    const root = this.options.workspacesRoot;
    const id = `tests-${newUlid().toLowerCase()}`;
    const dir = join(root, id);
    const tag = `janus/${definition.name}-${id}:tests`;
    try {
      await mkdir(root, { recursive: true });
      await git(['clone', '--quiet', '--', assertLocalRepo(input.repo, root), dir]);
      await git(['-c', 'advice.detachedHead=false', 'checkout', '--quiet', input.commit], dir);
      for (const test of input.extra) {
        await mkdir(dirname(join(dir, test.path)), { recursive: true });
        await writeFile(join(dir, test.path), test.source);
      }
      await writeFile(join(dir, '.dockerignore'), DOCKERIGNORE);
      await this.options.docker.run([
        'build',
        '-f',
        join(sandboxDefinitionsDir(), definition.patch.dockerfile),
        '--build-arg',
        `BASE_IMAGE=${definition.image}`,
        '--build-arg',
        'CHANGED=',
        '--target',
        'tests',
        '-t',
        tag,
        dir,
      ]);
      // Words checked by the definition's schema: no quoting or expansion reaches the shell.
      const files = [...tests.files, ...input.extra.map((test) => test.path)].join(' ');
      // Each file gets 5 minutes; its output goes to a file first, which Node writes in full.
      const script = `for f in ${files}; do echo "# janus-file $f"; timeout 300 ${tests.command.join(' ')} "$f" > /tmp/janus.tap 2>&1; cat /tmp/janus.tap; done; exit 0`;
      const { stdout } = await this.options.docker.run(
        ['run', '--rm', '--network', 'none', tag, 'sh', '-c', script],
        { timeoutMs: 20 * 60_000 },
      );
      return tapResults(stdout);
    } catch (error) {
      if (error instanceof InfrastructureError) throw error;
      throw new InfrastructureError(
        `${input.target} tests could not run: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
      // --no-prune keeps the parent layers: Docker's cache, so the next run never reinstalls.
      await this.options.docker.run(['image', 'rm', '--no-prune', tag]).catch(() => undefined);
    }
  }
}
