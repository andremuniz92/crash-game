import {
  insertBetsFor,
  insertPlayer,
} from '../../../test/integration/fixtures.js';
import { testOrm } from '../../../test/integration/test-orm.js';
import { Money } from '../../shared/domain/money.js';
import { Wallet } from '../domain/wallet.js';
import { MikroOrmWalletRepository } from './mikro-orm-wallet.repository.js';
import { WalletQueries } from './wallet-queries.js';

const PLAYER = 'e3e3e3e3-0000-4000-8000-000000000001';
const OTHER = 'e3e3e3e3-0000-4000-8000-000000000002';
const NOW = Date.parse('2026-10-28T12:00:00.000Z');

async function saveWallet(wallet: Wallet): Promise<void> {
  await (
    await testOrm()
  ).em
    .fork()
    .transactional((em) => new MikroOrmWalletRepository(em).save(wallet));
}

describe('WalletQueries', () => {
  it('W1: saldo e os 20 lançamentos mais recentes, só do próprio jogador', async () => {
    const orm = await testOrm();
    await insertPlayer(orm, PLAYER);
    await insertPlayer(orm, OTHER);
    const bets = await insertBetsFor(orm, PLAYER, 24);

    // 25 lançamentos do jogador: INITIAL_GRANT em NOW e 24 débitos em NOW + i.
    const wallet = Wallet.open({ playerId: PLAYER, now: NOW });
    bets.forEach((betId, i) =>
      wallet.debit(Money.fromCents(1_000), { betId, now: NOW + i + 1 }),
    );
    await saveWallet(wallet);
    await saveWallet(Wallet.open({ playerId: OTHER, now: NOW + 100 }));

    const summary = await new WalletQueries(orm).summary(PLAYER);

    expect(summary.balance).toBe(100_000 - 24 * 1_000);
    expect(summary.entries).toHaveLength(20);
    expect(summary.entries[0]).toEqual({
      type: 'BET_PLACED',
      amount: -1_000,
      betId: bets[23],
      createdAt: NOW + 24,
    });
    expect(summary.entries.map((entry) => entry.createdAt)).toEqual(
      Array.from({ length: 20 }, (_, i) => NOW + 24 - i),
    );
    expect(summary.entries.every((entry) => entry.type === 'BET_PLACED')).toBe(
      true,
    );
    expect(typeof summary.balance).toBe('number');
    expect(typeof summary.entries[0]?.amount).toBe('number');
  });
});
