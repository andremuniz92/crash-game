import { defineEntity, p } from '@mikro-orm/core';
import { PlayerRecord } from '../../players/player.record.js';
import { RoundRecord } from '../../rounds/infrastructure/round.record.js';

export const BET_STATUSES = ['PENDING', 'CASHED_OUT', 'LOST'] as const;

/** Tabela `bets` (seção 9). Dinheiro em bigint lido como number (D42). */
export const BetRecord = defineEntity({
  name: 'BetRecord',
  tableName: 'bets',
  properties: {
    id: p.uuid().primary(),
    roundId: p
      .manyToOne(RoundRecord)
      .mapToPk()
      .fieldName('round_id')
      .deleteRule('no action')
      .updateRule('no action'),
    playerId: p
      .manyToOne(PlayerRecord)
      .mapToPk()
      .fieldName('player_id')
      .deleteRule('no action')
      .updateRule('no action'),
    amount: p.bigint('number').check('amount > 0'),
    status: p.enum(BET_STATUSES),
    cashoutMultiplier: p
      .integer()
      .nullable()
      .check('cashout_multiplier between 100 and 100000000'),
    payout: p.bigint('number').nullable().check('payout >= 0'),
    /** `placedAt` do domínio (D45). */
    createdAt: p.datetime(3),
  },
  // Última barreira contra aposta duplicada (seção 10.1, D33).
  uniques: [{ properties: ['roundId', 'playerId'] }],
});
