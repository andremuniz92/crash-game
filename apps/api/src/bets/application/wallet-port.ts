import type { Money } from '../../shared/domain/money.js';

/**
 * O que o bets precisa da carteira, na mesma transação (D56). Implementada
 * pelo wallet/application; cada operação carrega com lock, aplica e grava uma
 * vez (D53). Devolve o saldo novo.
 */
export interface WalletPort {
  debitForBet(
    playerId: string,
    amount: Money,
    betId: string,
    now: number,
  ): Promise<Money>;
  creditForCashout(
    playerId: string,
    payout: Money,
    betId: string,
    now: number,
  ): Promise<Money>;
}
