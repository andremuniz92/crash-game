import type { WalletResponse } from '@crash/shared';
import type { MikroORM } from '@mikro-orm/postgresql';
import { toMs } from '../../shared/infrastructure/database/time.js';
import { WalletNotFoundError } from '../domain/wallet-repository.js';
import { LedgerEntryRecord } from './ledger-entry.record.js';
import { WalletRecord } from './wallet.record.js';

const RECENT_ENTRIES = 20;

/** Leitura direta do saldo e do extrato (D63), sem passar pelo agregado. */
export class WalletQueries {
  constructor(private readonly orm: MikroORM) {}

  async summary(playerId: string): Promise<WalletResponse> {
    const em = this.orm.em.fork();
    const wallet = await em.findOne(
      WalletRecord,
      { playerId },
      { disableIdentityMap: true },
    );
    if (!wallet) {
      throw new WalletNotFoundError(`o jogador ${playerId} não tem carteira`);
    }
    const entries = await em.find(
      LedgerEntryRecord,
      { playerId },
      {
        orderBy: { createdAt: 'desc', id: 'desc' },
        limit: RECENT_ENTRIES,
        disableIdentityMap: true,
      },
    );
    return {
      balance: wallet.balance,
      entries: entries.map((entry) => ({
        type: entry.type,
        amount: entry.amount,
        betId: entry.betId ?? null,
        createdAt: toMs(entry.createdAt),
      })),
    };
  }
}
