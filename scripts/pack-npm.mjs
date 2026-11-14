// `pnpm pack:npm`: builds the two packages that are published to npm (F4.5) and packs each into a
// tarball under .npm/. They are published as @oblivionwing26/shared-kernel and
// @oblivionwing26/friction-engine, while the workspace keeps its @janus/* names: the packed
// package.json of the engine depends on `@janus/shared-kernel` as an npm alias of the published
// name, so its imports resolve without touching a line of source.
//
//   pnpm pack:npm            tarballs in .npm/
//   pnpm check:npm           the same, then installs them in a clean folder and runs the example
//
// Publishing is not done here: `npm publish` needs the owner's account (see packages/friction-engine/README.md).

import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = '0.1.0';
export const SCOPE = '@oblivionwing26';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '.npm');

const packages = [
  {
    dir: 'packages/shared-kernel',
    name: `${SCOPE}/shared-kernel`,
    description:
      'Janus Arena event envelope and zod schemas: the vocabulary a run of synthetic users and attacks is recorded in.',
    keywords: ['janus', 'events', 'zod', 'schemas'],
  },
  {
    dir: 'packages/friction-engine',
    name: `${SCOPE}/friction-engine`,
    description:
      'Pure functions from a recorded run of synthetic users to friction signals: rage clicks, dead clicks, backtracks, form errors, technical errors, slow pages, extra steps and abandonment. No browser, no LLM.',
    keywords: ['ux', 'friction', 'usability', 'synthetic-users', 'analytics', 'rage-click'],
    // The engine reads the event envelope: its dependency is the published kernel, under the name
    // its source imports.
    alias: { '@janus/shared-kernel': `npm:${SCOPE}/shared-kernel@${VERSION}` },
  },
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout}${result.stderr}`);
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
  return result.stdout;
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
run('pnpm', ['exec', 'turbo', 'run', 'build', '--output-logs=errors-only'], root);

for (const pkg of packages) {
  const source = JSON.parse(await readFile(join(root, pkg.dir, 'package.json'), 'utf8'));
  const stage = join(out, pkg.dir.split('/')[1] ?? pkg.dir);
  await mkdir(stage, { recursive: true });
  await cp(join(root, pkg.dir, 'dist'), join(stage, 'dist'), { recursive: true });
  await cp(join(root, 'LICENSE'), join(stage, 'LICENSE'));
  const readme = join(root, pkg.dir, 'README.md');
  if (existsSync(readme)) await cp(readme, join(stage, 'README.md'));
  const dependencies = { ...source.dependencies, ...pkg.alias };
  for (const [name, spec] of Object.entries(dependencies)) {
    if (String(spec).startsWith('workspace:')) {
      throw new Error(`${pkg.name}: ${name} is a workspace dependency with no npm alias`);
    }
  }
  const published = {
    name: pkg.name,
    version: VERSION,
    description: pkg.description,
    license: 'MIT',
    type: 'module',
    main: source.main,
    types: source.types,
    exports: source.exports,
    files: ['dist', 'README.md', 'LICENSE'],
    sideEffects: false,
    engines: { node: '>=20' },
    keywords: pkg.keywords,
    repository: {
      type: 'git',
      url: 'git+https://github.com/oblivionwing26/janus-arena.git',
      directory: pkg.dir,
    },
    homepage: 'https://github.com/oblivionwing26/janus-arena#readme',
    bugs: 'https://github.com/oblivionwing26/janus-arena/issues',
    publishConfig: { access: 'public', provenance: true },
    dependencies,
  };
  await writeFile(join(stage, 'package.json'), `${JSON.stringify(published, null, 2)}\n`);
  const tarball = run('npm', ['pack', '--pack-destination', out], stage).trim().split('\n').pop();
  console.log(`${pkg.name}@${VERSION} -> .npm/${tarball}`);
}
