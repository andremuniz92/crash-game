import type { WsMessage } from '@crash/shared';
import { FakeWsClient } from './testing/fake-ws-client.js';
import { WsClients } from './ws-clients.js';

const MESSAGE: WsMessage = {
  type: 'round:started',
  payload: { roundId: 'r1', startedAt: 1 },
  serverTime: 1,
};

describe('WsClients', () => {
  it('W5: falha numa conexão não impede as outras; conexões fechadas não recebem', () => {
    const logger = { error: vi.fn() };
    const clients = new WsClients(logger);
    const broken = new FakeWsClient();
    broken.failOnSend = true;
    const healthy = new FakeWsClient();
    const closed = new FakeWsClient();
    closed.readyState = 3;
    for (const client of [broken, healthy, closed]) clients.add(client);

    clients.broadcast(MESSAGE);

    expect(healthy.messages()).toEqual([MESSAGE]);
    expect(closed.sent).toEqual([]);
    expect(logger.error).toHaveBeenCalledTimes(1);

    clients.remove(healthy);
    clients.broadcast(MESSAGE);
    expect(healthy.sent).toHaveLength(1);
  });
});
