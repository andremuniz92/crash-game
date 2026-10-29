import type { CurrentRoundResponse } from '@crash/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, NetworkError } from '../net/api-client.js';
import { createGameStore } from '../store/game-store.js';
import { fakeFetch, hang, json, offline } from '../testing/fake-fetch.js';
import { memoryStorage } from '../testing/fake-storage.js';
import { createActions } from './actions.js';
import { errorMessage } from './error-messages.js';
import { createSessionStorage, type Session, SESSION_KEY } from './session.js';

const BASE = 'http://localhost:3000';
const ROUND = '00000000-0000-4000-8000-0000000000a1';
const BET = 'b0b0b0b0-0000-4000-8000-000000000001';
const T0 = 1_800_000_000_000;
const ana: Session = {
  playerId: 'a0a0a0a0-0000-4000-8000-000000000001',
  nickname: 'ana',
  token: 'tok-ana',
};

const snapshot = (
  status: 'BETTING' | 'RUNNING',
  overrides: Partial<CurrentRoundResponse> = {},
): CurrentRoundResponse => ({
  round:
    status === 'BETTING'
      ? { status, id: ROUND, seedHash: 'h'.repeat(64), bettingEndsAt: T0 }
      : {
          status,
          id: ROUND,
          seedHash: 'h'.repeat(64),
          bettingEndsAt: T0,
          startedAt: T0,
        },
  bets: [],
  myBet: null,
  serverTime: T0,
  ...overrides,
});
const placed = { betId: BET, roundId: ROUND, amount: 1_000, balance: 99_000 };
const cashed = { betId: BET, multiplier: 182, payout: 1_820, balance: 100_820 };
const myBet = {
  betId: BET,
  amount: 1_000,
  status: 'PENDING' as const,
  cashoutMultiplier: null,
  payout: null,
};
const apiError = (status: number, code: string) =>
  json(status, { code, message: `servidor: ${code}` });

/** Promessa controlada pelo teste, para segurar uma resposta. */
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { responder: () => promise, resolve };
}

function setup(
  responders: Parameters<typeof fakeFetch>,
  {
    session = ana,
    round,
  }: { session?: Session | null; round?: CurrentRoundResponse } = {},
) {
  const fake = fakeFetch(...responders);
  const { storage, items } = memoryStorage(
    session ? { [SESSION_KEY]: JSON.stringify(session) } : {},
  );
  const store = createGameStore();
  if (round) store.load(round);
  if (session) {
    store.setState({
      ...store.getState(),
      player: { playerId: session.playerId, nickname: session.nickname },
      balance: 100_000,
    });
  }
  let keys = 0;
  const resync = vi.fn();
  const actions = createActions({
    api: createApiClient({ baseUrl: BASE, fetch: fake.fetch }),
    store,
    session: createSessionStorage(storage),
    newKey: () => `key-${++keys}`,
    resync,
    sleep: () => Promise.resolve(),
  });
  return { actions, store, calls: fake.calls, items, resync };
}

const keysOf = (calls: { headers: Record<string, string> }[]) =>
  calls.map((call) => call.headers['idempotency-key']);

afterEach(() => {
  vi.useRealTimers();
});

describe('createGuest e restoreSession (D77)', () => {
  it('AC1: createGuest grava a sessão e põe jogador e saldo na store', async () => {
    const { actions, store, items } = setup(
      [
        json(201, {
          playerId: ana.playerId,
          nickname: 'ana',
          token: ana.token,
          balance: 100_000,
        }),
      ],
      { session: null },
    );

    expect(await actions.createGuest('ana')).toEqual({ status: 'done' });
    expect(JSON.parse(items.get(SESSION_KEY) ?? 'null')).toEqual(ana);
    expect(store.getState()).toMatchObject({
      player: { playerId: ana.playerId, nickname: 'ana' },
      balance: 100_000,
    });
  });

  it('RT9: createGuest não retenta, porque não tem Idempotency-Key', async () => {
    const { actions, calls } = setup([offline, offline], { session: null });

    expect(await actions.createGuest('ana')).toEqual({
      status: 'failed',
      message: errorMessage(new NetworkError('network', '')),
    });
    expect(calls).toHaveLength(1);
  });

  it('AC2: restoreSession põe o jogador na store e busca o saldo com Bearer', async () => {
    const { actions, store, calls } = setup([
      json(200, { balance: 98_500, entries: [] }),
    ]);
    store.setState({ ...store.getState(), player: null, balance: null });

    await actions.restoreSession();

    expect(calls[0]).toMatchObject({ url: `${BASE}/wallet` });
    expect(calls[0]?.headers.authorization).toBe('Bearer tok-ana');
    expect(store.getState()).toMatchObject({
      player: { playerId: ana.playerId, nickname: 'ana' },
      balance: 98_500,
    });
  });

  it('AC2: restoreSession com 401 apaga a sessão e deixa a store sem jogador', async () => {
    const { actions, store, items } = setup([apiError(401, 'UNAUTHORIZED')]);

    await actions.restoreSession();

    expect(items.has(SESSION_KEY)).toBe(false);
    expect(store.getState()).toMatchObject({ player: null, balance: null });
  });
});

