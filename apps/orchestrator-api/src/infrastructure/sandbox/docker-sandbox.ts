import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  SandboxAlreadyUpError,
  SandboxNotFoundError,
  SandboxStartError,
} from '../../domain/sandbox/sandbox-errors.js';
import type { RunningVariant, SandboxPort } from '../../domain/sandbox/sandbox-port.js';
import type { OwnershipTokenPort } from '../../domain/scope/ownership-token-port.js';
import { assertValidVariant, type VariantSpec } from '../../domain/sandbox/variant-spec.js';
import { EditPolicy } from '../../domain/vcs/edit-policy.js';
import { DockerCommandError, type DockerCli } from './docker-cli.js';
import { patchedSources } from './patched-sources.js';
import {
  isImageDefinition,
  loadAnySandboxDefinition,
  type AnySandboxDefinition,
  type ImageSandboxDefinition,
  type SandboxDefinition,
  sandboxDefinitionsDir,
} from './sandbox-definition.js';
import { appEnvironment } from './app-environment.js';
import { assertLocalRepo, git, prepareWorkspace, removeWorkspace } from './workspace.js';

export const SANDBOX_NETWORK = 'janus-sbx';
const VARIANT_LABEL = 'janus.variant';
const TARGET_LABEL = 'janus.target';

export interface DockerSandboxOptions {
  readonly docker: DockerCli;
  readonly workspacesRoot: string;
  readonly loadDefinition?: (target: string) => Promise<AnySandboxDefinition>;
  readonly healthTimeoutMs?: number;
}

/**
 * Runs each variant as a shallow clone of its target, built into images and started on the
 * internal janus-sbx network next to its own throwaway Postgres (ADR 0005); or, for an image
 * definition (Juice Shop), the pinned image as it is, or patched (ADR 0012). Every container carries a janus.variant
 * label so down() removes them all, even after a failed start.
 */
export class DockerSandbox implements SandboxPort, OwnershipTokenPort {
  private readonly docker: DockerCli;
  private readonly loadDefinition: (target: string) => Promise<AnySandboxDefinition>;
  private readonly healthTimeoutMs: number;

  constructor(private readonly options: DockerSandboxOptions) {
    this.docker = options.docker;
    this.loadDefinition = options.loadDefinition ?? ((target) => loadAnySandboxDefinition(target));
    this.healthTimeoutMs = options.healthTimeoutMs ?? 120_000;
  }

