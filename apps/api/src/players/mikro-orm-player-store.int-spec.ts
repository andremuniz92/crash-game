import { testOrm } from '../../test/integration/test-orm.js';
import { MikroOrmPlayerStore } from './mikro-orm-player-store.js';
import { hashToken } from './player-token.js';

const PLAYER = 'e2e2e2e2-0000-4000-8000-000000000001';

describe('MikroOrmPlayerStore', () => {
  it('P3: findByTokenHash devolve { id, nickname } ou null', async () => {
    const orm = await testOrm();
    const tokenHash = hashToken('token-de-teste');
    await new MikroOrmPlayerStore(orm.em.fork()).insert({
      id: PLAYER,
      nickname: 'andre_1',
      tokenHash,
      createdAt: Date.parse('2026-10-28T12:00:00.000Z'),
    });

    const store = new MikroOrmPlayerStore(orm.em.fork());
    expect(await store.findByTokenHash(tokenHash)).toEqual({
      id: PLAYER,
      nickname: 'andre_1',
    });
    expect(await store.findByTokenHash(hashToken('outro'))).toBeNull();
  });
});
