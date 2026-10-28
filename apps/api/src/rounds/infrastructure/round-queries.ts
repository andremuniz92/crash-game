import type { RoundHistoryItem } from '@crash/shared';
import type { MikroORM } from '@mikro-orm/postgresql';
import { toMs } from '../../shared/infrastructure/database/time.js';
import { RoundRecord } from './round.record.js';

/** Leituras diretas das rodadas (D63). */
export class RoundQueries {
  constructor(private readonly orm: MikroORM) {}

  /** Só crashadas: crashPoint de rodada aberta é segredo (D30). */
  async history(limit: number): Promise<RoundHistoryItem[]> {
    const rows = await this.orm.em.fork().find(
      RoundRecord,
      { status: 'CRASHED' },
      {
        fields: ['id', 'crashPoint', 'crashedAt'],
        orderBy: { crashedAt: 'desc' },
        limit,
        disableIdentityMap: true,
      },
    );
    return rows.map((row) => ({
      id: row.id,
      crashPoint: row.crashPoint,
      crashedAt: toMs(row.crashedAt!),
    }));
  }
}
