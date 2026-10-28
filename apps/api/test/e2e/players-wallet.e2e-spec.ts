import { createHash } from 'node:crypto';
import type { GuestResponse } from '@crash/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { testOrm } from '../integration/test-orm.js';
import { createTestApp } from './test-app.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function count(table: string): Promise<number> {
  const [row] = await (
    await testOrm()
  ).em
    .getConnection()
    .execute<{ n: number }[]>(`select count(*)::int as n from ${table}`);
  return row?.n ?? 0;
}

describe('guest e carteira (E2E, D59)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createGuest(nickname: string): Promise<GuestResponse> {
    const response = await request(app.getHttpServer())
      .post('/players/guest')
      .send({ nickname })
      .expect(201);
    return response.body as GuestResponse;
  }

  it('X4: POST /players/guest responde 201 com playerId, nickname aparado, token e saldo', async () => {
    const guest = await createGuest('  andre_1 ');

    expect(guest).toEqual({
      playerId: expect.stringMatching(UUID),
      nickname: 'andre_1',
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      balance: 100_000,
    });
  });

  it.each([
    ['campo ausente', {}],
    ['valor que não é string', { nickname: 123 }],
    ['2 caracteres', { nickname: 'ab' }],
    ['17 caracteres', { nickname: 'a'.repeat(17) }],
    ['espaço no meio', { nickname: 'a b' }],
    ['acento', { nickname: 'joão' }],
    ['html', { nickname: '<script>' }],
  ])(
    'X5: nickname inválido (%s) responde 400 e não cria nada',
    async (_case, body) => {
      const response = await request(app.getHttpServer())
        .post('/players/guest')
        .send(body)
        .expect(400);

      expect(response.body).toEqual({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('nickname'),
      });
      expect(await count('players')).toBe(0);
      expect(await count('wallets')).toBe(0);
    },
  );

  it('X6: dois guests com o mesmo nickname são aceitos, com ids e tokens diferentes', async () => {
    const first = await createGuest('andre');
    const second = await createGuest('andre');

    expect(second.playerId).not.toBe(first.playerId);
    expect(second.token).not.toBe(first.token);
  });

  it('X7: GET /wallet com o token devolve o saldo e o INITIAL_GRANT', async () => {
    const guest = await createGuest('andre');

    const response = await request(app.getHttpServer())
      .get('/wallet')
      .set('Authorization', `Bearer ${guest.token}`)
      .expect(200);

    expect(response.body).toEqual({
      balance: 100_000,
      entries: [
        {
          type: 'INITIAL_GRANT',
          amount: 100_000,
          betId: null,
          createdAt: expect.any(Number),
        },
      ],
    });
  });

  it('X8: GET /wallet sem credencial válida responde 401', async () => {
    const guest = await createGuest('andre');
    const unknown = 'A'.repeat(43);

    for (const header of [
      undefined,
      `Basic ${guest.token}`,
      'Bearer token-malformado',
      `Bearer ${unknown}`,
    ]) {
      const call = request(app.getHttpServer()).get('/wallet');
      if (header) call.set('Authorization', header);
      const response = await call.expect(401);
      expect(response.body, String(header)).toEqual({
        code: 'UNAUTHORIZED',
        message: expect.any(String),
      });
    }
  });

  it('X9: o token só existe como hash no banco', async () => {
    const guest = await createGuest('andre');

    const rows = await (
      await testOrm()
    ).em
      .getConnection()
      .execute<{ token_hash: string; row: string }[]>(
        `select token_hash, row_to_json(p)::text as row from players p`,
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toBe(
      createHash('sha256').update(guest.token, 'utf8').digest('hex'),
    );
    expect(rows[0]?.row).not.toContain(guest.token);
  });
});
