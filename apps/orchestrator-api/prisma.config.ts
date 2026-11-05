import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

// Prisma 7 does not read .env by itself; load the repo-level one when present.
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Optional so `prisma generate` works without a database (CI, postinstall).
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