  async up(variant: VariantSpec): Promise<RunningVariant> {
    assertValidVariant(variant);
    if (await this.isUp(variant.id)) throw new SandboxAlreadyUpError(variant.id);
    const definition = await this.loadDefinition(variant.target);

    try {
      return isImageDefinition(definition)
        ? await this.startImage(variant, definition)
        : await this.start(variant, definition);
    } catch (error) {
      await this.down(variant.id);
      throw new SandboxStartError(
        variant.id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async down(variantId: string): Promise<void> {
    const ids = await this.containerIds(variantId);
    if (ids.length > 0) await this.docker.run(['rm', '-f', ...ids]);
    await removeWorkspace(this.options.workspacesRoot, variantId);
  }

  /**
   * Copies the run's ownership token into the variant's app, where it serves /.well-known
   * (F3.1). Only targets that declare a verification folder support it.
   */
  async place(variantId: string, token: string): Promise<void> {
    if (!(await this.isUp(variantId))) throw new SandboxNotFoundError(variantId);
    const { stdout } = await this.docker.run([
      'inspect',
      '--format',
      `{{index .Config.Labels "${TARGET_LABEL}"}}`,
      appName(variantId),
    ]);
    const definition = await this.loadDefinition(stdout.trim());
    const verification = definition.verification;
    if (verification === undefined) {
      throw new Error(`${definition.name} does not support ownership verification`);
    }
    const dir = join(this.options.workspacesRoot, variantId);
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'janus-verify.txt');
    await writeFile(file, `${token}\n`, { mode: 0o644 });
    await this.docker.run([
      'cp',
      file,
      `${appName(variantId)}:${verification.dir}/janus-verify.txt`,
    ]);
  }

  async logs(variantId: string): Promise<string> {
    if (!(await this.isUp(variantId))) throw new SandboxNotFoundError(variantId);
    const { stdout, stderr } = await this.docker.run(['logs', '--tail', '200', appName(variantId)]);
    return stdout + stderr;
  }

  private async start(
    variant: VariantSpec,
    definition: SandboxDefinition,
  ): Promise<RunningVariant> {
    const dir = await prepareWorkspace({
      root: this.options.workspacesRoot,
      variantId: variant.id,
      repo:
        variant.repo === undefined
          ? definition.repo
          : assertLocalRepo(variant.repo, this.options.workspacesRoot),
      ref: variant.ref,
      excludeFiles: definition.excludeFiles,
    });

    const image = `janus/${definition.name}-${variant.id}`;
    await this.docker.run([
      'build',
      '--target',
      definition.build.setupTarget,
      '-t',
      `${image}:setup`,
      dir,
    ]);
    await this.docker.run([
      'build',
      '--target',
      definition.build.appTarget,
      '-t',
      `${image}:app`,
      dir,
    ]);
    await this.ensureInternalNetwork();

    const label = `${VARIANT_LABEL}=${variant.id}`;
    const db = definition.database;
    const dbHost = `janus-${variant.id}-db`;
    const databaseUrl = `postgresql://${db.user}:${db.password}@${dbHost}:5432/${db.name}`;

    await this.docker.run([
      'run',
      '-d',
      '--name',
      dbHost,
      '--network',
      SANDBOX_NETWORK,
      '--label',
      label,
      '--tmpfs',
      '/var/lib/postgresql/data',
      '-e',
      `POSTGRES_USER=${db.user}`,
      '-e',
      `POSTGRES_PASSWORD=${db.password}`,
      '-e',
      `POSTGRES_DB=${db.name}`,
      '--health-cmd',
      `pg_isready -U ${db.user} -d ${db.name}`,
      '--health-interval',
      '2s',
      db.image,
    ]);
    await this.waitHealthy(dbHost);

    await this.docker.run([
      'run',
      '--rm',
      '--name',
      `janus-${variant.id}-setup`,
      '--network',
      SANDBOX_NETWORK,
      '--label',
      label,
      '-e',
      `DATABASE_URL=${databaseUrl}`,
      `${image}:setup`,
      ...definition.setup.command,
    ]);

    await this.docker.run([
      'run',
      '-d',
      '--name',
      appName(variant.id),
      '--network',
      SANDBOX_NETWORK,
      '--label',
      label,
      '--label',
      `${TARGET_LABEL}=${definition.name}`,
      '-e',
      `DATABASE_URL=${databaseUrl}`,
      ...Object.entries(appEnvironment(definition, variant)).flatMap(([key, value]) => [
        '-e',
        `${key}=${value}`,
      ]),
      `${image}:app`,
    ]);
    await this.waitHealthy(appName(variant.id));

    return { baseUrl: `http://${appName(variant.id)}:${String(definition.app.port)}` };
  }

  private async startImage(
    variant: VariantSpec,
    definition: ImageSandboxDefinition,
  ): Promise<RunningVariant> {
    const image =
      variant.ref === 'image' ? definition.image : await this.patched(variant, definition);
    await this.ensureInternalNetwork();
    await this.docker.run([
      'run',
      '-d',
      '--name',
      appName(variant.id),
      '--network',
      SANDBOX_NETWORK,
      '--label',
      `${VARIANT_LABEL}=${variant.id}`,
      '--label',
      `${TARGET_LABEL}=${definition.name}`,
      ...Object.entries(appEnvironment(definition, variant)).flatMap(([key, value]) => [
        '-e',
        `${key}=${value}`,
      ]),
      image,
    ]);
    await this.waitForLog(appName(variant.id), definition.app.readyLog);
    return { baseUrl: `http://${appName(variant.id)}:${String(definition.app.port)}` };
  }

  /**
   * A patched variant of an image target (F3.5, ADR 0012): the image plus the recompiled
   * sources the patch changed since its base, built from Janus's own Dockerfile.
   */
  private async patched(variant: VariantSpec, definition: ImageSandboxDefinition): Promise<string> {
    const { patch } = definition;
    if (patch === undefined) throw new Error(`${definition.name} cannot be patched`);
    if (variant.repo === undefined || variant.base === undefined) {
      throw new Error(`Patched variant ${variant.id} needs its local repo and base commit`);
    }
    const root = this.options.workspacesRoot;
    const dir = await prepareWorkspace({
      root,
      variantId: variant.id,
      repo: assertLocalRepo(variant.repo, root),
      ref: variant.ref,
      excludeFiles: [],
      history: true,
    });
    const changes = await git(
      ['diff', '--name-status', '-z', '--no-renames', variant.base, 'HEAD', '--'],
      dir,
    );
    const sources = patchedSources(changes, new EditPolicy(patch.blueTeam));
    const tag = `janus/${definition.name}-${variant.id}:app`;
    await this.docker
      .run([
        'build',
        '-f',
        join(sandboxDefinitionsDir(), patch.dockerfile),
        '--build-arg',
        `BASE_IMAGE=${definition.image}`,
        '--build-arg',
        `CHANGED=${sources.join(' ')}`,
        '--target',
        'runner',
        '-t',
        tag,
        dir,
      ])
      .catch((error: unknown) => {
        // The type errors are what an agent needs to correct its patch; the rest is build noise.
        if (!(error instanceof DockerCommandError)) throw error;
        const errors = error.stdout.split('\n').filter((line) => /error TS\d+/.test(line));
        throw errors.length === 0
          ? error
          : new Error(`the patch does not compile:\n${errors.slice(0, 20).join('\n')}`);
      });
    return tag;
  }

  private async waitForLog(container: string, line: string): Promise<void> {
    const deadline = Date.now() + this.healthTimeoutMs;
    while (Date.now() < deadline) {
      const { stdout, stderr } = await this.docker.run(['logs', '--tail', '50', container]);
      if ((stdout + stderr).includes(line)) return;
      const { stdout: state } = await this.docker.run([
        'inspect',
        '--format',
        '{{.State.Status}}',
        container,
      ]);
      if (['exited', 'dead'].includes(state.trim())) {
        throw new Error(`${container} is ${state.trim()}: ${(stderr + stdout).slice(-2000)}`);
      }
      await sleep(1000);
    }
    throw new Error(`${container} did not log "${line}" within ${String(this.healthTimeoutMs)} ms`);
  }

  // docker-compose.yml owns janus-sbx (the agent browser joins it too). It must exist and be
  // internal; the sandbox never creates or relaxes it.
  private async ensureInternalNetwork(): Promise<void> {
    const existing = await this.docker
      .run(['network', 'inspect', '--format', '{{.Internal}}', SANDBOX_NETWORK])
      .catch(() => null);
    if (existing === null) {
      throw new Error(`Network ${SANDBOX_NETWORK} not found: run \`docker compose up -d\` first`);
    }
    if (existing.stdout.trim() !== 'true') {
      throw new Error(`Network ${SANDBOX_NETWORK} exists but is not internal`);
    }
  }

  private async waitHealthy(container: string): Promise<void> {
    const deadline = Date.now() + this.healthTimeoutMs;
    while (Date.now() < deadline) {
      const { stdout } = await this.docker.run([
        'inspect',
        '--format',
        '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}',
        container,
      ]);
      const [state, health] = stdout.trim().split(' ');
      if (health === 'healthy') return;
      if (state === 'exited' || state === 'dead' || health === 'unhealthy') {
        const logs = await this.docker.run(['logs', '--tail', '30', container]).catch(() => null);
        throw new Error(
          `${container} is ${health ?? state ?? 'unknown'}: ${(logs?.stderr ?? '') + (logs?.stdout ?? '')}`,
        );
      }
      await sleep(1000);
    }
    throw new Error(`${container} was not healthy after ${String(this.healthTimeoutMs)} ms`);
  }

  private async containerIds(variantId: string): Promise<string[]> {
    const { stdout } = await this.docker.run([
      'ps',
      '-aq',
      '--filter',
      `label=${VARIANT_LABEL}=${variantId}`,
    ]);
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }

  private async isUp(variantId: string): Promise<boolean> {
    return (await this.containerIds(variantId)).length > 0;
  }
}

function appName(variantId: string): string {
  return `janus-${variantId}-app`;
}
