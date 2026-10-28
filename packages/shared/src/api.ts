/* Contrato REST (seção 8.1). Dinheiro em centavos, instantes em ms (D63). */

export interface ErrorResponse {
  code: string;
  message: string;
}

export interface GuestRequest {
  nickname: string;
}

export interface GuestResponse {
  playerId: string;
  nickname: string;
  token: string;
  balance: number;
}

export type LedgerEntryType = 'INITIAL_GRANT' | 'BET_PLACED' | 'CASHOUT';

export interface LedgerEntryDto {
  type: LedgerEntryType;
  /** Centavos com sinal: débito é negativo. */
  amount: number;
  betId: string | null;
  createdAt: number;
}

export interface WalletResponse {
  balance: number;
  /** Os 20 lançamentos mais recentes, do mais novo para o mais antigo. */
  entries: LedgerEntryDto[];
}

export type RoundStatus = 'BETTING' | 'RUNNING' | 'CRASHED';

interface RoundBase {
  id: string;
  seedHash: string;
  bettingEndsAt: number;
}

/*
 * A rodada é uma união discriminada por `status`: só a variante CRASHED tem
 * campos para crashPoint e serverSeed (D30, D63). Nenhuma tem crashAt.
 */
export interface BettingRoundDto extends RoundBase {
  status: 'BETTING';
}

export interface RunningRoundDto extends RoundBase {
  status: 'RUNNING';
  startedAt: number;
}

export interface CrashedRoundDto extends RoundBase {
  status: 'CRASHED';
  startedAt: number;
  crashedAt: number;
  /** ×100 (D21). */
  crashPoint: number;
  serverSeed: string;
}

export type RoundDto = BettingRoundDto | RunningRoundDto | CrashedRoundDto;

export type BetStatus = 'PENDING' | 'CASHED_OUT' | 'LOST';

/** Aposta de qualquer jogador, como aparece para todos: sem playerId nem betId. */
export interface RoundBetDto {
  nickname: string;
  amount: number;
  status: BetStatus;
  cashoutMultiplier: number | null;
  payout: number | null;
}

/** A aposta de quem pergunta, com o betId para o cash out (D63). */
export interface MyBetDto {
  betId: string;
  amount: number;
  status: BetStatus;
  cashoutMultiplier: number | null;
  payout: number | null;
}

export interface CurrentRoundResponse {
  /** A rodada aberta ou, entre rodadas, a última crashada; null antes da primeira. */
  round: RoundDto | null;
  bets: RoundBetDto[];
  /** Só com `Bearer`; null se o jogador não apostou nesta rodada. */
  myBet: MyBetDto | null;
  serverTime: number;
}

export interface RoundHistoryItem {
  id: string;
  crashPoint: number;
  crashedAt: number;
}

export interface VerifyResponse {
  serverSeed: string;
  seedHash: string;
  crashPoint: number;
}
