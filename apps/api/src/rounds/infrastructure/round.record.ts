import { defineEntity, p } from '@mikro-orm/core';

export const ROUND_STATUSES = ['BETTING', 'RUNNING', 'CRASHED'] as const;

/** Tabela `rounds` (seção 9). Multiplicadores em integer ×100 (D42). */
export const RoundRecord = defineEntity({
  name: 'RoundRecord',
  tableName: 'rounds',
  properties: {
    id: p.uuid().primary(),
    status: p.enum(ROUND_STATUSES),
    serverSeed: p.string().length(64),
    seedHash: p.string().length(64),
    crashPoint: p.integer().check('crash_point between 100 and 100000000'),
    bettingEndsAt: p.datetime(3),
    startedAt: p.datetime(3).nullable(),
    crashAt: p.datetime(3).nullable(),
    crashedAt: p.datetime(3).nullable(),
  },
  indexes: [{ properties: 'status' }, { properties: 'crashedAt' }],
  uniques: [
    {
      // No máximo uma rodada não crashada por vez (D13; decisão da Fase 3 do M2).
      name: 'rounds_single_current_unique',
      expression: `create unique index "rounds_single_current_unique" on "rounds" ((1)) where "status" <> 'CRASHED'`,
    },
  ],
});
