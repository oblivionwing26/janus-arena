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
import type { DockerCli } from './docker-cli.js';
import {
  isImageDefinition,
  loadAnySandboxDefinition,
  type AnySandboxDefinition,
  type ImageSandboxDefinition,
  type SandboxDefinition,
} from './sandbox-definition.js';
import { assertLocalRepo, prepareWorkspace, removeWorkspace } from './workspace.js';

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
 * definition (Juice Shop), the pinned image as it is. Every container carries a janus.variant
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
   * (F3.1). Only image targets that declare a verification folder support it.
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
    if (!isImageDefinition(definition)) {
      throw new Error(`${definition.name} does not support ownership verification`);
    }
    const dir = join(this.options.workspacesRoot, variantId);
    await mkdir(dir, { recursive: true });
    const file = join(dir, 'janus-verify.txt');
    await writeFile(file, `${token}\n`, { mode: 0o644 });
    await this.docker.run([
      'cp',
      file,
      `${appName(variantId)}:${definition.verification.dir}/janus-verify.txt`,
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
      `${image}:app`,
    ]);
    await this.waitHealthy(appName(variant.id));

    return { baseUrl: `http://${appName(variant.id)}:${String(definition.app.port)}` };
  }

  private async startImage(
    variant: VariantSpec,
    definition: ImageSandboxDefinition,
  ): Promise<RunningVariant> {
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
      ...Object.entries(definition.env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
      definition.image,
    ]);
    await this.waitForLog(appName(variant.id), definition.app.readyLog);
    return { baseUrl: `http://${appName(variant.id)}:${String(definition.app.port)}` };
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
