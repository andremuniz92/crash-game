import type { CurrentRoundResponse, RoundDto, WsMessage } from '@crash/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../store/game-store.js';
import { fakeSockets } from '../testing/fake-socket.js';
import { ApiError, NetworkError } from './api-client.js';
import { createConnection } from './connection.js';
import { createServerClock } from './server-clock.js';

const URL = 'ws://localhost:3000/ws';
const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b2';
const bet = (n: number) => `b0b0b0b0-0000-4000-8000-00000000000${n}`;
/** Relógio local (falso) no início de cada teste. */
const LOCAL0 = 1_000_000;
/** Relógio do servidor: 50 s à frente do local, mais o tempo decorrido. */
const SERVER_AHEAD = 50_000;

const betting = (id: string, bettingEndsAt: number): RoundDto => ({
  status: 'BETTING',
  id,
  seedHash: 'h'.repeat(64),
  bettingEndsAt,
});
const running = (id: string): RoundDto => ({
  status: 'RUNNING',
  id,
  seedHash: 'h'.repeat(64),
  bettingEndsAt: 0,
  startedAt: 0,
});
const snapshotOf = (
  round: RoundDto | null,
  serverTime: number,
): CurrentRoundResponse => ({ round, bets: [], myBet: null, serverTime });

const msg = {
  betting: (roundId: string, serverTime: number): WsMessage => ({
    type: 'round:betting',
    payload: {
      roundId,
      seedHash: 'h'.repeat(64),
      bettingEndsAt: serverTime + 10_000,
    },
    serverTime,
  }),
  placed: (roundId: string, betId: string, serverTime: number): WsMessage => ({
    type: 'bet:placed',
    payload: { roundId, betId, nickname: 'ana', amount: 1_000 },
    serverTime,
  }),
  tick: (roundId: string, serverTime: number): WsMessage => ({
    type: 'round:tick',
    payload: { roundId, multiplier: 150 },
    serverTime,
  }),
};

/** O servidor "agora", com o atraso de ida dado (amostra = offset − atraso). */
const serverNow = (lateMs = 0) => Date.now() + SERVER_AHEAD - lateMs;

