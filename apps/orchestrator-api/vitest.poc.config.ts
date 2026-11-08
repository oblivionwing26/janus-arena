import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

// `pnpm test:poc` (F3.4): replays the saved PoCs in fixtures/poc/ against a fresh sandbox of
// their target. Needs Docker, the socket proxy and the agent browser (`docker compose up -d
// docker-proxy browser browser-relay`) and DOCKER_HOST (from the environment or ../../.env). No
// database and no API key: no LLM is called. Run locally and by .github/workflows/poc.yml.
if (process.env.DOCKER_HOST === undefined && existsSync('../../.env')) {
  process.loadEnvFile('../../.env');
}

export default defineConfig({
  test: {
    include: ['src/**/*.poc.test.ts'],
    fileParallelism: false,
    testTimeout: 5 * 60_000,
    hookTimeout: 10 * 60_000,
  },
});
