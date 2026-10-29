import type {
  BettingRoundDto,
  CurrentRoundResponse,
  MyBetDto,
  RoundBetDto,
  RoundDto,
  RunningRoundDto,
  WsMessage,
} from '@crash/shared';
import { describe, expect, it } from 'vitest';
import {
  applyMessage,
  applySnapshot,
  type GameState,
  HISTORY_LIMIT,
  initialGameState,
} from './game-state.js';

const ROUND = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const SEED_HASH = 'h'.repeat(64);
const SEED = 's'.repeat(64);
const T0 = 1_800_000_000_000;
const bet = (n: number) => `b0b0b0b0-0000-4000-8000-00000000000${n}`;

const betting = (id = ROUND): BettingRoundDto => ({
  status: 'BETTING',
  id,
  seedHash: SEED_HASH,
  bettingEndsAt: T0 + 10_000,
});
const running = (id = ROUND): RunningRoundDto => ({
  ...betting(id),
  status: 'RUNNING',
  startedAt: T0 + 10_000,
});
const pending = (
  betId: string,
  nickname: string,
  amount: number,
): RoundBetDto => ({
  betId,
  nickname,
  amount,
  status: 'PENDING',
  cashoutMultiplier: null,
  payout: null,
});
const myPending = (betId: string, amount: number): MyBetDto => ({
  betId,
  amount,
  status: 'PENDING',
  cashoutMultiplier: null,
  payout: null,
});
const state = (overrides: Partial<GameState>): GameState => ({
  ...initialGameState,
  ...overrides,
});

const msg = {
  betting: (roundId = ROUND): WsMessage => ({
    type: 'round:betting',
    payload: { roundId, seedHash: SEED_HASH, bettingEndsAt: T0 + 10_000 },
    serverTime: T0,
  }),
  started: (roundId = ROUND): WsMessage => ({
    type: 'round:started',
    payload: { roundId, startedAt: T0 + 10_000 },
    serverTime: T0 + 10_000,
  }),
  crashed: (roundId = ROUND, crashPoint = 235): WsMessage => ({
    type: 'round:crashed',
    payload: { roundId, crashPoint, serverSeed: SEED },
    serverTime: T0 + 25_000,
  }),
  tick: (roundId = ROUND): WsMessage => ({
    type: 'round:tick',
    payload: { roundId, multiplier: 150 },
    serverTime: T0 + 17_000,
  }),
  placed: (betId: string, nickname = 'ana', roundId = ROUND): WsMessage => ({
    type: 'bet:placed',
    payload: { roundId, betId, nickname, amount: 1_000 },
    serverTime: T0 + 1_000,
  }),
  cashedOut: (betId: string, nickname = 'ana'): WsMessage => ({
    type: 'bet:cashed_out',
    payload: {
      roundId: ROUND,
      betId,
      nickname,
      multiplier: 182,
      payout: 1_820,
    },
    serverTime: T0 + 20_000,
  }),
};

