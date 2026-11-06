// `pnpm dev` for the orchestrator: `tsc --watch` recompiles on every save and `node --watch`
// restarts the API when dist/ changes. The API starts only after the first compile has
// finished, so it does not restart right after booting. Port 3011 by default, which is where
// the web console's proxy looks for it.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const node = process.execPath;
const env = { ...process.env, PORT: process.env.PORT ?? '3011' };

const children = [];
const compiler = spawn(
  node,
  [tsc, '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'],
  {
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);
children.push(compiler);

let api;
compiler.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  // tsc prints this after every compile; the first one means dist/ is complete.
  if (api === undefined && /Found 0 errors\. Watching for file changes/.test(String(chunk))) {
    api = spawn(node, ['--watch', 'dist/interface/main.js'], { stdio: 'inherit', env });
    children.push(api);
    api.on('exit', onExit);
  }
});

function stop() {
  for (const child of children) child.kill();
}
function onExit(code) {
  stop();
  process.exitCode = code ?? 0;
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
compiler.on('exit', onExit);
