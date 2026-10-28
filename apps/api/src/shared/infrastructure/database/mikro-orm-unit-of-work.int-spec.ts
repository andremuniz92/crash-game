import { insertPlayer } from '../../../../test/integration/fixtures.js';
import { testOrm } from '../../../../test/integration/test-orm.js';
import { Wallet } from '../../../wallet/domain/wallet.js';
import { MikroOrmUnitOfWork } from './mikro-orm-unit-of-work.js';

const PLAYER = 'd1d1d1d1-0000-4000-8000-000000000001';
const OTHER = 'd1d1d1d1-0000-4000-8000-000000000002';
const NOW = 1_700_000_000_000;

async function unitOfWork(): Promise<MikroOrmUnitOfWork> {
  return new MikroOrmUnitOfWork(await testOrm());
}

async function query<T>(sql: string): Promise<T[]> {
  return (await testOrm()).em.getConnection().execute<T[]>(sql);
}

async function walletCount(): Promise<number> {
  const [row] = await query<{ n: number }>(
    'select count(*)::int as n from wallets',
  );
  return row?.n ?? 0;
}

beforeEach(async () => {
  const orm = await testOrm();
  await insertPlayer(orm, PLAYER);
  await insertPlayer(orm, OTHER);
});

describe('MikroOrmUnitOfWork (D56)', () => {
  it('U1: faz commit e devolve o valor do work', async () => {
    const uow = await unitOfWork();

    const result = await uow.run(async ({ wallets }) => {
      await wallets.save(Wallet.open({ playerId: PLAYER, now: NOW }));
      return 'feito';
    });

    expect(result).toBe('feito');
    expect(await walletCount()).toBe(1);
  });

  it('U2: faz rollback quando o work lança, e o erro sai com a mesma instância', async () => {
    const uow = await unitOfWork();
    const error = new Error('falhou no meio');

    const run = uow.run(async ({ wallets }) => {
      await wallets.save(Wallet.open({ playerId: PLAYER, now: NOW }));
      throw error;
    });

    await expect(run).rejects.toBe(error);
    expect(await walletCount()).toBe(0);
  });

  it('U3: os repositórios recebidos estão na transação (ForUpdate funciona)', async () => {
    const uow = await unitOfWork();
    await uow.run(({ wallets }) =>
      wallets.save(Wallet.open({ playerId: PLAYER, now: NOW })),
    );

    const balance = await uow.run(async ({ wallets }) => {
      const wallet = await wallets.getForUpdate(PLAYER);
      return wallet.balance.cents;
    });

    expect(balance).toBe(Wallet.INITIAL_BALANCE.cents);
  });

  it('U4: cada run é uma transação separada', async () => {
    const uow = await unitOfWork();

    await uow.run(({ wallets }) =>
      wallets.save(Wallet.open({ playerId: PLAYER, now: NOW })),
    );
    await expect(
      uow.run(async ({ wallets }) => {
        await wallets.save(Wallet.open({ playerId: OTHER, now: NOW }));
        throw new Error('desfaz só o segundo');
      }),
    ).rejects.toThrow('desfaz só o segundo');

    expect(await walletCount()).toBe(1);
    const [row] = await query<{ player_id: string }>(
      'select player_id from wallets',
    );
    expect(row?.player_id).toBe(PLAYER);
  });
});
