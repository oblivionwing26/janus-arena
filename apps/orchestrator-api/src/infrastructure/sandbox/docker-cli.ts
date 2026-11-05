import { execFile } from 'node:child_process';

const PROXY_HOST = /^tcp:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/;

/** The orchestrator only talks to Docker through the local socket proxy (ADR 0005). */
export function assertProxyHost(host: string): void {
  if (!PROXY_HOST.test(host)) {
    throw new Error(
      `DOCKER_HOST must point at the local socket proxy (tcp://127.0.0.1:<port>), got "${host}"`,
    );
  }
}

const FORBIDDEN_EXACT = new Set(['-v', '--volume', '--mount', '--privileged', '--device']);
const FORBIDDEN_PREFIX = [
  '--volume=',
  '--mount=',
  '--device=',
  '--cap-add',
  '--security-opt',
  '--network=host',
  '--net=host',
  '--pid=host',
  '--ipc=host',
  '--userns=host',
];
const FORBIDDEN_TEXT = /docker\.sock|docker_engine|dockerDesktopLinuxEngine/i;

// buildx may start its own privileged BuildKit container through the proxy; never use it.
const FORBIDDEN_COMMANDS = new Set(['buildx', 'builder', 'exec', 'volume', 'plugin', 'swarm']);

/**
 * Sandbox containers never get bind mounts, host namespaces, extra capabilities or the
 * Docker socket. Anything that looks like one is refused before Docker sees it.
 */
export function assertSafeDockerArgs(args: readonly string[]): void {
  const command = args[0] ?? '';
  if (FORBIDDEN_COMMANDS.has(command)) {
    throw new Error(`Refusing unsafe docker command: ${command}`);
  }
  args.forEach((arg, index) => {
    const next = args[index + 1];
    const bad =
      FORBIDDEN_EXACT.has(arg) ||
      FORBIDDEN_PREFIX.some((prefix) => arg.startsWith(prefix)) ||
      FORBIDDEN_TEXT.test(arg) ||
      (/^--(network|net|pid|ipc|userns)$/.test(arg) && next === 'host');
    if (bad) throw new Error(`Refusing unsafe docker argument: ${arg}`);
  });
}

export interface DockerResult {
  readonly stdout: string;
  readonly stderr: string;
}

export class DockerCommandError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly stderr: string,
  ) {
    super(
      `docker ${args.slice(0, 2).join(' ')} failed: ${stderr.trim().split('\n').slice(-3).join(' ')}`,
    );
    this.name = 'DockerCommandError';
  }
}

/** Runs the docker CLI without a shell, always against the socket proxy. */
export class DockerCli {
  private readonly host: string;

  constructor(host = process.env.DOCKER_HOST ?? '') {
    assertProxyHost(host);
    this.host = host;
  }

  run(args: readonly string[], options: { timeoutMs?: number } = {}): Promise<DockerResult> {
    assertSafeDockerArgs(args);
    return new Promise((resolve, reject) => {
      execFile(
        'docker',
        [...args],
        {
          // DOCKER_BUILDKIT=0: `docker build` uses the engine's classic builder over POST /build,
          // which the proxy allows, instead of buildx and its own BuildKit container.
          env: { ...process.env, DOCKER_HOST: this.host, DOCKER_BUILDKIT: '0' },
          maxBuffer: 32 * 1024 * 1024,
          timeout: options.timeoutMs ?? 10 * 60_000,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) reject(new DockerCommandError(args, stderr || error.message));
          else resolve({ stdout, stderr });
        },
      );
    });
  }
}
