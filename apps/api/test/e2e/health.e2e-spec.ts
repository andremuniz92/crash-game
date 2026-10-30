import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './test-app.js';

describe('GET /health (E2E, D105)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('HC1: com o banco de pé, responde 200 { status: ok } sem Bearer', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });
});
