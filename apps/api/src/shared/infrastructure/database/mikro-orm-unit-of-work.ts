import type { EntityManager } from '@mikro-orm/core';
import type { MikroORM } from '@mikro-orm/postgresql';
import { settleRound } from '../../../bets/application/settle-round.js';
import type { BetRepository } from '../../../bets/domain/bet-repository.js';
import { MikroOrmBetRepository } from '../../../bets/infrastructure/mikro-orm-bet.repository.js';
import { MikroOrmPlayerStore } from '../../../players/mikro-orm-player-store.js';
import type { PlayerStore } from '../../../players/player-store.js';
import type { RoundSettlement } from '../../../rounds/application/round-settlement.js';
import type { RoundRepository } from '../../../rounds/domain/round-repository.js';
import { MikroOrmRoundRepository } from '../../../rounds/infrastructure/mikro-orm-round.repository.js';
import type { WalletRepository } from '../../../wallet/domain/wallet-repository.js';
import { MikroOrmWalletRepository } from '../../../wallet/infrastructure/mikro-orm-wallet.repository.js';
import type { UnitOfWork } from '../../application/unit-of-work.js';

/** Tudo o que uma transação oferece; os casos de uso enxergam só uma parte. */
export interface TransactionScope {
  rounds: RoundRepository;
  bets: BetRepository;
  wallets: WalletRepository;
  players: PlayerStore;
  settlement: RoundSettlement;
}

/**
 * Cada `run` abre uma transação num EntityManager novo e entrega os
 * repositórios criados com ele (D50, D56). Erro no `work` faz rollback.
 */
export class MikroOrmUnitOfWork implements UnitOfWork<TransactionScope> {
  constructor(private readonly orm: MikroORM) {}

  run<T>(work: (tx: TransactionScope) => Promise<T>): Promise<T> {
    return this.orm.em
      .fork()
      .transactional((em: EntityManager) => work(scopeFor(em)));
  }
}

function scopeFor(em: EntityManager): TransactionScope {
  const bets = new MikroOrmBetRepository(em);
  return {
    rounds: new MikroOrmRoundRepository(em),
    bets,
    wallets: new MikroOrmWalletRepository(em),
    players: new MikroOrmPlayerStore(em),
    // O rounds liquida as apostas pelo bets/application, sem ver o repositório (D56).
    settlement: { settle: (round) => settleRound({ bets }, round) },
  };
}
