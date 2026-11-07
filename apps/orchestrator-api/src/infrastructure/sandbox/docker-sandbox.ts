import { setTimeout as sleep } from 'node:timers/promises';

import {
  SandboxAlreadyUpError,
  SandboxNotFoundError,
  SandboxStartError,
} from '../../domain/sandbox/sandbox-errors.js';
import type { RunningVariant, SandboxPort } from '../../domain/sandbox/sandbox-port.js';
import { assertValidVariant, type VariantSpec } from '../../domain/sandbox/variant-spec.js';
import type { DockerCli } from './docker-cli.js';
import { loadSandboxDefinition, type SandboxDefinition } from './sandbox-definition.js';
import { assertLocalRepo, prepareWorkspace, removeWorkspace } from './workspace.js';

export const SANDBOX_NETWORK = 'janus-sbx';
const VARIANT_LABEL = 'janus.variant';

export interface DockerSandboxOptions {
  readonly docker: DockerCli;
  readonly workspacesRoot: string;
  readonly loadDefinition?: (target: string) => Promise<SandboxDefinition>;
  readonly healthTimeoutMs?: number;
}

/**
 * Runs each variant as a shallow clone of its target, built into images and started on the
 * internal janus-sbx network next to its own throwaway Postgres (ADR 0005). Every container
 * carries a janus.variant label so down() removes them all, even after a failed start.
 */
export class DockerSandbox implements SandboxPort {
  private readonly docker: DockerCli;
  private readonly loadDefinition: (target: string) => Promise<SandboxDefinition>;
  private readonly healthTimeoutMs: number;

  constructor(private readonly options: DockerSandboxOptions) {
    this.docker = options.docker;
    this.loadDefinition = options.loadDefinition ?? ((target) => loadSandboxDefinition(target));
    this.healthTimeoutMs = options.healthTimeoutMs ?? 120_000;
  }

  async up(variant: VariantSpec): Promise<RunningVariant> {
    assertValidVariant(variant);
    if (await this.isUp(variant.id)) throw new SandboxAlreadyUpError(variant.id);
    const definition = await this.loadDefinition(variant.target);

    try {
      return await this.start(variant, definition);
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
      '-e',
      `DATABASE_URL=${databaseUrl}`,
      `${image}:app`,
    ]);
    await this.waitHealthy(appName(variant.id));

    return { baseUrl: `http://${appName(variant.id)}:${String(definition.app.port)}` };
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
