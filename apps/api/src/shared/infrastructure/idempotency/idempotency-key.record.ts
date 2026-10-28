import { defineEntity, p } from '@mikro-orm/core';
import { PlayerRecord } from '../../../players/player.record.js';

/** Tabela `idempotency_keys` (seção 9, D5). O uso entra no M3 (D45). */
export const IdempotencyKeyRecord = defineEntity({
  name: 'IdempotencyKeyRecord',
  tableName: 'idempotency_keys',
  properties: {
    playerId: p
      .manyToOne(PlayerRecord)
      .primary()
      .mapToPk()
      .fieldName('player_id')
      .deleteRule('no action')
      .updateRule('no action'),
    key: p.uuid().primary(),
    endpoint: p.string().length(64),
    responseStatus: p.integer(),
    responseBody: p.json(),
    createdAt: p.datetime(3),
  },
});
