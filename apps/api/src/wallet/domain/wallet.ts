import { DomainError } from '../../shared/domain/domain-error.js';
import { Money } from '../../shared/domain/money.js';
import type { LedgerEntry } from './ledger-entry.js';

export class InsufficientBalanceError extends DomainError {
  readonly code = 'INSUFFICIENT_BALANCE';
}

export class CorruptedWalletError extends DomainError {
  readonly code = 'CORRUPTED_WALLET';
}

export interface WalletSnapshot {
  playerId: string;
  balance: Money;
  version: number;
}

/**
 * Carteira de um jogador (seção 6.4). Toda movimentação gera um lançamento,
 * e o saldo é sempre igual à soma do extrato.
 *
 * Reconstruída do banco com saldo e `version`, sem o extrato completo (D45):
 * `entries` são os lançamentos conhecidos por esta instância, e
 * `pullNewEntries()` entrega os que ainda não foram gravados. A `version` é
 * opaca para o domínio; quem a confere e incrementa é o repositório.
 */
export class Wallet {
  static readonly INITIAL_BALANCE = Money.fromCents(100_000);

  private readonly _entries: LedgerEntry[] = [];
  private _newEntries: LedgerEntry[] = [];

  private constructor(
    readonly playerId: string,
    private _balance: Money,
    readonly version: number,
  ) {}

  static open({ playerId, now }: { playerId: string; now: number }): Wallet {
    const wallet = new Wallet(playerId, Money.fromCents(0), 0);
    wallet.apply('INITIAL_GRANT', Wallet.INITIAL_BALANCE.cents, null, now);
    return wallet;
  }

  static restore(snapshot: WalletSnapshot): Wallet {
    if (!Number.isInteger(snapshot.version) || snapshot.version < 0) {
      throw new CorruptedWalletError(
        `carteira de ${snapshot.playerId}: versão inválida (${snapshot.version})`,
      );
    }
    return new Wallet(snapshot.playerId, snapshot.balance, snapshot.version);
  }

  toSnapshot(): WalletSnapshot {
    return {
      playerId: this.playerId,
      balance: this._balance,
      version: this.version,
    };
  }

  get balance(): Money {
    return this._balance;
  }

  get entries(): readonly LedgerEntry[] {
    return this._entries;
  }

  /** Lançamentos ainda não gravados, em ordem; esvazia a lista. */
  pullNewEntries(): LedgerEntry[] {
    const entries = this._newEntries;
    this._newEntries = [];
    return entries;
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
    const entry = Object.freeze({
      type,
      amount: signedCents,
      betId,
      createdAt: now,
    });
    this._entries.push(entry);
    this._newEntries.push(entry);
  }
}
