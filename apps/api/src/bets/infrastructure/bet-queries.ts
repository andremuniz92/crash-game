import type { MyBetDto, RoundBetDto } from '@crash/shared';
import type { MikroORM } from '@mikro-orm/postgresql';
import { BetRecord } from './bet.record.js';

interface RoundBetRow {
  id: string;
  nickname: string;
  /** bigint chega como string numa consulta crua (D42). */
  amount: string;
  status: RoundBetDto['status'];
  cashout_multiplier: number | null;
  payout: string | null;
}

/**
 * Leituras diretas das apostas (D63). O nickname vem de um join com
 * `players`: é leitura, e a regra da D48 vale para os repositórios.
 */
export class BetQueries {
  constructor(private readonly orm: MikroORM) {}

  async betsOf(roundId: string): Promise<RoundBetDto[]> {
    const rows = await this.orm.em.getConnection().execute<RoundBetRow[]>(
      `select b.id, p.nickname, b.amount, b.status, b.cashout_multiplier, b.payout
         from bets b
         join players p on p.id = b.player_id
        where b.round_id = ?
        order by b.created_at, b.id`,
      [roundId],
    );
    return rows.map((row) => ({
      betId: row.id,
      nickname: row.nickname,
      amount: Number(row.amount),
      status: row.status,
      cashoutMultiplier: row.cashout_multiplier,
      payout: row.payout === null ? null : Number(row.payout),
    }));
  }

  async myBet(roundId: string, playerId: string): Promise<MyBetDto | null> {
    const row = await this.orm.em
      .fork()
      .findOne(BetRecord, { roundId, playerId }, { disableIdentityMap: true });
    return row
      ? {
          betId: row.id,
          amount: row.amount,
          status: row.status,
          cashoutMultiplier: row.cashoutMultiplier ?? null,
          payout: row.payout ?? null,
        }
      : null;
  }
}
