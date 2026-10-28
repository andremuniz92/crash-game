import type { INestApplication } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/postgresql';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './test-app.js';

describe('app (E2E, D66)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('X1: sobe com o banco de teste e responde 404 no formato { code, message }', async () => {
    const response = await request(app.getHttpServer())
      .get('/rota-que-nao-existe')
      .expect(404);

    expect(response.body).toEqual({
      code: 'NOT_FOUND',
      message: expect.any(String),
    });
    expect(await app.get(MikroORM).isConnected()).toBe(true);
  });

  it('X2: JSON malformado responde 400 VALIDATION_ERROR', async () => {
    const response = await request(app.getHttpServer())
      .post('/bets')
      .set('Content-Type', 'application/json')
      .send('{"amount": 1000')
      .expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: expect.any(String),
    });
  });

  it('X3: app.close() fecha a conexão do MikroORM', async () => {
    const orm = app.get(MikroORM);
    expect(await orm.isConnected()).toBe(true);

    await app.close();

    expect(await orm.isConnected()).toBe(false);
    // O afterEach chama close() de novo; precisa ser inofensivo.
  });
});
