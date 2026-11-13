// `pnpm build:demo` (F3.12): the console as a self-contained demo. Builds the workspace packages it
// imports, then the app with NEXT_PUBLIC_DEMO=1, so it reads the recorded runs under public/demo
// and needs no orchestrator. This is also the build command for a static host such as Vercel.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('..', import.meta.url));
const root = fileURLToPath(new URL('../../..', import.meta.url));
const shell = process.platform === 'win32';

function run(args, cwd, env = {}) {
  const result = spawnSync('pnpm', args, {
    cwd,
    stdio: 'inherit',
    shell,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['exec', 'turbo', 'run', 'build', '--filter=@janus/web-console^...'], root);
run(['exec', 'next', 'build'], app, { NEXT_PUBLIC_DEMO: '1' });
