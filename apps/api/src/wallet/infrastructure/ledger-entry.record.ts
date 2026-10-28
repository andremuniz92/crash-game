import { defineEntity, p } from '@mikro-orm/core';
import { BetRecord } from '../../bets/infrastructure/bet.record.js';
import { PlayerRecord } from '../../players/player.record.js';

export const LEDGER_ENTRY_TYPES = [
  'INITIAL_GRANT',
  'BET_PLACED',
  'CASHOUT',
] as const;

/** Tabela `ledger_entries` (seção 9). O id é gerado pelo banco (D37). */
export const LedgerEntryRecord = defineEntity({
  name: 'LedgerEntryRecord',
  tableName: 'ledger_entries',
  properties: {
    id: p
      .bigint('number')
      .primary()
      .autoincrement()
      .columnType('bigint')
      .generated('by default as identity'),
    playerId: p
      .manyToOne(PlayerRecord)
      .mapToPk()
      .fieldName('player_id')
      .deleteRule('no action')
      .updateRule('no action'),
    type: p.enum(LEDGER_ENTRY_TYPES),
    /** Centavos com sinal: débito negativo. */
    amount: p.bigint('number'),
    betId: p
      .manyToOne(BetRecord)
      .mapToPk()
      .nullable()
      .fieldName('bet_id')
      .deleteRule('no action')
      .updateRule('no action'),
    createdAt: p.datetime(3),
  },
  indexes: [{ properties: ['playerId', 'createdAt'] }],
});
