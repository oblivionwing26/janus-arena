/**
 * Architecture rules for Janus Arena.
 *
 * F0.1 ships the generic rules below so `pnpm check:arch` runs in CI from day one.
 * F0.4 adds the hexagonal boundary rules for apps/orchestrator-api
 * (domain -> nothing but shared-kernel, application -> domain only, etc.).
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make layering impossible to reason about.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Every import must resolve to a file or an installed package.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Modules nobody imports are usually dead code.',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|json)$',
          '[.]d[.]ts$',
          '(^|/)tsconfig[.]json$',
          '(^|/)(?:eslint|vitest|vite|next)[.]config[.](?:js|cjs|mjs|ts)$',
          '[.](?:test|spec)[.]ts$',
          '(^|/)src/index[.]ts$',
        ],
      },
      to: {},
    },
    {
      name: 'not-to-test',
      severity: 'error',
      comment: 'Production code must not import test files.',
      from: { pathNot: '[.](?:test|spec)[.]ts$' },
      to: { path: '[.](?:test|spec)[.]ts$' },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Production code must not depend on devDependencies.',
      from: { path: '^(apps|packages)/[^/]+/src', pathNot: '[.](?:test|spec)[.]ts$' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules'] },
    exclude: { path: ['(^|/)dist/', '(^|/)[.]next/', '(^|/)coverage/'] },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.d.ts'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