/** fetchSnapshot falso: cada chamada fica pendente até o teste resolver. */
function snapshots() {
  const calls: {
    signal: AbortSignal;
    resolve: (s: CurrentRoundResponse) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const fetchSnapshot = vi.fn(
    (signal: AbortSignal) =>
      new Promise<CurrentRoundResponse>((resolve, reject) => {
        calls.push({ signal, resolve, reject });
      }),
  );
  const call = (n: number) => {
    const found = calls[n];
    if (!found) throw new Error(`fetchSnapshot #${n} não foi chamado`);
    return found;
  };
  return { fetchSnapshot, calls, call };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

function setup() {
  const socketFactory = fakeSockets();
  const snaps = snapshots();
  const store = createGameStore();
  const now = () => Date.now();
  const clock = createServerClock({ now });
  let onlineListener: (() => void) | null = null;
  const connection = createConnection({
    url: URL,
    createSocket: socketFactory.createSocket,
    fetchSnapshot: snaps.fetchSnapshot,
    store,
    clock,
    now,
    random: () => 1,
    onOnline: (listener) => {
      onlineListener = listener;
      return () => {
        onlineListener = null;
      };
    },
  });
  const online = () => onlineListener?.();
  const status = () => store.getState().connection;

  /** Abre o socket atual e resolve o GET com o snapshot dado: fica live. */
  async function goLive(snapshot = snapshotOf(null, serverNow())) {
    socketFactory.last().open();
    snaps.call(snaps.calls.length - 1).resolve(snapshot);
    await flush();
  }

  return {
    ...socketFactory,
    ...snaps,
    store,
    clock,
    connection,
    online,
    hasOnlineListener: () => onlineListener !== null,
    status,
    goLive,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(LOCAL0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('caminho único (D74, D76)', () => {
  it('CN1: abrir → syncing → fetchSnapshot → restart do relógio → applySnapshot → buffer → live', async () => {
    const t = setup();
    const log: string[] = [];
    t.store.subscribe((state, previous) => {
      if (state.connection !== previous.connection) log.push(state.connection);
    });
    const restart = t.clock.restart.bind(t.clock);
    t.clock.restart = (...args) => {
      log.push('restart');
      restart(...args);
    };
    const load = t.store.load.bind(t.store);
    const receive = t.store.receive.bind(t.store);
    t.store.load = (snapshot) => {
      log.push('load');
      load(snapshot);
    };
    t.store.receive = (message) => {
      log.push(`receive ${message.type}`);
      receive(message);
    };
    t.fetchSnapshot.mockImplementationOnce((signal) => {
      log.push('fetch');
      return new Promise((resolve, reject) => {
        t.calls.push({ signal, resolve, reject });
      });
    });

    t.connection.start();
    expect(t.fetchSnapshot).not.toHaveBeenCalled();
    log.push('open');
    t.last().open();
    t.last().serverSends(msg.placed(B, bet(1), serverNow()));
    t.call(0).resolve(
      snapshotOf(betting(B, serverNow() + 10_000), serverNow()),
    );
    await flush();

    expect(log).toEqual([
      'open',
      'syncing',
      'fetch',
      'restart',
      'load',
      'receive bet:placed',
      'live',
    ]);
  });

  it('CN2: mensagem durante a syncing não chega à store antes do snapshot', async () => {
    const t = setup();
    t.connection.start();
    t.last().open();

    t.last().serverSends(msg.placed(B, bet(1), serverNow()));
    expect(t.store.getState().bets).toEqual([]);

    t.call(0).resolve(
      snapshotOf(betting(B, serverNow() + 10_000), serverNow()),
    );
    await flush();
    expect(t.store.getState().bets.map((b) => b.betId)).toEqual([bet(1)]);
  });

  it('CN3: no buffer, descarta serverTime < snapshot.serverTime e aplica o resto na ordem', async () => {
    const t = setup();
    t.connection.start();
    t.last().open();
    const at = serverNow();

    t.last().serverSends(msg.betting(A, at - 1)); // rodada anterior: descartada
    t.last().serverSends(msg.placed(B, bet(1), at));
    t.last().serverSends(msg.placed(B, bet(2), at + 1));
    t.call(0).resolve(snapshotOf(betting(B, at + 10_000), at));
    await flush();

    expect(t.store.getState().round?.id).toBe(B);
    expect(t.store.getState().bets.map((b) => b.betId)).toEqual([
      bet(1),
      bet(2),
    ]);
  });

  it('CN4: o buffer vira amostra do relógio depois do restart; ticks não vão para a store', async () => {
    const t = setup();
    t.connection.start();
    await t.goLive(snapshotOf(running(B), serverNow(500)));
    // Amostra antiga, com offset alto, que a ressincronização precisa descartar.
    t.last().serverSends(msg.tick(B, serverNow() + 9_000));
    expect(t.clock.offset()).toBe(SERVER_AHEAD + 9_000);

    t.connection.resync();
    const notified = vi.fn();
    t.store.subscribe(notified);
    t.last().serverSends(msg.tick(B, serverNow(20))); // a melhor amostra nova
    vi.advanceTimersByTime(100);
    t.call(1).resolve(snapshotOf(running(B), serverNow(80)));
    await flush();

    expect(t.clock.offset()).toBe(SERVER_AHEAD - 20);
    // Notificações só do snapshot e das mudanças de status, não do tick.
    const ticks = notified.mock.calls.filter(
      ([state, previous]) =>
        state.round === previous.round &&
        state.connection === previous.connection,
    );
    expect(ticks).toHaveLength(0);
  });

  it('CN5: em live, cada mensagem vira amostra do relógio e vai para a store', async () => {
    const t = setup();
    t.connection.start();
    await t.goLive(
      snapshotOf(betting(B, serverNow() + 10_000), serverNow(300)),
    );

    t.last().serverSends(msg.placed(B, bet(1), serverNow(10)));

    expect(t.clock.offset()).toBe(SERVER_AHEAD - 10);
    expect(t.store.getState().bets.map((b) => b.betId)).toEqual([bet(1)]);
  });
});

describe('geração e AbortController (D76)', () => {
  it('CN6: o GET de uma conexão antiga, resolvido depois da reconexão, não aplica nada', async () => {
    const t = setup();
    t.connection.start();
    t.last().open();
    t.last().drop();
    expect(t.call(0).signal.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    await t.goLive(snapshotOf(running(B), serverNow()));
    t.call(0).resolve(snapshotOf(running(A), serverNow()));
    await flush();

    expect(t.store.getState().round?.id).toBe(B);
    expect(t.status()).toBe('live');
  });

  it('CN7: o GET resolvido depois do dispose() não aplica nada, e o sinal dele foi abortado', async () => {
    const t = setup();
    t.connection.start();
    t.last().open();

    t.connection.dispose();
    expect(t.call(0).signal.aborted).toBe(true);
    t.call(0).resolve(snapshotOf(running(A), serverNow()));
    await flush();

    expect(t.store.getState().round).toBeNull();
  });
});

describe('falha do GET e backoff (D76)', () => {
  it.each([
    ['falha de rede', new NetworkError('network', 'x')],
    ['timeout de 10 s', new NetworkError('timeout', 'x')],
    ['401 que se esgotou', new ApiError(401, 'UNAUTHORIZED', 'x')],
  ])(
    'CN8: GET com %s fecha o socket e reconecta só depois do backoff',
    async (_case, error) => {
      const t = setup();
      t.connection.start();
      t.last().open();

      t.call(0).reject(error);
      await flush();
      expect(t.last().closed).toBe(true);
      expect(t.status()).toBe('waiting');

      await vi.advanceTimersByTimeAsync(499);
      expect(t.sockets).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(t.sockets).toHaveLength(2);
    },
  );

  it('CN11: o backoff cresce nas falhas seguidas e só zera depois de chegar a live', async () => {
    const t = setup();
    t.connection.start();
    const failNext = async () => {
      t.last().open();
      t.call(t.calls.length - 1).reject(new NetworkError('network', 'x'));
      await flush();
    };
    const expectNewSocketAfter = async (delay: number) => {
      const before = t.sockets.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(t.sockets).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(t.sockets).toHaveLength(before + 1);
    };

    await failNext();
    await expectNewSocketAfter(500);
    await failNext();
    await expectNewSocketAfter(1_000);
    await failNext();
    await expectNewSocketAfter(2_000);
    await t.goLive();
    t.last().drop();
    await expectNewSocketAfter(500);
  });

  it('CN12: o socket que cai em live vai para waiting e entra no backoff', async () => {
    const t = setup();
    t.connection.start();
    await t.goLive();

    t.last().drop();

    expect(t.status()).toBe('waiting');
    await vi.advanceTimersByTimeAsync(500);
    expect(t.sockets).toHaveLength(2);
  });

  it('CN24: error seguido de close agenda um backoff só, e depois dele existe exatamente um socket novo', async () => {
    const t = setup();
    t.connection.start();
    await t.goLive();

    t.last().fail();
    // Um timer só pendente: o do backoff (o vigia e o do open foram cancelados).
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(t.sockets).toHaveLength(2);
  });

  it('CN25: em connecting, sem open em 10 s, fecha e agenda o backoff', async () => {
    const t = setup();
    t.connection.start();

    await vi.advanceTimersByTimeAsync(9_999);
    expect(t.last().closed).toBe(false);
    expect(t.status()).toBe('connecting');

    await vi.advanceTimersByTimeAsync(1);
    expect(t.sockets[0]?.closed).toBe(true);
    expect(t.status()).toBe('waiting');
    await vi.advanceTimersByTimeAsync(500);
    expect(t.sockets).toHaveLength(2);
  });
});

describe('vigia de silêncio (D76)', () => {
  it('CN13: 30 s sem mensagem em live fecham o socket; aos 29.999 ms ainda está aberto', async () => {
    const t = setup();
    t.connection.start();
    await t.goLive(snapshotOf(running(B), serverNow()));

    await vi.advanceTimersByTimeAsync(29_999);
    expect(t.last().closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.last().closed).toBe(true);
    expect(t.status()).toBe('waiting');
  });

  it('CN14: uma mensagem aos 20 s mantém a conexão aos 30 s; ela fecha aos 50 s', async () => {
    const t = setup();
    t.connection.start();
    await t.goLive(snapshotOf(running(B), serverNow()));
    const socket = t.last();

    await vi.advanceTimersByTimeAsync(20_000);
    socket.serverSends(msg.tick(B, serverNow()));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(socket.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.closed).toBe(true);
  });

  it('CN15: em BETTING, o prazo vai até bettingEndsAt + 30 s', async () => {
    const t = setup();
    t.connection.start();
    await t.goLive(snapshotOf(betting(B, serverNow() + 60_000), serverNow()));
    const socket = t.last();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(socket.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(socket.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(socket.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.closed).toBe(true);
  });

  it('CN16: no disparo, confere agora − últimaMensagem; mensagem recente não deixa fechar', async () => {
    const t = setup();
    t.connection.start();
    await t.goLive(snapshotOf(running(B), serverNow()));
    const socket = t.last();

    await vi.advanceTimersByTimeAsync(29_000);
    socket.serverSends(msg.tick(B, serverNow()));
    await vi.advanceTimersByTimeAsync(1_000); // o timer dispara aqui
    expect(socket.closed).toBe(false);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(socket.closed).toBe(true);
  });
});

describe('evento online (D76)', () => {
  it('CN17: em waiting, reconecta na hora e cancela a espera do backoff', async () => {
    const t = setup();
    t.connection.start();
    t.last().open();
    t.call(0).reject(new NetworkError('network', 'x'));
    await flush();
    await vi.advanceTimersByTimeAsync(100);

    t.online();
    expect(t.sockets).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(t.sockets).toHaveLength(2);
  });

  it('CN18: em connecting, syncing ou live, o online não abre outro socket', async () => {
    const t = setup();
    t.connection.start();
    t.online(); // connecting
    t.last().open();
    t.online(); // syncing
    t.call(0).resolve(snapshotOf(null, serverNow()));
    await flush();
    t.online(); // live

    expect(t.status()).toBe('live');
    expect(t.sockets).toHaveLength(1);
  });
});

describe('ressincronização pedida pelo 409 (D76, D78)', () => {
  it('CN19: em live, volta a syncing no mesmo socket, com buffer, e retorna a live', async () => {
    const t = setup();
    t.connection.start();
    await t.goLive(snapshotOf(betting(B, serverNow() + 10_000), serverNow()));

    t.connection.resync();
    expect(t.status()).toBe('syncing');
    t.last().serverSends(msg.placed(B, bet(2), serverNow() + 1));
    expect(t.store.getState().bets).toEqual([]);

    t.call(1).resolve(
      snapshotOf(betting(B, serverNow() + 10_000), serverNow()),
    );
    await flush();

    expect(t.sockets).toHaveLength(1);
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(2);
    expect(t.status()).toBe('live');
    expect(t.store.getState().bets.map((b) => b.betId)).toEqual([bet(2)]);
  });

  it('CN20: em connecting, syncing ou waiting, o resync é ignorado', async () => {
    const t = setup();
    t.connection.start();
    t.connection.resync(); // connecting
    t.last().open();
    t.connection.resync(); // syncing
    expect(t.fetchSnapshot).toHaveBeenCalledTimes(1);

    t.call(0).reject(new NetworkError('network', 'x'));
    await flush();
    t.connection.resync(); // waiting

    expect(t.fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(t.sockets).toHaveLength(1);
  });
});

describe('mensagens ignoradas e dispose (D76)', () => {
  it('CN21: mensagens de um socket já fechado ou depois do dispose() não chegam à store nem ao relógio', async () => {
    const t = setup();
    t.connection.start();
    await t.goLive(
      snapshotOf(betting(B, serverNow() + 10_000), serverNow(100)),
    );
    const old = t.last();
    old.drop();

    old.serverSends(msg.placed(B, bet(1), serverNow() + 5_000));
    expect(t.store.getState().bets).toEqual([]);
    expect(t.clock.offset()).toBe(SERVER_AHEAD - 100);

    await vi.advanceTimersByTimeAsync(500);
    await t.goLive(
      snapshotOf(betting(B, serverNow() + 10_000), serverNow(100)),
    );
    const current = t.last();
    t.connection.dispose();
    current.serverSends(msg.placed(B, bet(2), serverNow() + 5_000));
    expect(t.store.getState().bets).toEqual([]);
  });

  it('CN22: JSON inválido ou type desconhecido não derrubam a conexão', async () => {
    const t = setup();
    t.connection.start();
    await t.goLive(snapshotOf(betting(B, serverNow() + 10_000), serverNow()));
    const socket = t.last();

    socket.serverSendsRaw('{oops');
    socket.serverSendsRaw(
      JSON.stringify({ type: 'round:paused', payload: {}, serverTime: 1 }),
    );
    socket.serverSends(msg.placed(B, bet(1), serverNow()));

    expect(socket.closed).toBe(false);
    expect(t.status()).toBe('live');
    expect(t.store.getState().bets.map((b) => b.betId)).toEqual([bet(1)]);
  });

  it.each([
    ['connecting', async () => undefined],
    ['live', async (t: ReturnType<typeof setup>) => t.goLive()],
    [
      'waiting',
      async (t: ReturnType<typeof setup>) => {
        await t.goLive();
        t.last().drop();
      },
    ],
  ])(
    'CN23: dispose() em %s fecha o socket, cancela os timers e não reconecta',
    async (_state, reach) => {
      const t = setup();
      t.connection.start();
      await reach(t);

      t.connection.dispose();

      expect(t.sockets.every((s) => s.closed)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      expect(t.hasOnlineListener()).toBe(false);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(t.sockets.filter((s) => !s.closed)).toHaveLength(0);
    },
  );
});
