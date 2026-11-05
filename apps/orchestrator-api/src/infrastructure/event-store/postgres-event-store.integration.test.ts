import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  describeEventStoreContract,
  stepEvent,
  testUlid,
} from '../../test-support/event-store-contract.js';
import { testDatabaseUrl } from '../../test-support/test-database-url.js';
import { PostgresEventStore } from './postgres-event-store.js';

let store: PostgresEventStore;

beforeAll(async () => {
  store = await PostgresEventStore.connect(testDatabaseUrl());
});

afterAll(async () => {
  await store.close();
});

describeEventStoreContract('PostgresEventStore', {
  create: () => Promise.resolve(store),
});

describe('events table is append-only', () => {
  const runId = testUlid();
  let client: pg.Client;

  beforeAll(async () => {
    await store.append([stepEvent(runId, 0)]);
    client = new pg.Client({ connectionString: testDatabaseUrl() });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it.each([
    ['UPDATE', `UPDATE events SET type = 'tampered' WHERE run_id = $1`],
    ['DELETE', `DELETE FROM events WHERE run_id = $1`],
  ])('rejects a manual %s', async (operation, sql) => {
    await expect(client.query(sql, [runId])).rejects.toThrow(
      `events is append-only: ${operation} is not allowed`,
    );
  });

  it('rejects TRUNCATE', async () => {
    await expect(client.query('TRUNCATE events')).rejects.toThrow(
      'events is append-only: TRUNCATE is not allowed',
    );
  });

  it('leaves the row untouched', async () => {
    expect(await store.readRun(runId)).toHaveLength(1);
  });
});
