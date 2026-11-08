import { configDefaults, defineConfig } from 'vitest/config';

// `pnpm test`: unit and in-memory contract tests. No network, no database.
export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      '**/*.integration.test.ts',
      '**/*.sandbox.test.ts',
      '**/*.poc.test.ts',
    ],
  },
});
