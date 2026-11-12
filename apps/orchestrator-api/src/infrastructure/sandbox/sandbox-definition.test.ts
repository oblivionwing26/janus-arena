import { describe, expect, it } from 'vitest';

import {
  loadAnySandboxDefinition,
  loadSandboxDefinition,
  parseAnySandboxDefinition,
  parseSandboxDefinition,
} from './sandbox-definition.js';

const valid = `
name: demo
repo: https://example.test/demo.git
build: { setupTarget: tools, appTarget: runner }
database: { image: postgres:17-alpine, user: demo, password: demo, name: demo }
setup: { command: [sh, -c, 'true'] }
app: { port: 3000, healthPath: /health }
`;

describe('sandbox definitions', () => {
  it('loads docker/sandboxes/shoplab.yaml and excludes UX_FLAWS.md', async () => {
    const definition = await loadSandboxDefinition('shoplab');

    expect(definition.name).toBe('shoplab');
    expect(definition.excludeFiles).toContain('UX_FLAWS.md');
    expect(definition.app).toEqual({ port: 3100, healthPath: '/api/health' });
  });

  it('defaults excludeFiles to an empty list', () => {
    expect(parseSandboxDefinition(valid).excludeFiles).toEqual([]);
  });

  it.each([
    ['a non-URL repo', valid.replace('https://example.test/demo.git', '--upload-pack=x')],
    ['an exclude path that climbs out', `${valid}excludeFiles: ['../secret']\n`],
    ['a health path without a slash', valid.replace('/health', 'health')],
    ['an empty setup command', valid.replace("[sh, -c, 'true']", '[]')],
  ])('rejects %s', (_label, source) => {
    expect(() => parseSandboxDefinition(source)).toThrow();
  });

  it('loads docker/sandboxes/juice-shop.yaml as an image pinned by digest', async () => {
    const definition = await loadAnySandboxDefinition('juice-shop');

    expect(definition).toMatchObject({
      name: 'juice-shop',
      verification: { dir: '/juice-shop/.well-known' },
      // Quiet mode: no solved-challenge notifications reach a persona (F3.5a).
      env: { NODE_ENV: 'quiet' },
    });
    expect('image' in definition && definition.image).toMatch(
      /^bkimminich\/juice-shop:v20\.3\.0@sha256:[0-9a-f]{64}$/,
    );
    await expect(loadSandboxDefinition('juice-shop')).rejects.toThrow('runs an image');
  });

  it('says how Juice Shop is patched, without its ground truth (F3.5, ADR 0012)', async () => {
    const definition = await loadAnySandboxDefinition('juice-shop');

    expect('patch' in definition && definition.patch).toEqual({
      repo: 'https://github.com/juice-shop/juice-shop.git',
      ref: 'v20.3.0',
      dockerfile: 'juice-shop.patch.Dockerfile',
      excludeFiles: ['data/static/codefixes'],
      stripComments: ['vuln-code-snippet'],
      blueTeam: {
        allow: ['routes/**/*.ts', 'lib/**/*.ts', 'models/**/*.ts'],
        deny: ['lib/startup/**', 'lib/challengeUtils.ts'],
      },
    });
  });

  it.each([
    ['a Dockerfile outside docker/sandboxes', 'dockerfile: ../Dockerfile'],
    ['a strip marker with a newline', "stripComments: ['a\\nb']"],
  ])('rejects a patch section with %s', (_label, line) => {
    const patch = [
      'patch:',
      '  repo: https://example.test/x.git',
      '  ref: v1',
      '  dockerfile: x.Dockerfile',
      '  blueTeam: { allow: [src/**] }',
    ];
    const key = line.split(':')[0] ?? '';
    const lines = [...patch.filter((each) => !each.trim().startsWith(`${key}:`)), `  ${line}`];
    expect(() =>
      parseAnySandboxDefinition(
        [
          'name: x',
          `image: x/y:1@sha256:${'0'.repeat(64)}`,
          'app: { port: 3000, readyLog: up }',
          'verification: { dir: /x }',
          ...lines,
        ].join('\n'),
      ),
    ).toThrow();
  });

  it('rejects an image that is not pinned by digest', () => {
    expect(() =>
      parseAnySandboxDefinition(
        [
          'name: x',
          'image: bkimminich/juice-shop:latest',
          'app: { port: 3000, readyLog: up }',
          'verification: { dir: /x }',
        ].join('\n'),
      ),
    ).toThrow('pinned by digest');
  });

  it('rejects a target that is not a slug', async () => {
    await expect(loadSandboxDefinition('../etc')).rejects.toThrow();
  });
});