describe('applySnapshot (D75)', () => {
  it('G1: o estado inicial não tem rodada, apostas, myBet nem histórico', () => {
    expect(initialGameState).toEqual({
      round: null,
      bets: [],
      myBet: null,
      history: [],
    });
  });

  it('G2: monta rodada, apostas e myBet de cada variante; não mexe no histórico', () => {
    const history = [{ id: OTHER, crashPoint: 150, crashedAt: T0 - 5_000 }];
    const crashed: RoundDto = {
      ...running(),
      status: 'CRASHED',
      crashedAt: T0 + 25_000,
      crashPoint: 235,
      serverSeed: SEED,
    };
    for (const round of [betting(), running(), crashed]) {
      const snapshot: CurrentRoundResponse = {
        round,
        bets: [pending(bet(1), 'ana', 1_000)],
        myBet: myPending(bet(1), 1_000),
        serverTime: T0,
      };
      expect(applySnapshot(state({ history }), snapshot)).toEqual({
        round,
        bets: snapshot.bets,
        myBet: snapshot.myBet,
        history,
      });
    }
  });

  it('G3: snapshot sem rodada (antes da primeira) zera rodada e apostas', () => {
    const before = state({
      round: running(),
      bets: [pending(bet(1), 'ana', 1_000)],
    });
    const after = applySnapshot(before, {
      round: null,
      bets: [],
      myBet: null,
      serverTime: T0,
    });
    expect(after.round).toBeNull();
    expect(after.bets).toEqual([]);
  });

  it('G4: o snapshot substitui apostas e myBet por inteiro', () => {
    const before = state({
      round: running(OTHER),
      bets: [pending(bet(1), 'ana', 1_000)],
      myBet: myPending(bet(1), 1_000),
    });
    const after = applySnapshot(before, {
      round: betting(),
      bets: [pending(bet(2), 'bia', 500)],
      myBet: null,
      serverTime: T0,
    });
    expect(after.bets).toEqual([pending(bet(2), 'bia', 500)]);
    expect(after.myBet).toBeNull();
  });
});

describe('applyMessage: rodada (D75)', () => {
  it('G5: round:betting de outra rodada abre a nova, sem apostas e sem myBet', () => {
    const before = state({
      round: running(OTHER),
      bets: [pending(bet(1), 'ana', 1_000)],
      myBet: myPending(bet(1), 1_000),
    });
    expect(applyMessage(before, msg.betting())).toEqual({
      ...before,
      round: betting(),
      bets: [],
      myBet: null,
    });
  });

  it('G6: round:betting repetido da rodada atual devolve o mesmo estado', () => {
    const before = state({
      round: betting(),
      bets: [pending(bet(1), 'ana', 1_000)],
    });
    expect(applyMessage(before, msg.betting())).toBe(before);
  });

  it('G7: round:started leva a rodada em BETTING a RUNNING, com o startedAt', () => {
    const before = state({ round: betting() });
    expect(applyMessage(before, msg.started()).round).toEqual(running());
  });

  it('G8: round:started e round:crashed de outra rodada são ignorados', () => {
    const atBetting = state({ round: betting() });
    const atRunning = state({ round: running() });
    expect(applyMessage(atBetting, msg.started(OTHER))).toBe(atBetting);
    expect(applyMessage(atRunning, msg.crashed(OTHER))).toBe(atRunning);
  });

  it('G9: round:started depois do crash (replay do buffer) não volta a rodada a RUNNING', () => {
    const crashed = applyMessage(state({ round: running() }), msg.crashed());
    expect(applyMessage(crashed, msg.started())).toBe(crashed);
    expect(crashed.round?.status).toBe('CRASHED');
  });

  it('G10: round:crashed revela o crash point, marca as PENDING como LOST e entra no histórico', () => {
    const before = state({
      round: running(),
      bets: [
        pending(bet(1), 'ana', 1_000),
        {
          ...pending(bet(2), 'bia', 500),
          status: 'CASHED_OUT',
          cashoutMultiplier: 150,
          payout: 750,
        },
      ],
      myBet: myPending(bet(1), 1_000),
      history: [{ id: OTHER, crashPoint: 150, crashedAt: T0 - 5_000 }],
    });

    const after = applyMessage(before, msg.crashed());

    expect(after.round).toEqual({
      ...running(),
      status: 'CRASHED',
      crashedAt: T0 + 25_000,
      crashPoint: 235,
      serverSeed: SEED,
    });
    expect(after.bets.map((b) => b.status)).toEqual(['LOST', 'CASHED_OUT']);
    expect(after.myBet?.status).toBe('LOST');
    expect(after.history).toEqual([
      { id: ROUND, crashPoint: 235, crashedAt: T0 + 25_000 },
      { id: OTHER, crashPoint: 150, crashedAt: T0 - 5_000 },
    ]);
  });

  it('G11: round:crashed repetido devolve o mesmo estado, sem duplicar o histórico', () => {
    const crashed = applyMessage(state({ round: running() }), msg.crashed());
    expect(applyMessage(crashed, msg.crashed())).toBe(crashed);
    expect(crashed.history).toHaveLength(1);
  });

  it('G12: o histórico guarda no máximo 20 crashes, do mais novo para o mais antigo', () => {
    const history = Array.from({ length: HISTORY_LIMIT }, (_, i) => ({
      id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
      crashPoint: 100 + i,
      crashedAt: T0 - i,
    }));
    const after = applyMessage(
      state({ round: running(), history }),
      msg.crashed(),
    );
    expect(HISTORY_LIMIT).toBe(20);
    expect(after.history).toHaveLength(20);
    expect(after.history[0]?.id).toBe(ROUND);
    expect(after.history.at(-1)?.id).toBe(history[18]?.id);
  });

  it('G19: round:tick devolve o mesmo estado; o multiplicador não entra na store', () => {
    const before = state({ round: running() });
    expect(applyMessage(before, msg.tick())).toBe(before);
    expect(Object.keys(before)).not.toContain('multiplier');
  });
});

