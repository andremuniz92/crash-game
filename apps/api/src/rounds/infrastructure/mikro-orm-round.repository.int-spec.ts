import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { testOrm } from '../../../test/integration/test-orm.js';
import { CorruptedRoundError, Round } from '../domain/round.js';
import { ServerSeed } from '../domain/server-seed.js';
import { MikroOrmRoundRepository } from './mikro-orm-round.repository.js';

/* Vetores do M1: 1,26x (crash em 3.852 ms) e 15,85x. */
const LOW = {
  seed: '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad',
  id: '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60',
};
const HIGH = {
  seed: 'dabbdcfa82ee4f2e349ef253955ca74a8cdc6abde9f63f87840a9659bf665921',
  id: '11111111-2222-4333-8444-000000000004',
};
const BETTING_ENDS_AT = 1_700_000_010_000;
const CRASH_AT = BETTING_ENDS_AT + 3_852;

function newRound(vector = LOW): Round {
  return Round.create({
    id: vector.id,
    serverSeed: ServerSeed.fromHex(vector.seed),
    bettingEndsAt: BETTING_ENDS_AT,
  });
}

async function repo(): Promise<MikroOrmRoundRepository> {
  return new MikroOrmRoundRepository((await testOrm()).em.fork());
}

describe('MikroOrmRoundRepository', () => {
  it('save e findById fazem ida e volta em BETTING, RUNNING e CRASHED na mesma linha', async () => {
    const round = newRound();
    await (await repo()).save(round);
    expect((await (await repo()).findById(LOW.id))?.status).toBe('BETTING');

    round.start(BETTING_ENDS_AT);
    await (await repo()).save(round);
    const running = await (await repo()).findById(LOW.id);
    expect(running?.status).toBe('RUNNING');
    expect(running?.acceptsCashOutAt(CRASH_AT - 1)).toBe(true);
    expect(running?.acceptsCashOutAt(CRASH_AT)).toBe(false);

    round.crash(CRASH_AT);
    await (await repo()).save(round);
    const crashed = await (await repo()).findById(LOW.id);
    expect(crashed?.status).toBe('CRASHED');
    expect(crashed?.crashedAt).toBe(CRASH_AT);
    expect(crashed?.revealCrashPoint().x100).toBe(126);
    expect(crashed?.revealServerSeed().toHex()).toBe(LOW.seed);

    const [count] = await (
      await testOrm()
    ).em
      .getConnection()
      .execute<{ n: number }[]>('select count(*)::int as n from rounds');
    expect(count?.n).toBe(1);
  });

  it('findById de um id inexistente devolve null', async () => {
    expect(
      await (await repo()).findById('00000000-0000-4000-8000-000000000000'),
    ).toBeNull();
  });

  it('findCurrent devolve a rodada não crashada; sem ela, devolve null', async () => {
    const crashed = newRound(LOW);
    crashed.start(BETTING_ENDS_AT);
    crashed.crash(CRASH_AT);
    await (await repo()).save(crashed);
    expect(await (await repo()).findCurrent()).toBeNull();

    await (await repo()).save(newRound(HIGH));
    expect((await (await repo()).findCurrent())?.id).toBe(HIGH.id);
  });

  it('o banco recusa uma segunda rodada não crashada', async () => {
    await (await repo()).save(newRound(LOW));
    await expect((await repo()).save(newRound(HIGH))).rejects.toThrow(
      UniqueConstraintViolationException,
    );
  });

  it('uma linha adulterada no banco faz findById lançar CorruptedRoundError', async () => {
    await (await repo()).save(newRound(LOW));
    await (
      await testOrm()
    ).em
      .getConnection()
      .execute('update rounds set crash_point = 500 where id = ?', [LOW.id]);
    await expect((await repo()).findById(LOW.id)).rejects.toThrow(
      CorruptedRoundError,
    );
  });
});
