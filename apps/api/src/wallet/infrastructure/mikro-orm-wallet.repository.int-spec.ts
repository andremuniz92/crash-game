import { ValidationError } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/core';
import {
  deferred,
  insertBetsFor,
  insertPlayer,
  waitForBlockedLock,
} from '../../../test/integration/fixtures.js';
import { testOrm } from '../../../test/integration/test-orm.js';
import { Money } from '../../shared/domain/money.js';
import { Wallet } from '../domain/wallet.js';
import {
  WalletNotFoundError,
  WalletVersionConflictError,
} from '../domain/wallet-repository.js';
import { MikroOrmWalletRepository } from './mikro-orm-wallet.repository.js';

const PLAYER = 'c1c1c1c1-0000-4000-8000-000000000001';
const NOW = 1_700_000_000_000;

let BET: string[] = [];

async function inTransaction<T>(
  work: (repo: MikroOrmWalletRepository) => Promise<T>,
): Promise<T> {
  return (await testOrm()).em
    .fork()
    .transactional((em: EntityManager) =>
      work(new MikroOrmWalletRepository(em)),
    );
}

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await testOrm()).em.getConnection().execute<T[]>(sql, params);
}

async function openWallet(): Promise<void> {
  await inTransaction((repo) =>
    repo.save(Wallet.open({ playerId: PLAYER, now: NOW })),
  );
}

beforeEach(async () => {
  const orm = await testOrm();
  await insertPlayer(orm, PLAYER);
  BET = await insertBetsFor(orm, PLAYER, 3);
});

const ctx = (bet: number, now: number) => ({ betId: BET[bet]!, now });

describe('MikroOrmWalletRepository', () => {
  it('save de uma carteira aberta insere a carteira (versão 1) e o INITIAL_GRANT', async () => {
    await openWallet();
    const wallet = await inTransaction((repo) => repo.getForUpdate(PLAYER));
    expect(wallet.balance.cents).toBe(100_000);
    expect(wallet.version).toBe(1);

    const entries = await query<{ type: string; amount: string }>(
      'select type, amount from ledger_entries where player_id = ? order by id',
      [PLAYER],
    );
    expect(entries.map((e) => [e.type, Number(e.amount)])).toEqual([
      ['INITIAL_GRANT', 100_000],
    ]);
  });

  it('carregar, debitar, creditar e gravar atualiza saldo, versão e extrato; SUM(amount) = balance', async () => {
    await openWallet();
    await inTransaction(async (repo) => {
      const wallet = await repo.getForUpdate(PLAYER);
      wallet.debit(Money.fromCents(1_000), ctx(0, NOW + 1));
      wallet.credit(Money.fromCents(6_040), ctx(1, NOW + 2));
      await repo.save(wallet);
    });

    const wallet = await inTransaction((repo) => repo.getForUpdate(PLAYER));
    expect(wallet.balance.cents).toBe(105_040);
    expect(wallet.version).toBe(2);

    const entries = await query<{ type: string; amount: string }>(
      'select type, amount from ledger_entries where player_id = ? order by id',
      [PLAYER],
    );
    expect(entries.map((e) => [e.type, Number(e.amount)])).toEqual([
      ['INITIAL_GRANT', 100_000],
      ['BET_PLACED', -1_000],
      ['CASHOUT', 6_040],
    ]);
    const [check] = await query<{ balance: string; total: string }>(
      `select w.balance, (select sum(amount) from ledger_entries l where l.player_id = w.player_id) as total
         from wallets w where w.player_id = ?`,
      [PLAYER],
    );
    expect(Number(check?.balance)).toBe(Number(check?.total));
  });

  it('duas instâncias da mesma versão: a segunda gravação lança WalletVersionConflictError e nada muda', async () => {
    await openWallet();
    // Cada carregamento numa transação própria, que solta o lock ao terminar.
    const first = await inTransaction((repo) => repo.getForUpdate(PLAYER));
    const second = await inTransaction((repo) => repo.getForUpdate(PLAYER));

    first.debit(Money.fromCents(1_000), ctx(0, NOW + 1));
    await inTransaction((repo) => repo.save(first));

    second.debit(Money.fromCents(5_000), ctx(1, NOW + 2));
    await expect(inTransaction((repo) => repo.save(second))).rejects.toThrow(
      WalletVersionConflictError,
    );

    const wallet = await inTransaction((repo) => repo.getForUpdate(PLAYER));
    expect(wallet.balance.cents).toBe(99_000);
    expect(wallet.version).toBe(2);
    const [count] = await query<{ n: number }>(
      'select count(*)::int as n from ledger_entries',
    );
    expect(count?.n).toBe(2);
  });

  it('getForUpdate de jogador sem carteira lança WalletNotFoundError; fora de transação, lança erro', async () => {
    await expect(
      inTransaction((repo) => repo.getForUpdate(PLAYER)),
    ).rejects.toThrow(WalletNotFoundError);

    await openWallet();
    await expect(
      new MikroOrmWalletRepository((await testOrm()).em.fork()).getForUpdate(
        PLAYER,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('concorrência: T2 espera o commit de T1, enxerga o saldo dele e os dois débitos ficam', async () => {
    await openWallet();
    const orm = await testOrm();
    const t1Locked = deferred();
    const releaseT1 = deferred();
    const order: string[] = [];

    const t1 = inTransaction(async (repo) => {
      const wallet = await repo.getForUpdate(PLAYER);
      order.push('t1:locked');
      t1Locked.resolve();
      await releaseT1.promise;
      wallet.debit(Money.fromCents(1_000), ctx(0, NOW + 1));
      await repo.save(wallet);
      order.push('t1:saved');
    });

    await t1Locked.promise;
    const t2 = inTransaction(async (repo) => {
      const wallet = await repo.getForUpdate(PLAYER);
      order.push(`t2:locked:${wallet.balance.cents}`);
      wallet.debit(Money.fromCents(2_000), ctx(1, NOW + 2));
      await repo.save(wallet);
    });

    try {
      await waitForBlockedLock(orm);
      order.push('t2:waiting');
    } finally {
      // Solta T1 mesmo se a espera falhar, para não travar os hooks seguintes.
      releaseT1.resolve();
      await Promise.allSettled([t1, t2]);
    }
    await Promise.all([t1, t2]);

    expect(order).toEqual([
      't1:locked',
      't2:waiting',
      't1:saved',
      't2:locked:99000',
    ]);
    const wallet = await inTransaction((repo) => repo.getForUpdate(PLAYER));
    expect(wallet.balance.cents).toBe(97_000);
    expect(wallet.version).toBe(3);
  });

  it('um saldo de 10^11 centavos volta como number exato', async () => {
    await openWallet();
    await query('update wallets set balance = ? where player_id = ?', [
      100_000_000_000,
      PLAYER,
    ]);
    const wallet = await inTransaction((repo) => repo.getForUpdate(PLAYER));
    expect(wallet.balance.cents).toBe(100_000_000_000);
    expect(typeof wallet.balance.cents).toBe('number');
  });
});
