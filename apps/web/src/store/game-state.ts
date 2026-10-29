import type {
  CashOutResponse,
  CurrentRoundResponse,
  MyBetDto,
  PlaceBetResponse,
  RoundBetDto,
  RoundDto,
  RoundHistoryItem,
  WsMessage,
} from '@crash/shared';

/**
 * Estado do jogo no cliente (D75). O multiplicador não entra aqui: quem
 * desenha o calcula a cada frame a partir do `startedAt` e do `serverNow()`.
 */
export interface GameState {
  round: RoundDto | null;
  /** Apostas da rodada, na ordem em que chegaram, identificadas pelo betId (D71). */
  bets: RoundBetDto[];
  /** A aposta do jogador; muda pela resposta REST, pelo snapshot ou pelo betId. */
  myBet: MyBetDto | null;
  /** Últimos crashes, do mais novo para o mais antigo. */
  history: RoundHistoryItem[];
  /** O guest da sessão (D77); null antes de entrar. */
  player: Player | null;
  /** Saldo em centavos; null enquanto não se sabe. */
  balance: number | null;
  /** Ação em andamento: o botão fica desabilitado, inclusive nas retentativas (D78). */
  pending: { bet: boolean; cashOut: boolean };
}

export interface Player {
  playerId: string;
  nickname: string;
}

/** O mesmo padrão do `GET /rounds/history`. */
export const HISTORY_LIMIT = 20;

export const initialGameState: GameState = {
  round: null,
  bets: [],
  myBet: null,
  history: [],
  player: null,
  balance: null,
  pending: { bet: false, cashOut: false },
};

/** O guest entrou ou voltou (sessão restaurada), com o saldo conhecido. */
export function signIn(
  state: GameState,
  player: Player,
  balance: number,
): GameState {
  return { ...state, player, balance };
}

export function setBalance(state: GameState, balance: number): GameState {
  return { ...state, balance };
}

/** Sessão apagada (401, D77): sai a conta; a rodada continua na tela. */
export function signOut(state: GameState): GameState {
  return { ...state, player: null, balance: null, myBet: null };
}

export function setPending(
  state: GameState,
  action: keyof GameState['pending'],
  value: boolean,
): GameState {
  return { ...state, pending: { ...state.pending, [action]: value } };
}

/** Resposta do POST /bets: o myBet só se a aposta for da rodada na tela. */
export function applyBetPlaced(
  state: GameState,
  response: PlaceBetResponse,
): GameState {
  const { betId, roundId, amount, balance } = response;
  return {
    ...state,
    balance,
    myBet:
      state.round?.id === roundId
        ? {
            betId,
            amount,
            status: 'PENDING',
            cashoutMultiplier: null,
            payout: null,
          }
        : state.myBet,
  };
}

/** Resposta do cash out: encerra o myBet do mesmo betId. */
export function applyCashedOut(
  state: GameState,
  response: CashOutResponse,
): GameState {
  const { betId, multiplier, payout, balance } = response;
  return {
    ...state,
    balance,
    myBet:
      state.myBet?.betId === betId
        ? {
            ...state.myBet,
            status: 'CASHED_OUT',
            cashoutMultiplier: multiplier,
            payout,
          }
        : state.myBet,
  };
}

/** O `GET /rounds/current` substitui rodada, apostas e myBet; o histórico fica. */
export function applySnapshot(
  state: GameState,
  snapshot: CurrentRoundResponse,
): GameState {
  return {
    ...state,
    round: snapshot.round,
    bets: snapshot.bets,
    myBet: snapshot.myBet,
  };
}

/**
 * Uma mensagem do WS (seção 8.2). Idempotente: o que não muda nada devolve o
 * mesmo objeto, e a store não avisa ninguém (ticks, repetições do buffer e
 * mensagens de outra rodada).
 */
export function applyMessage(state: GameState, message: WsMessage): GameState {
  const { round } = state;
  switch (message.type) {
    case 'round:betting': {
      const { roundId, seedHash, bettingEndsAt } = message.payload;
      if (round?.id === roundId) return state;
      return {
        ...state,
        round: { status: 'BETTING', id: roundId, seedHash, bettingEndsAt },
        bets: [],
        myBet: null,
      };
    }
    case 'round:started': {
      if (round?.id !== message.payload.roundId || round.status !== 'BETTING') {
        return state;
      }
      return {
        ...state,
        round: {
          ...round,
          status: 'RUNNING',
          startedAt: message.payload.startedAt,
        },
      };
    }
    case 'round:crashed': {
      if (round?.id !== message.payload.roundId || round.status !== 'RUNNING') {
        return state;
      }
      const { crashPoint, serverSeed } = message.payload;
      // A mensagem não tem crashedAt; o serverTime é lido no envio, logo depois do crash.
      const crashedAt = message.serverTime;
      return {
        ...state,
        round: {
          ...round,
          status: 'CRASHED',
          crashedAt,
          crashPoint,
          serverSeed,
        },
        bets: state.bets.map((b) =>
          b.status === 'PENDING' ? { ...b, status: 'LOST' } : b,
        ),
        myBet:
          state.myBet?.status === 'PENDING'
            ? { ...state.myBet, status: 'LOST' }
            : state.myBet,
        history: [
          { id: round.id, crashPoint, crashedAt },
          ...state.history.filter((item) => item.id !== round.id),
        ].slice(0, HISTORY_LIMIT),
      };
    }
    case 'bet:placed': {
      const { roundId, betId, nickname, amount } = message.payload;
      if (round?.id !== roundId || state.bets.some((b) => b.betId === betId)) {
        return state;
      }
      return {
        ...state,
        bets: [
          ...state.bets,
          {
            betId,
            nickname,
            amount,
            status: 'PENDING',
            cashoutMultiplier: null,
            payout: null,
          },
        ],
      };
    }
    case 'bet:cashed_out': {
      const { roundId, betId, multiplier, payout } = message.payload;
      if (round?.id !== roundId || !state.bets.some((b) => b.betId === betId)) {
        return state;
      }
      const cashedOut = {
        status: 'CASHED_OUT',
        cashoutMultiplier: multiplier,
        payout,
      } as const;
      return {
        ...state,
        bets: state.bets.map((b) =>
          b.betId === betId ? { ...b, ...cashedOut } : b,
        ),
        myBet:
          state.myBet?.betId === betId
            ? { ...state.myBet, ...cashedOut }
            : state.myBet,
      };
    }
    case 'round:tick':
      return state;
  }
}
