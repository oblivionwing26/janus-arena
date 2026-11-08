// `pnpm run:audit-diff <target> --a <ref> --b <ref>`: builds the orchestrator quietly (turbo cache), then
// runs its differential audit CLI. Turbo's output is shown only when the build fails, so stdout carries
// nothing but the audit. It exits 1 when the gate blocks B.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const build = spawnSync(
  'pnpm',
  [
    'exec',
    'turbo',
    'run',
    'build',
    '--filter=@janus/orchestrator-api',
    '--output-logs=errors-only',
  ],
  { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
);
if (build.status !== 0) {
  process.stderr.write(build.stdout + build.stderr);
  process.exit(build.status ?? 1);
}

const cli = spawnSync(
  process.execPath,
  ['apps/orchestrator-api/dist/interface/cli/audit-diff-run.js', ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit' },
);
process.exit(cli.status ?? 1);