describe('placeBet e cashOut: sucesso e Idempotency-Key (D78)', () => {
  it('AC3: placeBet define o myBet PENDING e o saldo da resposta', async () => {
    const { actions, store, calls } = setup([json(201, placed)], {
      round: snapshot('BETTING'),
    });

    expect(await actions.placeBet(1_000)).toEqual({ status: 'done' });
    expect(calls[0]?.body).toEqual({ amount: 1_000 });
    expect(store.getState()).toMatchObject({ myBet, balance: 99_000 });
  });

  it('AC4: cashOut encerra o myBet com multiplicador e payout, e atualiza o saldo', async () => {
    const { actions, store, calls } = setup([json(200, cashed)], {
      round: snapshot('RUNNING', { myBet }),
    });

    expect(await actions.cashOut()).toEqual({ status: 'done' });
    expect(calls[0]?.url).toBe(`${BASE}/bets/${BET}/cashout`);
    expect(store.getState()).toMatchObject({
      myBet: {
        ...myBet,
        status: 'CASHED_OUT',
        cashoutMultiplier: 182,
        payout: 1_820,
      },
      balance: 100_820,
    });
  });

  it('RT1: as retentativas por falha de rede levam a mesma Idempotency-Key', async () => {
    const { actions, calls } = setup([offline, offline, json(201, placed)], {
      round: snapshot('BETTING'),
    });

    expect(await actions.placeBet(1_000)).toEqual({ status: 'done' });
    expect(keysOf(calls)).toEqual(['key-1', 'key-1', 'key-1']);
  });

  it('RT2: a retentativa depois do timeout de 10 s leva a mesma Idempotency-Key', async () => {
    vi.useFakeTimers();
    const { actions, calls } = setup([hang, json(200, cashed)], {
      round: snapshot('RUNNING', { myBet }),
    });

    const result = actions.cashOut();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await result).toEqual({ status: 'done' });
    expect(keysOf(calls)).toEqual(['key-1', 'key-1']);
  });

  it('RT8: dois cliques em sequência mandam chaves diferentes', async () => {
    const { actions, calls } = setup(
      [apiError(422, 'INSUFFICIENT_BALANCE'), json(201, placed)],
      { round: snapshot('BETTING') },
    );

    await actions.placeBet(1_000);
    await actions.placeBet(1_000);

    expect(keysOf(calls)).toEqual(['key-1', 'key-2']);
  });
});

describe('placeBet e cashOut: erros (D77, D78)', () => {
  const STATE_CONFLICTS = [
    'ROUND_NOT_ACCEPTING_BETS',
    'BET_ALREADY_PLACED',
    'ROUND_NOT_RUNNING',
    'BET_NOT_PENDING',
    'TOO_LATE',
  ];
  const run = {
    placeBet: (code: string, status: number) =>
      setup([apiError(status, code)], { round: snapshot('BETTING') }),
    cashOut: (code: string, status: number) =>
      setup([apiError(status, code)], {
        round: snapshot('RUNNING', { myBet }),
      }),
  };

  describe.each(['placeBet', 'cashOut'] as const)('%s', (action) => {
    it.each(STATE_CONFLICTS)(
      'AC5: 409 %s chama a ressincronização uma vez e devolve a mensagem',
      async (code) => {
        const { actions, resync } = run[action](code, 409);

        expect(await actions[action](1_000)).toEqual({
          status: 'failed',
          message: errorMessage(new ApiError(409, code, '')),
        });
        expect(resync).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      [422, 'INSUFFICIENT_BALANCE'],
      [422, 'IDEMPOTENCY_KEY_REUSED'],
      [400, 'VALIDATION_ERROR'],
    ])('AC6: %i %s não chama a ressincronização', async (status, code) => {
      const { actions, resync } = run[action](code, status);

      expect(await actions[action](1_000)).toMatchObject({ status: 'failed' });
      expect(resync).not.toHaveBeenCalled();
    });

    it('AC7: 401 apaga a sessão e tira o jogador da store', async () => {
      const { actions, store, items } = run[action]('UNAUTHORIZED', 401);

      expect(await actions[action](1_000)).toMatchObject({ status: 'failed' });
      expect(items.has(SESSION_KEY)).toBe(false);
      expect(store.getState()).toMatchObject({ player: null, balance: null });
    });
  });
});

