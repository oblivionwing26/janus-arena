// `pnpm check:npm` (F4.5 "done when": the package installs from the tarball): packs the two npm
// packages, installs them in an empty folder, and runs the engine's README example there. The
// kernel is not on the registry until it is published, so the install points the engine's
// `@janus/shared-kernel` alias at the local tarball with an override.

import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shell = process.platform === 'win32';

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell });
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout}${result.stderr}`);
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
  return result.stdout;
}

console.log(run('node', ['scripts/pack-npm.mjs'], root));
const tarballs = (await readdir(join(root, '.npm'))).filter((name) => name.endsWith('.tgz'));
const kernel = tarballs.find((name) => name.includes('shared-kernel'));
const engine = tarballs.find((name) => name.includes('friction-engine'));
if (kernel === undefined || engine === undefined) throw new Error('both tarballs are expected');

const dir = await mkdtemp(join(tmpdir(), 'janus-npm-check-'));
try {
  await cp(join(root, '.npm', kernel), join(dir, kernel));
  await cp(join(root, '.npm', engine), join(dir, engine));
  await mkdir(join(dir, 'app'));
  await writeFile(
    join(dir, 'app', 'package.json'),
    JSON.stringify({
      name: 'janus-npm-check',
      private: true,
      type: 'module',
      dependencies: { '@oblivionwing26/friction-engine': `file:../${engine}` },
      overrides: { '@janus/shared-kernel': `file:../${kernel}` },
    }),
  );
  await cp(
    join(root, 'packages/friction-engine/examples/rage-click.mjs'),
    join(dir, 'app', 'rage-click.mjs'),
  );
  run('npm', ['install', '--no-audit', '--no-fund'], join(dir, 'app'));
  const output = run('node', ['rage-click.mjs'], join(dir, 'app'));
  console.log(output);
  if (!output.includes('rage-click')) throw new Error('the example did not print a rage-click');
  console.log('OK: both packages install from their tarballs and the example runs.');
} finally {
  await rm(dir, { recursive: true, force: true });
}
