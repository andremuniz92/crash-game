import {
  type EntityManager,
  LockMode,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import type { Bet } from '../domain/bet.js';
import {
  BetAlreadyPlacedError,
  type BetRepository,
} from '../domain/bet-repository.js';
import { betToDomain, betToRecord } from './bet.mapper.js';
import { BetRecord } from './bet.record.js';

const ONE_BET_PER_PLAYER_PER_ROUND = 'bets_round_id_player_id_unique';
const BY_PLACEMENT = { orderBy: { createdAt: 'asc', id: 'asc' } } as const;

/** Apostas no Postgres (D50). */
export class MikroOrmBetRepository implements BetRepository {
  constructor(private readonly em: EntityManager) {}

  async save(bet: Bet): Promise<void> {
    try {
      await this.em.upsert(BetRecord, betToRecord(bet));
    } catch (error) {
      if (violates(error, ONE_BET_PER_PLAYER_PER_ROUND)) {
        throw new BetAlreadyPlacedError(
          `o jogador ${bet.playerId} já apostou na rodada ${bet.roundId}`,
        );
      }
      throw error;
    }
  }

  async getByIdAndPlayerForUpdate(
    betId: string,
    playerId: string,
  ): Promise<Bet | null> {
    const row = await this.em.findOne(
      BetRecord,
      { id: betId, playerId },
      { lockMode: LockMode.PESSIMISTIC_WRITE, disableIdentityMap: true },
    );
    return row ? betToDomain(row) : null;
  }

  async findByIdAndPlayer(
    betId: string,
    playerId: string,
  ): Promise<Bet | null> {
    const row = await this.em.findOne(
      BetRecord,
      { id: betId, playerId },
      { disableIdentityMap: true },
    );
    return row ? betToDomain(row) : null;
  }

  async findByRoundAndPlayer(
    roundId: string,
    playerId: string,
  ): Promise<Bet | null> {
    const row = await this.em.findOne(
      BetRecord,
      { roundId, playerId },
      { disableIdentityMap: true },
    );
    return row ? betToDomain(row) : null;
  }

  async findByRound(roundId: string): Promise<Bet[]> {
    const rows = await this.em.find(
      BetRecord,
      { roundId },
      { ...BY_PLACEMENT, disableIdentityMap: true },
    );
    return rows.map(betToDomain);
  }

  async findPendingByRound(roundId: string): Promise<Bet[]> {
    const rows = await this.em.find(
      BetRecord,
      { roundId, status: 'PENDING' },
      { ...BY_PLACEMENT, disableIdentityMap: true },
    );
    return rows.map(betToDomain);
  }
}

/** O MikroORM copia os campos do erro do driver, inclusive `constraint` (D52). */
function violates(error: unknown, constraint: string): boolean {
  return (
    error instanceof UniqueConstraintViolationException &&
    'constraint' in error &&
    error.constraint === constraint
  );
}
