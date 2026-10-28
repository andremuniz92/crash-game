import type { InferEntity } from '@mikro-orm/core';
import { Money } from '../../shared/domain/money.js';
import { toDate } from '../../shared/infrastructure/database/time.js';
import type { LedgerEntry } from '../domain/ledger-entry.js';
import { Wallet } from '../domain/wallet.js';
import type { LedgerEntryRecord } from './ledger-entry.record.js';
import type { WalletRecord } from './wallet.record.js';

export type WalletRow = InferEntity<typeof WalletRecord>;
export type LedgerEntryRow = Omit<InferEntity<typeof LedgerEntryRecord>, 'id'>;

export function walletToRecord(wallet: Wallet): WalletRow {
  const s = wallet.toSnapshot();
  return { playerId: s.playerId, balance: s.balance.cents, version: s.version };
}

export function walletToDomain(row: WalletRow): Wallet {
  return Wallet.restore({
    playerId: row.playerId,
    balance: Money.fromCents(row.balance),
    version: row.version,
  });
}

/** Lançamento → linha de `ledger_entries`, sem id: o banco gera (D37). */
export function ledgerEntryToRecord(
  playerId: string,
  entry: LedgerEntry,
): LedgerEntryRow {
  return {
    playerId,
    type: entry.type,
    amount: entry.amount,
    betId: entry.betId,
    createdAt: toDate(entry.createdAt),
  };
}
