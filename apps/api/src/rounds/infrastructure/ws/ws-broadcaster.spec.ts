import { deferred } from '../../../../test/integration/fixtures.js';
import { Money } from '../../../shared/domain/money.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { FakeWsClient } from './testing/fake-ws-client.js';
import { WsBroadcaster } from './ws-broadcaster.js';
import { WsClients } from './ws-clients.js';

const ROUND = '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60';

describe('WsBroadcaster (D68)', () => {
  it('W4: mantém a ordem de publicação mesmo com a consulta do nickname demorando', async () => {
    const clients = new WsClients({ error: vi.fn() });
    const client = new FakeWsClient();
    clients.add(client);
    const slow = deferred<string>();
    const broadcaster = new WsBroadcaster(
      clients,
      { nicknameOf: () => slow.promise },
      new FakeClock(1_000),
      { error: vi.fn() },
    );

    broadcaster.handle({
      type: 'BetPlaced',
      betId: 'b1',
      roundId: ROUND,
      playerId: 'p1',
      amount: Money.fromCents(100),
    });
    broadcaster.handle({
      type: 'RoundStarted',
      roundId: ROUND,
      startedAt: 1_000,
    });
    await Promise.resolve();
    expect(client.sent).toEqual([]);

    slow.resolve('ana');
    await broadcaster.idle();
    expect(
      client.messages().map((message) => (message as { type: string }).type),
    ).toEqual(['bet:placed', 'round:started']);
  });

  it('W4: um evento que falha vai para o log e não trava a fila', async () => {
    const clients = new WsClients({ error: vi.fn() });
    const client = new FakeWsClient();
    clients.add(client);
    const logger = { error: vi.fn() };
    const broadcaster = new WsBroadcaster(
      clients,
      { nicknameOf: () => Promise.reject(new Error('banco fora')) },
      new FakeClock(1_000),
      logger,
    );

    broadcaster.handle({
      type: 'BetPlaced',
      betId: 'b1',
      roundId: ROUND,
      playerId: 'p1',
      amount: Money.fromCents(100),
    });
    broadcaster.handle({
      type: 'RoundStarted',
      roundId: ROUND,
      startedAt: 1_000,
    });
    await broadcaster.idle();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(client.messages()).toEqual([
      {
        type: 'round:started',
        payload: { roundId: ROUND, startedAt: 1_000 },
        serverTime: 1_000,
      },
    ]);
  });
});