describe('placeBet e cashOut: pending e chamadas simultâneas (D78)', () => {
  const flag = { placeBet: 'bet', cashOut: 'cashOut' } as const;
  const round = {
    placeBet: snapshot('BETTING'),
    cashOut: snapshot('RUNNING', { myBet }),
  };
  const ok = { placeBet: json(201, placed), cashOut: json(200, cashed) };

  describe.each(['placeBet', 'cashOut'] as const)('%s', (action) => {
    it('AC8: pending fica true durante a requisição, inclusive na retentativa, e volta a false no sucesso', async () => {
      const held = deferred();
      const { actions, store } = setup([offline, held.responder], {
        round: round[action],
      });

      const result = actions[action](1_000);
      await vi.waitFor(() => {
        expect(store.getState().pending[flag[action]]).toBe(true);
      });
      // Já na segunda tentativa, segurada pelo teste.
      await new Promise((r) => setTimeout(r, 0));
      expect(store.getState().pending[flag[action]]).toBe(true);

      const body = action === 'placeBet' ? placed : cashed;
      held.resolve(new Response(JSON.stringify(body), { status: 200 }));
      expect(await result).toEqual({ status: 'done' });
      expect(store.getState().pending[flag[action]]).toBe(false);
    });

    it.each([
      ['erro da API', apiError(422, 'IDEMPOTENCY_KEY_REUSED')],
      ['NetworkError depois das retentativas', offline],
    ])('AC8: pending volta a false depois de %s', async (_case, responder) => {
      const { actions, store } = setup([responder, responder, responder], {
        round: round[action],
      });

      expect(await actions[action](1_000)).toMatchObject({ status: 'failed' });
      expect(store.getState().pending[flag[action]]).toBe(false);
    });

    it('AC8: uma segunda chamada com a primeira em andamento é ignorada, sem requisição', async () => {
      const held = deferred();
      const { actions, calls } = setup([held.responder, ok[action]], {
        round: round[action],
      });

      const first = actions[action](1_000);
      expect(await actions[action](1_000)).toEqual({ status: 'ignored' });
      expect(calls).toHaveLength(1);

      const body = action === 'placeBet' ? placed : cashed;
      held.resolve(new Response(JSON.stringify(body), { status: 200 }));
      await first;
    });
  });

  it('AC9: cashOut sem myBet PENDING não faz requisição', async () => {
    const { actions, calls } = setup([], { round: snapshot('RUNNING') });

    expect(await actions.cashOut()).toEqual({ status: 'ignored' });
    expect(calls).toHaveLength(0);
  });
});

describe('fetchSnapshot (D76, D77)', () => {
  it('SN1: com sessão, manda Bearer, aplica o snapshot e o devolve', async () => {
    const response = snapshot('RUNNING', { myBet });
    const { actions, store, calls } = setup([json(200, response)]);

    expect(await actions.fetchSnapshot()).toEqual(response);
    expect(calls[0]?.headers.authorization).toBe('Bearer tok-ana');
    expect(store.getState()).toMatchObject({ round: response.round, myBet });
  });

  it('SN2: 401 apaga a sessão e refaz o GET sem Bearer, uma vez', async () => {
    const anonymous = snapshot('BETTING');
    const { actions, store, calls, items } = setup([
      apiError(401, 'UNAUTHORIZED'),
      json(200, anonymous),
    ]);

    expect(await actions.fetchSnapshot()).toEqual(anonymous);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers.authorization).toBe('Bearer tok-ana');
    expect(calls[1]?.headers.authorization).toBeUndefined();
    expect(items.has(SESSION_KEY)).toBe(false);
    expect(store.getState()).toMatchObject({
      player: null,
      round: anonymous.round,
    });
  });

  it('SN3: 401 seguido de outro 401 sobe o erro depois de exatamente 2 chamadas', async () => {
    const { actions, calls } = setup([
      apiError(401, 'UNAUTHORIZED'),
      apiError(401, 'UNAUTHORIZED'),
      apiError(401, 'UNAUTHORIZED'),
    ]);

    await expect(actions.fetchSnapshot()).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(2);
  });

  it('SN4: falha de rede sobe para quem chamou, sem retentar aqui', async () => {
    const { actions, calls } = setup([offline, offline]);

    await expect(actions.fetchSnapshot()).rejects.toBeInstanceOf(NetworkError);
    expect(calls).toHaveLength(1);
  });
});
