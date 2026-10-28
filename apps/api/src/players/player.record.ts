import { defineEntity, p } from '@mikro-orm/core';

/** Tabela `players` (seção 9). O repositório entra no M3 (D45). */
export const PlayerRecord = defineEntity({
  name: 'PlayerRecord',
  tableName: 'players',
  properties: {
    id: p.uuid().primary(),
    nickname: p.string().length(16),
    /** Hash do token opaco; o token nunca é guardado em texto puro. */
    tokenHash: p.string().length(64).unique(),
    createdAt: p.datetime(3),
  },
});
