import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFetch, hang, html, json, offline } from '../testing/fake-fetch.js';
import { ApiError, createApiClient, NetworkError } from './api-client.js';

const BASE = 'http://localhost:3000';
const KEY = 'c8c8c8c8-0000-4000-8000-000000000001';
const BET = 'b0b0b0b0-0000-4000-8000-000000000001';

function client(...responders: Parameters<typeof fakeFetch>) {
  const fake = fakeFetch(...responders);
  return {
    api: createApiClient({ baseUrl: BASE, fetch: fake.fetch }),
    calls: fake.calls,
  };
}

/** O erro com que a promessa rejeita, para olhar os campos. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('esperava rejeição, mas a promessa resolveu');
}

describe('createApiClient (seção 8.1)', () => {
  it('A1: o Bearer só vai quando há token', async () => {
    const { api, calls } = client(
      json(200, { round: null, bets: [], myBet: null, serverTime: 1 }),
      json(200, { round: null, bets: [], myBet: null, serverTime: 2 }),
    );

    await api.currentRound(null);
    await api.currentRound('tok');

    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: `${BASE}/rounds/current`,
    });
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[1]?.headers.authorization).toBe('Bearer tok');
  });

  it('A2: POST /bets manda o valor em JSON e a Idempotency-Key', async () => {
    const response = {
      betId: BET,
      roundId: 'r',
      amount: 1_000,
      balance: 99_000,
    };
    const { api, calls } = client(json(201, response));

    expect(await api.placeBet('tok', 1_000, KEY)).toEqual(response);
    expect(calls[0]).toEqual({
      url: `${BASE}/bets`,
      method: 'POST',
      headers: {
        authorization: 'Bearer tok',
        'content-type': 'application/json',
        'idempotency-key': KEY,
      },
      body: { amount: 1_000 },
    });
  });

  it('A3: o cash out usa o betId na URL, com a Idempotency-Key e sem corpo', async () => {
    const { api, calls } = client(
      json(200, {
        betId: BET,
        multiplier: 150,
        payout: 1_500,
        balance: 100_500,
      }),
    );

    await api.cashOut('tok', BET, KEY);

    expect(calls[0]).toMatchObject({
      url: `${BASE}/bets/${BET}/cashout`,
      method: 'POST',
      body: undefined,
    });
    expect(calls[0]?.headers['idempotency-key']).toBe(KEY);
  });

  it('A4: erro com { code, message } vira ApiError com os três campos', async () => {
    const { api } = client(
      json(409, { code: 'TOO_LATE', message: 'a rodada já crashou' }),
    );

    const error = await rejection(api.cashOut('tok', BET, KEY));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'TOO_LATE',
      message: 'a rodada já crashou',
    });
  });

  it('A5: erro sem JSON (página de um proxy) vira ApiError HTTP_ERROR', async () => {
    const { api } = client(html(502));

    const error = await rejection(api.history());

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'HTTP_ERROR' });
  });

  it('A6: fetch rejeitado vira NetworkError de rede', async () => {
    const { api } = client(offline);

    const error = await rejection(api.history());

    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toMatchObject({ kind: 'network' });
  });

  it('A9: abortar o sinal externo rejeita a requisição (AbortError) e cancela o timer do timeout', async () => {
    vi.useFakeTimers();
    const { api } = client(hang);
    const outside = new AbortController();

    const request = rejection(api.currentRound('tok', outside.signal));
    outside.abort();
    const error = await request;

    expect(error).toMatchObject({ name: 'AbortError' });
    expect(error).not.toBeInstanceOf(NetworkError);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  describe('timeout de 10 s', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('A7: ainda pendente aos 9.999 ms; aos 10.000 ms, aborta com NetworkError de timeout', async () => {
      const { api } = client(hang);
      let settled: unknown = 'pendente';
      const request = api.history().then(
        () => 'resolveu',
        (error: unknown) => error,
      );
      void request.then((value) => {
        settled = value;
      });

      await vi.advanceTimersByTimeAsync(9_999);
      expect(settled).toBe('pendente');

      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBeInstanceOf(NetworkError);
      expect(settled).toMatchObject({ kind: 'timeout' });
    });

    it('A8: a resposta cancela o timer do timeout', async () => {
      const { api } = client(json(200, []));

      await api.history();

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
