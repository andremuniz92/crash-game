import type { EntityManager } from '@mikro-orm/core';
import type { MikroORM } from '@mikro-orm/postgresql';
import { settleRound } from '../../../bets/application/settle-round.js';
import type { WalletPort } from '../../../bets/application/wallet-port.js';
import type { BetRepository } from '../../../bets/domain/bet-repository.js';
import { MikroOrmBetRepository } from '../../../bets/infrastructure/mikro-orm-bet.repository.js';
import { MikroOrmPlayerStore } from '../../../players/mikro-orm-player-store.js';
import type { PlayerStore } from '../../../players/player-store.js';
import type { RoundSettlement } from '../../../rounds/application/round-settlement.js';
import type { RoundRepository } from '../../../rounds/domain/round-repository.js';
import { MikroOrmRoundRepository } from '../../../rounds/infrastructure/mikro-orm-round.repository.js';
import type { WalletRepository } from '../../../wallet/domain/wallet-repository.js';
import { MikroOrmWalletRepository } from '../../../wallet/infrastructure/mikro-orm-wallet.repository.js';
import {
  creditForCashout,
  debitForBet,
} from '../../../wallet/application/wallet-operations.js';
import type { IdempotencyStore } from '../../application/idempotency.js';
import type { UnitOfWork } from '../../application/unit-of-work.js';
import { MikroOrmIdempotencyStore } from '../idempotency/mikro-orm-idempotency-store.js';

/** Tudo o que uma transação oferece; os casos de uso enxergam só uma parte. */
export interface TransactionScope {
  rounds: RoundRepository;
  bets: BetRepository;
  wallets: WalletRepository;
  players: PlayerStore;
  settlement: RoundSettlement;
  wallet: WalletPort;
  idempotency: IdempotencyStore;
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
  const wallets = new MikroOrmWalletRepository(em);
  return {
    rounds: new MikroOrmRoundRepository(em),
    bets,
    wallets,
    players: new MikroOrmPlayerStore(em),
    // O rounds liquida as apostas pelo bets/application, sem ver o repositório (D56).
    settlement: { settle: (round) => settleRound({ bets }, round) },
    // O bets mexe na carteira pelo wallet/application, sem ver o repositório (D56).
    wallet: {
      debitForBet: (...args) => debitForBet({ wallets }, ...args),
      creditForCashout: (...args) => creditForCashout({ wallets }, ...args),
    },
    idempotency: new MikroOrmIdempotencyStore(em),
  };
}
