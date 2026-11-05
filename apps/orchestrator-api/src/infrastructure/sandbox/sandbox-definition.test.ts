import { describe, expect, it } from 'vitest';

import { loadSandboxDefinition, parseSandboxDefinition } from './sandbox-definition.js';

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

  it('rejects a target that is not a slug', async () => {
    await expect(loadSandboxDefinition('../etc')).rejects.toThrow();
  });
});
