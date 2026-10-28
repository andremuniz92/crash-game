import { type EntityManager, LockMode } from '@mikro-orm/core';
import type { Wallet } from '../domain/wallet.js';
import {
  WalletNotFoundError,
  type WalletRepository,
  WalletVersionConflictError,
} from '../domain/wallet-repository.js';
import { LedgerEntryRecord } from './ledger-entry.record.js';
import {
  ledgerEntryToRecord,
  walletToDomain,
  walletToRecord,
} from './wallet.mapper.js';
import { WalletRecord } from './wallet.record.js';

/** Carteiras e extrato no Postgres (D50, D53). */
export class MikroOrmWalletRepository implements WalletRepository {
  constructor(private readonly em: EntityManager) {}

  async getForUpdate(playerId: string): Promise<Wallet> {
    const row = await this.em.findOne(
      WalletRecord,
      { playerId },
      { lockMode: LockMode.PESSIMISTIC_WRITE, disableIdentityMap: true },
    );
    if (!row) {
      throw new WalletNotFoundError(`o jogador ${playerId} não tem carteira`);
    }
    return walletToDomain(row);
  }

  /**
   * Versão 0 = nunca gravada: insere com versão 1. Senão, atualiza só se a
   * versão no banco ainda for a carregada (segunda barreira da D45).
   */
  async save(wallet: Wallet): Promise<void> {
    const row = walletToRecord(wallet);
    if (row.version === 0) {
      await this.em.insert(WalletRecord, { ...row, version: 1 });
    } else {
      const updated = await this.em.nativeUpdate(
        WalletRecord,
        { playerId: row.playerId, version: row.version },
        { balance: row.balance, version: row.version + 1 },
      );
      if (updated === 0) {
        throw new WalletVersionConflictError(
          `a carteira de ${row.playerId} mudou desde a versão ${row.version}`,
        );
      }
    }

    const entries = wallet.pullNewEntries();
    if (entries.length > 0) {
      await this.em.insertMany(
        LedgerEntryRecord,
        entries.map((entry) => ledgerEntryToRecord(row.playerId, entry)),
      );
    }
  }
}
