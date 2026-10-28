import { DomainError } from '../../shared/domain/domain-error.js';
import { Money } from '../../shared/domain/money.js';
import type { LedgerEntry } from './ledger-entry.js';

export class InsufficientBalanceError extends DomainError {
  readonly code = 'INSUFFICIENT_BALANCE';
}

/**
 * Carteira de um jogador (seção 6.4). Toda movimentação gera um lançamento,
 * e o saldo é sempre igual à soma do extrato.
 */
export class Wallet {
  static readonly INITIAL_BALANCE = Money.fromCents(100_000);

  private _balance = Money.fromCents(0);
  private readonly _entries: LedgerEntry[] = [];

  private constructor(readonly playerId: string) {}

  static open({ playerId, now }: { playerId: string; now: number }): Wallet {
    const wallet = new Wallet(playerId);
    wallet.apply('INITIAL_GRANT', Wallet.INITIAL_BALANCE.cents, null, now);
    return wallet;
  }

  get balance(): Money {
    return this._balance;
  }

  get entries(): readonly LedgerEntry[] {
    return this._entries;
  }

  debit(amount: Money, { betId, now }: { betId: string; now: number }): void {
    if (amount.cents > this._balance.cents) {
      throw new InsufficientBalanceError(
        `saldo de ${this._balance.cents} centavos não cobre ${amount.cents}`,
      );
    }
    this.apply('BET_PLACED', -amount.cents, betId, now);
  }

  credit(amount: Money, { betId, now }: { betId: string; now: number }): void {
    this.apply('CASHOUT', amount.cents, betId, now);
  }

  private apply(
    type: LedgerEntry['type'],
    signedCents: number,
    betId: string | null,
    now: number,
  ): void {
    this._balance = Money.fromCents(this._balance.cents + signedCents);
    this._entries.push(
      Object.freeze({ type, amount: signedCents, betId, createdAt: now }),
    );
  }
}
