import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

// `pnpm test:integration`: needs `docker compose up`. Reads DATABASE_URL_TEST from the env or ../../.env.
if (process.env.DATABASE_URL_TEST === undefined && existsSync('../../.env')) {
  process.loadEnvFile('../../.env');
}

export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['src/test-support/integration-global-setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
