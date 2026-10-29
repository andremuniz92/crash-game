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
  applyBetPlaced,
  applyCashedOut,
  applyMessage,
  applySnapshot,
  type GameState,
  HISTORY_LIMIT,
  initialGameState,
  setBalance,
  setConnection,
  setHistory,
  setPending,
  signIn,
  signOut,
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
  it('G1: o estado inicial não tem rodada, apostas, myBet, histórico, jogador nem saldo', () => {
    expect(initialGameState).toEqual({
      round: null,
      bets: [],
      myBet: null,
      history: [],
      player: null,
      balance: null,
      pending: { bet: false, cashOut: false },
      connection: 'connecting',
    });
  });

  it('G20: setConnection muda só o campo connection', () => {
    const before = state({ round: betting(), balance: 100_000 });
    expect(setConnection(before, 'live')).toEqual({
      ...before,
      connection: 'live',
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
        ...initialGameState,
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

describe('estado da conta (D77, D78)', () => {
  const ana = {
    playerId: 'a0a0a0a0-0000-4000-8000-000000000001',
    nickname: 'ana',
  };

  it('GR1: a resposta do POST /bets define o myBet só na rodada atual; o saldo muda sempre', () => {
    const response = {
      betId: bet(1),
      roundId: ROUND,
      amount: 1_000,
      balance: 99_000,
    };

    const current = applyBetPlaced(
      state({ round: betting(), balance: 100_000 }),
      response,
    );
    expect(current.myBet).toEqual(myPending(bet(1), 1_000));
    expect(current.balance).toBe(99_000);

    const moved = applyBetPlaced(
      state({ round: betting(OTHER), balance: 100_000 }),
      response,
    );
    expect(moved.myBet).toBeNull();
    expect(moved.balance).toBe(99_000);
  });

  it('GR2: a resposta do cash out encerra o myBet do mesmo betId e atualiza o saldo', () => {
    const after = applyCashedOut(
      state({
        round: running(),
        myBet: myPending(bet(1), 1_000),
        balance: 99_000,
      }),
      { betId: bet(1), multiplier: 182, payout: 1_820, balance: 100_820 },
    );

    expect(after.myBet).toEqual({
      ...myPending(bet(1), 1_000),
      status: 'CASHED_OUT',
      cashoutMultiplier: 182,
      payout: 1_820,
    });
    expect(after.balance).toBe(100_820);
  });

  it('GR3: entrar define jogador e saldo; sair limpa jogador, saldo e myBet e mantém a rodada', () => {
    const history = [{ id: OTHER, crashPoint: 150, crashedAt: T0 }];
    const signedIn = signIn(state({ round: running(), history }), ana, 100_000);
    expect(signedIn).toMatchObject({ player: ana, balance: 100_000 });
    expect(setBalance(signedIn, 99_000).balance).toBe(99_000);
    expect(setPending(signedIn, 'cashOut', true).pending).toEqual({
      bet: false,
      cashOut: true,
    });

    const out = signOut({ ...signedIn, myBet: myPending(bet(1), 1_000) });
    expect(out).toMatchObject({ player: null, balance: null, myBet: null });
    expect(out.round).toEqual(running());
    expect(out.history).toEqual(history);
  });

  it('GR4: round:crashed e round:betting mantêm jogador, saldo e pending', () => {
    const account = {
      player: ana,
      balance: 99_000,
      pending: { bet: false, cashOut: true },
    };
    const crashed = applyMessage(
      state({ round: running(), ...account }),
      msg.crashed(),
    );
    expect(crashed).toMatchObject(account);

    const next = applyMessage(crashed, msg.betting(OTHER));
    expect(next).toMatchObject(account);
  });
});

describe('setHistory (REST e WS)', () => {
  const item = (n: number, crashedAt: number) => ({
    id: `00000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`,
    crashPoint: 100 + n,
    crashedAt,
  });

  it('HI1: a resposta do GET /rounds/history preenche do mais novo para o mais antigo', () => {
    const response = [item(3, 3_000), item(2, 2_000), item(1, 1_000)];
    expect(setHistory(initialGameState, response).history).toEqual(response);
  });

  it('HI2: o WS chegou antes da carga com a mesma rodada: uma entrada, com o crashedAt do REST', () => {
    const viaWs = applyMessage(state({ round: running() }), msg.crashed());
    expect(viaWs.history).toHaveLength(1);
    const fromRest = { id: ROUND, crashPoint: 235, crashedAt: T0 + 24_990 };

    const merged = setHistory(viaWs, [fromRest, item(1, T0 - 1_000)]);

    expect(merged.history).toEqual([fromRest, item(1, T0 - 1_000)]);
  });

  it('HI3: o WS chega depois da carga: a rodada nova entra no topo, uma vez', () => {
    const loaded = setHistory(state({ round: running() }), [
      item(1, T0 - 1_000),
    ]);
    const after = applyMessage(loaded, msg.crashed());

    expect(after.history.map((h) => h.id)).toEqual([ROUND, item(1, 0).id]);
  });

  it('HI4: a mescla respeita o limite de 20 e a ordem por crashedAt', () => {
    const viaWs = state({ history: [item(30, 30_000), item(5, 5_000)] });
    const response = Array.from({ length: 20 }, (_, i) =>
      item(i + 10, (i + 10) * 1_000),
    ).reverse();

    const merged = setHistory(viaWs, response).history;

    expect(merged).toHaveLength(20);
    expect(merged[0]?.id).toBe(item(30, 0).id);
    const times = merged.map((h) => h.crashedAt);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});
