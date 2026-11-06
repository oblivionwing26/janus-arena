// `pnpm run:start <runs/file.yaml>`: starts a run on the running orchestrator (`pnpm dev`).
// It does not rebuild: rebuilding dist/ would restart the API that is about to receive the run,
// and `pnpm dev` already keeps dist/ up to date.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = 'apps/orchestrator-api/dist/interface/cli/start-run-file.js';
if (!existsSync(new URL(`../${cli}`, import.meta.url))) {
  console.error('The orchestrator is not built: run `pnpm dev` (or `pnpm build`) first.');
  process.exit(1);
}
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
