import type { EntityManager } from '@mikro-orm/core';
import type {
  IdempotencyRecord,
  IdempotencyStore,
} from '../../application/idempotency.js';
import { toDate, toMs } from '../database/time.js';
import { IdempotencyKeyRecord } from './idempotency-key.record.js';

/** Registros de idempotência no Postgres (D60), na transação de quem chama. */
export class MikroOrmIdempotencyStore implements IdempotencyStore {
  constructor(private readonly em: EntityManager) {}

  /**
   * Advisory lock de transação: solto no commit ou rollback. O hash de 64
   * bits só decide quem espera quem; uma colisão só serializaria à toa.
   */
  async lock(playerId: string, key: string): Promise<void> {
    await this.em
      .getConnection()
      .execute(
        'select pg_advisory_xact_lock(hashtextextended(?, 0))',
        [`${playerId}:${key}`],
        'all',
        this.em.getTransactionContext(),
      );
  }

  async find(playerId: string, key: string): Promise<IdempotencyRecord | null> {
    const row = await this.em.findOne(
      IdempotencyKeyRecord,
      { playerId, key },
      { disableIdentityMap: true },
    );
    return row
      ? {
          playerId: row.playerId,
          key: row.key,
          endpoint: row.endpoint,
          requestHash: row.requestHash,
          responseStatus: row.responseStatus,
          responseBody: row.responseBody,
          createdAt: toMs(row.createdAt),
        }
      : null;
  }

  async save(record: IdempotencyRecord): Promise<void> {
    await this.em.insert(IdempotencyKeyRecord, {
      ...record,
      createdAt: toDate(record.createdAt),
    });
  }
}
