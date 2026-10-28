import { testOrm } from '../../../test/integration/test-orm.js';
import { Round } from '../domain/round.js';
import { ServerSeed } from '../domain/server-seed.js';
import { MikroOrmRoundRepository } from './mikro-orm-round.repository.js';
import { RoundQueries } from './round-queries.js';

/* Vetores do M1 (round.spec.ts). */
const LOW = {
  seed: '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad',
  id: '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60',
  crashPoint: 126,
  timeToCrash: 3_852,
};
const HIGH = {
  seed: 'dabbdcfa82ee4f2e349ef253955ca74a8cdc6abde9f63f87840a9659bf665921',
  id: '11111111-2222-4333-8444-000000000004',
  crashPoint: 1_585,
  timeToCrash: 46_053,
};
const INSTANT = {
  seed: '4ea5e13de9e0aa99a3c8cb6c5ea849b44783b31f8a6056062203142341f07dfe',
  id: '00000000-0000-4000-8000-000000000034',
  crashPoint: 100,
  timeToCrash: 0,
};
const OPEN = {
  seed: 'c'.repeat(64),
  id: '00000000-0000-4000-8000-0000000000ff',
};
const T0 = Date.parse('2026-10-28T12:00:00.000Z');

async function save(round: Round): Promise<void> {
  await new MikroOrmRoundRepository((await testOrm()).em.fork()).save(round);
}

/** Rodada crashada que começou em `startedAt`. */
async function crashed(vector: typeof LOW, startedAt: number): Promise<number> {
  const round = Round.create({
    id: vector.id,
    serverSeed: ServerSeed.fromHex(vector.seed),
    bettingEndsAt: startedAt,
  });
  round.start(startedAt);
  const crashedAt = startedAt + vector.timeToCrash;
  round.crash(crashedAt);
  await save(round);
  return crashedAt;
}

describe('RoundQueries', () => {
  it('Q1: histórico só com crashadas, da mais recente para a mais antiga, respeitando o limit', async () => {
    const lowAt = await crashed(LOW, T0);
    const instantAt = await crashed(INSTANT, T0 + 100_000);
    const highAt = await crashed(HIGH, T0 + 200_000);
    await save(
      Round.create({
        id: OPEN.id,
        serverSeed: ServerSeed.fromHex(OPEN.seed),
        bettingEndsAt: T0 + 300_000,
      }),
    );
    const queries = new RoundQueries(await testOrm());

    expect(await queries.history(10)).toEqual([
      { id: HIGH.id, crashPoint: HIGH.crashPoint, crashedAt: highAt },
      { id: INSTANT.id, crashPoint: INSTANT.crashPoint, crashedAt: instantAt },
      { id: LOW.id, crashPoint: LOW.crashPoint, crashedAt: lowAt },
    ]);
    expect((await queries.history(2)).map((item) => item.id)).toEqual([
      HIGH.id,
      INSTANT.id,
    ]);
  });
});
