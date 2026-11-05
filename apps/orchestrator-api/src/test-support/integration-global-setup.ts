// Recreates the test database schema and applies every migration before integration tests.
// DROP SCHEMA bypasses the append-only triggers, and testDatabaseUrl() guarantees a *_test db.

import { execSync } from 'node:child_process';

import pg from 'pg';

import { testDatabaseUrl } from './test-database-url.js';

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
