import type { CurrentRoundResponse, WsMessage } from '@crash/shared';
import { describe, expect, it, vi } from 'vitest';
import { createGameStore } from './game-store.js';

const ROUND = '00000000-0000-4000-8000-0000000000a1';
const T0 = 1_800_000_000_000;

const snapshot: CurrentRoundResponse = {
  round: {
    status: 'BETTING',
    id: ROUND,
    seedHash: 'h'.repeat(64),
    bettingEndsAt: T0 + 10_000,
  },
  bets: [],
  myBet: null,
  serverTime: T0,
};
const placed: WsMessage = {
  type: 'bet:placed',
  payload: {
    roundId: ROUND,
    betId: 'b0b0b0b0-0000-4000-8000-000000000001',
    nickname: 'ana',
    amount: 1_000,
  },
  serverTime: T0 + 1_000,
};
const tick: WsMessage = {
  type: 'round:tick',
  payload: { roundId: ROUND, multiplier: 150 },
  serverTime: T0 + 1_100,
};
const otherRoundStarted: WsMessage = {
  type: 'round:started',
  payload: {
    roundId: '00000000-0000-4000-8000-0000000000a2',
    startedAt: T0,
  },
  serverTime: T0,
};

describe('createGameStore (D75)', () => {
  it('GS1: load e receive aplicam os redutores, e o getState mostra o resultado', () => {
    const store = createGameStore();

    store.load(snapshot);
    store.receive(placed);

    expect(store.getState().round).toEqual(snapshot.round);
    expect(store.getState().bets.map((b) => b.nickname)).toEqual(['ana']);
  });

  it('GS2: inscrito não é avisado por tick nem por mensagem ignorada; é avisado uma vez por bet:placed', () => {
    const store = createGameStore();
    store.load(snapshot);
    const listener = vi.fn();
    store.subscribe(listener);

    store.receive(tick);
    store.receive(otherRoundStarted);
    expect(listener).not.toHaveBeenCalled();

    store.receive(placed);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
