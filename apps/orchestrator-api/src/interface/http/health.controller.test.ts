import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../create-app.js';

describe('GET /health', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ logger: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 200 with status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('answers 404 for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });

    expect(response.statusCode).toBe(404);
  });
});
