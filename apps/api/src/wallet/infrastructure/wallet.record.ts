import { defineEntity, p } from '@mikro-orm/core';
import { PlayerRecord } from '../../players/player.record.js';

/** Tabela `wallets` (seção 9). `version` é a segunda barreira além do lock (D45). */
export const WalletRecord = defineEntity({
  name: 'WalletRecord',
  tableName: 'wallets',
  properties: {
    playerId: p
      .manyToOne(PlayerRecord)
      .primary()
      .mapToPk()
      .fieldName('player_id')
      .deleteRule('no action')
      .updateRule('no action'),
    balance: p.bigint('number').check('balance >= 0'),
    version: p.integer(),
  },
});
