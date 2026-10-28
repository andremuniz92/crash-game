import { testOrm } from '../../test/integration/test-orm.js';
import { MikroOrmUnitOfWork } from '../shared/infrastructure/database/mikro-orm-unit-of-work.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import type { WalletRepository } from '../wallet/domain/wallet-repository.js';
import { CreateGuest } from './create-guest.js';
import { hashToken } from './player-token.js';

const PLAYER = 'e1e1e1e1-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-10-28T12:00:00.000Z');

const fixedIds = { newId: () => PLAYER };

async function query<T>(sql: string): Promise<T[]> {
  return (await testOrm()).em.getConnection().execute<T[]>(sql);
}

describe('CreateGuest (D59)', () => {
  it('P1: cria jogador, carteira e INITIAL_GRANT numa transação, lendo o relógio uma vez', async () => {
    const clock = new FakeClock(NOW);
    const now = vi.spyOn(clock, 'now');
    const createGuest = new CreateGuest(
      new MikroOrmUnitOfWork(await testOrm()),
      clock,
      fixedIds,
    );

    const guest = await createGuest.execute({ nickname: 'andre_1' });

    expect(guest).toEqual({
      playerId: PLAYER,
      nickname: 'andre_1',
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      balance: 100_000,
    });
    expect(now).toHaveBeenCalledTimes(1);

    expect(
      await query(
        `select id, nickname, token_hash, (extract(epoch from created_at) * 1000)::float8 as created_at from players`,
      ),
    ).toEqual([
      {
        id: PLAYER,
        nickname: 'andre_1',
        token_hash: hashToken(guest.token),
        created_at: NOW,
      },
    ]);
    expect(
      await query(`select player_id, balance::int, version from wallets`),
    ).toEqual([{ player_id: PLAYER, balance: 100_000, version: 1 }]);
    expect(
      await query(
        `select player_id, type, amount::int, bet_id, (extract(epoch from created_at) * 1000)::float8 as created_at from ledger_entries`,
      ),
    ).toEqual([
      {
        player_id: PLAYER,
        type: 'INITIAL_GRANT',
        amount: 100_000,
        bet_id: null,
        created_at: NOW,
      },
    ]);
  });

  it('P2: se a carteira falhar, o jogador também não fica gravado', async () => {
    const real = new MikroOrmUnitOfWork(await testOrm());
    const failure = new Error('falhou ao gravar a carteira');
    const failingWallets: WalletRepository = {
      getForUpdate: () => Promise.reject(failure),
      save: () => Promise.reject(failure),
    };
    const createGuest = new CreateGuest(
      {
        run: (work) =>
          real.run((tx) => work({ ...tx, wallets: failingWallets })),
      },
      new FakeClock(NOW),
      fixedIds,
    );

    await expect(createGuest.execute({ nickname: 'andre_1' })).rejects.toBe(
      failure,
    );
    expect(await query(`select id from players`)).toEqual([]);
  });
});
