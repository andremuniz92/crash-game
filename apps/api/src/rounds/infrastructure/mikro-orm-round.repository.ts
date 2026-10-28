import { type EntityManager, LockMode } from '@mikro-orm/core';
import type { Round } from '../domain/round.js';
import {
  RoundNotFoundError,
  type RoundRepository,
} from '../domain/round-repository.js';
import { roundToDomain, roundToRecord } from './round.mapper.js';
import { RoundRecord } from './round.record.js';

/**
 * Rodadas no Postgres (D50). Recebe o EntityManager da transação corrente;
 * não abre transação nem chama flush. Leituras sempre vão ao banco.
 */
export class MikroOrmRoundRepository implements RoundRepository {
  constructor(private readonly em: EntityManager) {}

  async save(round: Round): Promise<void> {
    await this.em.upsert(RoundRecord, roundToRecord(round));
  }

  async findById(id: string): Promise<Round | null> {
    const row = await this.em.findOne(
      RoundRecord,
      { id },
      { disableIdentityMap: true },
    );
    return row ? roundToDomain(row) : null;
  }

  /** O índice parcial `rounds_single_current_unique` garante no máximo uma (D49). */
  async findCurrent(): Promise<Round | null> {
    const row = await this.em.findOne(
      RoundRecord,
      { status: { $ne: 'CRASHED' } },
      { disableIdentityMap: true },
    );
    return row ? roundToDomain(row) : null;
  }

  async findLatestCrashed(): Promise<Round | null> {
    const row = await this.em.findOne(
      RoundRecord,
      { status: 'CRASHED' },
      { orderBy: { crashedAt: 'desc' }, disableIdentityMap: true },
    );
    return row ? roundToDomain(row) : null;
  }

  async findCurrentForShare(): Promise<Round | null> {
    const row = await this.em.findOne(
      RoundRecord,
      { status: { $ne: 'CRASHED' } },
      { lockMode: LockMode.PESSIMISTIC_READ, disableIdentityMap: true },
    );
    return row ? roundToDomain(row) : null;
  }

  async findByIdForShare(id: string): Promise<Round | null> {
    const row = await this.em.findOne(
      RoundRecord,
      { id },
      { lockMode: LockMode.PESSIMISTIC_READ, disableIdentityMap: true },
    );
    return row ? roundToDomain(row) : null;
  }

  async getForUpdate(id: string): Promise<Round> {
    const row = await this.em.findOne(
      RoundRecord,
      { id },
      { lockMode: LockMode.PESSIMISTIC_WRITE, disableIdentityMap: true },
    );
    if (!row) {
      throw new RoundNotFoundError(`a rodada ${id} não existe`);
    }
    return roundToDomain(row);
  }
}