describe('applyMessage: apostas (D71, D75)', () => {
  it('G13: bet:placed da rodada atual acrescenta a aposta PENDING, na ordem', () => {
    let current = state({ round: betting() });
    current = applyMessage(current, msg.placed(bet(1), 'ana'));
    current = applyMessage(current, msg.placed(bet(2), 'bia'));
    expect(current.bets).toEqual([
      pending(bet(1), 'ana', 1_000),
      pending(bet(2), 'bia', 1_000),
    ]);
  });

  it('G14: bet:placed com betId já presente (replay) devolve o mesmo estado', () => {
    const before = state({
      round: betting(),
      bets: [pending(bet(1), 'ana', 1_000)],
    });
    expect(applyMessage(before, msg.placed(bet(1), 'ana'))).toBe(before);
  });

  it('G15: bet:placed de outra rodada é ignorado', () => {
    const before = state({ round: betting() });
    expect(applyMessage(before, msg.placed(bet(1), 'ana', OTHER))).toBe(before);
  });

  it('G16: bet:cashed_out atualiza só a aposta daquele betId, mesmo com nickname repetido', () => {
    const before = state({
      round: running(),
      bets: [pending(bet(1), 'ana', 1_000), pending(bet(2), 'ana', 1_000)],
    });
    const after = applyMessage(before, msg.cashedOut(bet(2), 'ana'));
    expect(after.bets).toEqual([
      pending(bet(1), 'ana', 1_000),
      {
        ...pending(bet(2), 'ana', 1_000),
        status: 'CASHED_OUT',
        cashoutMultiplier: 182,
        payout: 1_820,
      },
    ]);
  });

  it('G17: o myBet só muda pelo próprio betId, nunca por outra aposta do mesmo nickname', () => {
    const before = state({
      round: running(),
      bets: [pending(bet(1), 'ana', 1_000), pending(bet(2), 'ana', 1_000)],
      myBet: myPending(bet(1), 1_000),
    });

    const other = applyMessage(before, msg.cashedOut(bet(2), 'ana'));
    expect(other.myBet).toEqual(myPending(bet(1), 1_000));

    const mine = applyMessage(before, msg.cashedOut(bet(1), 'ana'));
    expect(mine.myBet).toEqual({
      ...myPending(bet(1), 1_000),
      status: 'CASHED_OUT',
      cashoutMultiplier: 182,
      payout: 1_820,
    });
  });

  it('G18: bet:cashed_out de betId desconhecido é ignorado', () => {
    const before = state({
      round: running(),
      bets: [pending(bet(1), 'ana', 1_000)],
    });
    expect(applyMessage(before, msg.cashedOut(bet(9)))).toBe(before);
  });
});
