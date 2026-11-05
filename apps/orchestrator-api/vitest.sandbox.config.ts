import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

// `pnpm test:sandbox`: local only. Needs `docker compose up -d docker-proxy` and DOCKER_HOST
// (from the environment or ../../.env) pointing at it.
if (process.env.DOCKER_HOST === undefined && existsSync('../../.env')) {
  process.loadEnvFile('../../.env');
}

export default defineConfig({
  test: {
    include: ['src/**/*.sandbox.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 10 * 60_000,
  },
});
