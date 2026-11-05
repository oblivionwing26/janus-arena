// `pnpm dev` for the orchestrator: compile once, then keep `tsc --watch` and `node --watch`
// running side by side so every saved change restarts the API. Port 3011 by default, which
// is where the web console's proxy looks for it.

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const node = process.execPath;
const env = { ...process.env, PORT: process.env.PORT ?? '3011' };

const first = spawnSync(node, [tsc, '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
if (first.status !== 0) process.exit(first.status ?? 1);

const children = [
  spawn(node, [tsc, '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'], {
    stdio: 'inherit',
  }),
  spawn(node, ['--watch', 'dist/interface/main.js'], { stdio: 'inherit', env }),
];

function stop() {
  for (const child of children) child.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) {
  child.on('exit', (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
}
