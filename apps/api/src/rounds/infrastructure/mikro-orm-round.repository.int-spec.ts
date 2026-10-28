import {
  UniqueConstraintViolationException,
  ValidationError,
} from '@mikro-orm/core';
import {
  deferred,
  waitForBlockedLock,
} from '../../../test/integration/fixtures.js';
import { testOrm } from '../../../test/integration/test-orm.js';
import { CorruptedRoundError, Round } from '../domain/round.js';
import { RoundNotFoundError } from '../domain/round-repository.js';
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

const HIGH_CRASH_AT = BETTING_ENDS_AT + 46_053;
const MISSING = '00000000-0000-4000-8000-000000000000';

function crashed(vector: typeof LOW, crashAt: number): Round {
  const round = newRound(vector);
  round.start(BETTING_ENDS_AT);
  round.crash(crashAt);
  return round;
}

async function inTransaction<T>(
  work: (repo: MikroOrmRoundRepository) => Promise<T>,
): Promise<T> {
  return (await testOrm()).em
    .fork()
    .transactional((em) => work(new MikroOrmRoundRepository(em)));
}

describe('MikroOrmRoundRepository: locks (D57)', () => {
  it('RR6: as leituras com lock devolvem a mesma rodada e exigem transação', async () => {
    await (await repo()).save(newRound(LOW));

    const [current, byId, forUpdate] = await inTransaction(async (r) => [
      await r.findCurrentForShare(),
      await r.findByIdForShare(LOW.id),
      await r.getForUpdate(LOW.id),
    ]);
    for (const round of [current, byId, forUpdate]) {
      expect(round?.id).toBe(LOW.id);
      expect(round?.status).toBe('BETTING');
      expect(round?.seedHash.toHex()).toBe(newRound(LOW).seedHash.toHex());
    }
    expect(await inTransaction((r) => r.findByIdForShare(MISSING))).toBeNull();

    const outside = await repo();
    await expect(outside.findCurrentForShare()).rejects.toThrow(
      ValidationError,
    );
    await expect(outside.findByIdForShare(LOW.id)).rejects.toThrow(
      ValidationError,
    );
    await expect(outside.getForUpdate(LOW.id)).rejects.toThrow(ValidationError);
  });

  it('RR7: getForUpdate de id inexistente lança RoundNotFoundError', async () => {
    await expect(inTransaction((r) => r.getForUpdate(MISSING))).rejects.toThrow(
      RoundNotFoundError,
    );
  });

  it('RR8: FOR SHARE não bloqueia FOR SHARE; getForUpdate espera o commit', async () => {
    await (await repo()).save(newRound(LOW));
    const orm = await testOrm();
    const t1Shared = deferred();
    const releaseT1 = deferred();
    const order: string[] = [];

    const t1 = orm.em.fork().transactional(async (em) => {
      await new MikroOrmRoundRepository(em).findCurrentForShare();
      order.push('t1:share');
      t1Shared.resolve();
      await releaseT1.promise;
      order.push('t1:commit');
    });
    await t1Shared.promise;

    let t3: Promise<void> | undefined;
    try {
      // Um segundo FOR SHARE termina enquanto T1 ainda segura o dele.
      await orm.em.fork().transactional(async (em) => {
        await new MikroOrmRoundRepository(em).findByIdForShare(LOW.id);
        order.push('t2:share');
      });

      t3 = orm.em.fork().transactional(async (em) => {
        await new MikroOrmRoundRepository(em).getForUpdate(LOW.id);
        order.push('t3:update');
      });
      await waitForBlockedLock(orm);
      order.push('t3:waiting');
    } finally {
      releaseT1.resolve();
      await Promise.allSettled([t1, t3]);
    }
    await Promise.all([t1, t3]);

    expect(order).toEqual([
      't1:share',
      't2:share',
      't3:waiting',
      't1:commit',
      't3:update',
    ]);
  });

  it('RR9: findLatestCrashed devolve a crashada mais recente, ou null', async () => {
    expect(await (await repo()).findLatestCrashed()).toBeNull();

    await (await repo()).save(crashed(HIGH, HIGH_CRASH_AT));
    await (await repo()).save(crashed(LOW, CRASH_AT));
    const latest = await (await repo()).findLatestCrashed();

    expect(latest?.id).toBe(HIGH.id);
    expect(latest?.crashedAt).toBe(HIGH_CRASH_AT);
  });
});
