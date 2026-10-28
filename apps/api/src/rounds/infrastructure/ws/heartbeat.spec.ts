import { FakeWsClient } from './testing/fake-ws-client.js';
import { Heartbeat } from './heartbeat.js';
import { WsClients } from './ws-clients.js';

const INTERVAL = 30_000;

describe('Heartbeat (D15)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const clients = new WsClients({ error: vi.fn() });
    const heartbeat = new Heartbeat(clients, INTERVAL);
    const connect = () => {
      const client = new FakeWsClient();
      clients.add(client);
      heartbeat.watch(client);
      return client;
    };
    return { clients, heartbeat, connect };
  }

  it('HB1: pinga todos a cada intervalo; quem responde fica, quem não responde é terminado no intervalo seguinte', async () => {
    const { heartbeat, connect } = setup();
    const responsive = connect();
    const silent = connect();
    heartbeat.start();

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect([responsive.pings, silent.pings]).toEqual([1, 1]);
    responsive.emit('pong');

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(silent.terminated).toBe(true);
    expect(responsive.terminated).toBe(false);
    expect(responsive.pings).toBe(2);

    // O terminado saiu do registro: não recebe mais ping.
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(silent.pings).toBe(1);
    heartbeat.stop();
  });

  it('HB2: conexão fechada sai do heartbeat; stop cancela o intervalo', async () => {
    const { clients, heartbeat, connect } = setup();
    const leaving = connect();
    const staying = connect();
    heartbeat.start();

    clients.remove(leaving);
    heartbeat.forget(leaving);
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(leaving.pings).toBe(0);
    expect(staying.pings).toBe(1);

    heartbeat.stop();
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(staying.pings).toBe(1);
  });
});
