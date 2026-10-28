import {
  deferred,
  insertPlayer,
  waitForBlockedLock,
} from '../../../../test/integration/fixtures.js';
import { testOrm } from '../../../../test/integration/test-orm.js';
import { MikroOrmIdempotencyStore } from './mikro-orm-idempotency-store.js';

const P1 = 'a1a1a1a1-0000-4000-8000-000000000001';
const P2 = 'a1a1a1a1-0000-4000-8000-000000000002';
const KEY = 'c0c0c0c0-0000-4000-8000-000000000001';
const OTHER_KEY = 'c0c0c0c0-0000-4000-8000-000000000002';
const NOW = Date.parse('2026-10-28T12:00:00.000Z');

async function inTransaction<T>(
  work: (store: MikroOrmIdempotencyStore) => Promise<T>,
): Promise<T> {
  return (await testOrm()).em
    .fork()
    .transactional((em) => work(new MikroOrmIdempotencyStore(em)));
}

beforeEach(async () => {
  const orm = await testOrm();
  await insertPlayer(orm, P1);
  await insertPlayer(orm, P2);
});

describe('MikroOrmIdempotencyStore (D60)', () => {
  it('IS1: salva e encontra o registro completo', async () => {
    const record = {
      playerId: P1,
      key: KEY,
      endpoint: 'POST /bets',
      requestHash: 'f'.repeat(64),
      responseStatus: 201,
      responseBody: { betId: 'x', amount: 1_000, nested: { ok: true } },
      createdAt: NOW,
    };
    await inTransaction((store) => store.save(record));

    expect(await inTransaction((store) => store.find(P1, KEY))).toEqual(record);
    expect(await inTransaction((store) => store.find(P2, KEY))).toBeNull();
    expect(
      await inTransaction((store) => store.find(P1, OTHER_KEY)),
    ).toBeNull();
  });

  it('IS2: o advisory lock serializa a mesma chave do mesmo jogador, e só ela', async () => {
    const orm = await testOrm();
    const t1Locked = deferred();
    const releaseT1 = deferred();
    const order: string[] = [];

    const t1 = inTransaction(async (store) => {
      await store.lock(P1, KEY);
      order.push('t1:locked');
      t1Locked.resolve();
      await releaseT1.promise;
      order.push('t1:commit');
    });
    await t1Locked.promise;

    let t2: Promise<void> | undefined;
    try {
      // Outra chave do mesmo jogador e a mesma chave de outro jogador passam direto.
      await inTransaction((store) => store.lock(P1, OTHER_KEY));
      await inTransaction((store) => store.lock(P2, KEY));
      order.push('independentes:ok');

      t2 = inTransaction(async (store) => {
        await store.lock(P1, KEY);
        order.push('t2:locked');
      });
      await waitForBlockedLock(orm);
      order.push('t2:waiting');
    } finally {
      releaseT1.resolve();
      await Promise.allSettled([t1, t2]);
    }
    await Promise.all([t1, t2]);

    expect(order).toEqual([
      't1:locked',
      'independentes:ok',
      't2:waiting',
      't1:commit',
      't2:locked',
    ]);
  });
});
