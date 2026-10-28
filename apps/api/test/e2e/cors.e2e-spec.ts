import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, WEB_ORIGIN } from './test-app.js';

const OTHER_ORIGIN = 'http://evil.test';

describe('CORS (E2E, D69)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const preflight = (origin: string) =>
    http()
      .options('/bets')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'authorization, content-type, idempotency-key',
      );

  it('H1: preflight da origem do front libera os métodos e headers do contrato, sem credentials', async () => {
    const response = await preflight(WEB_ORIGIN).expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    const methods = response.headers['access-control-allow-methods'];
    expect(methods?.split(',')).toEqual(
      expect.arrayContaining(['GET', 'POST']),
    );
    const headers = response.headers['access-control-allow-headers'];
    expect(headers?.toLowerCase().split(',')).toEqual(
      expect.arrayContaining([
        'authorization',
        'content-type',
        'idempotency-key',
      ]),
    );
    expect(response.headers.vary).toMatch(/\bOrigin\b/);
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
  });

  it('H2: preflight de outra origem sai sem nenhum header de CORS', async () => {
    const response = await preflight(OTHER_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-methods']).toBeUndefined();
  });

  it('H3: GET da origem do front recebe Access-Control-Allow-Origin e Vary: Origin', async () => {
    const response = await http()
      .get('/rounds/current')
      .set('Origin', WEB_ORIGIN)
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(response.headers.vary).toMatch(/\bOrigin\b/);
  });

  it('H4: GET de outra origem é atendido (CORS não é autenticação), mas sem Access-Control-Allow-Origin', async () => {
    const response = await http()
      .get('/rounds/current')
      .set('Origin', OTHER_ORIGIN)
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('H5: GET sem Origin (fora do navegador) é atendido, sem Access-Control-Allow-Origin', async () => {
    const response = await http().get('/rounds/current').expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
