/**
 * Architecture rules for Janus Arena.
 *
 * F0.1 ships the generic rules so `pnpm check:arch` runs in CI from day one.
 * F0.4 adds the hexagonal boundary rules for apps/orchestrator-api (ADR 0001).
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */

const ORCHESTRATOR = '^apps/orchestrator-api/src';
const SHARED_KERNEL = '^packages/shared-kernel/';
const TEST_FILE = '[.](?:test|spec)[.]ts$';

module.exports = {
  forbidden: [
    {
      name: 'domain-only-shared-kernel',
      severity: 'error',
      comment:
        'ADR 0001: domain/ imports nothing except shared-kernel. No SDKs, Nest, Prisma, Playwright or Node builtins.',
      from: { path: `${ORCHESTRATOR}/domain/`, pathNot: TEST_FILE },
      to: { pathNot: [`${ORCHESTRATOR}/domain/`, SHARED_KERNEL] },
    },
    {
      name: 'application-only-domain-and-shared-kernel',
      severity: 'error',
      comment: 'ADR 0001: application/ imports only domain/ and shared-kernel.',
      from: { path: `${ORCHESTRATOR}/application/`, pathNot: TEST_FILE },
      to: {
        pathNot: [`${ORCHESTRATOR}/application/`, `${ORCHESTRATOR}/domain/`, SHARED_KERNEL],
      },
    },
    {
      name: 'infrastructure-not-interface',
      severity: 'error',
      comment: 'ADR 0001: infrastructure/ implements ports; only interface/ wires them together.',
      from: { path: `${ORCHESTRATOR}/infrastructure/` },
      to: { path: `${ORCHESTRATOR}/interface/` },
    },
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
      // package-exports.test.ts imports @janus/shared-kernel by name on purpose: it resolves to
      // dist/, which does not exist before `pnpm build`. Only that file is exempt.
      from: { pathNot: '^packages/shared-kernel/src/package-exports[.]test[.]ts$' },
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
      comment: 'Production code must not depend on devDependencies. test-support/ is test-only.',
      from: { path: '^(apps|packages)/[^/]+/src', pathNot: [TEST_FILE, '/src/test-support/'] },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules'] },
    exclude: {
      path: ['(^|/)dist/', '(^|/)[.]next/', '(^|/)coverage/', '/persistence/generated/'],
    },
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
