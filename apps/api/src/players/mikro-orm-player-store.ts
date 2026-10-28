import type { EntityManager } from '@mikro-orm/core';
import { toDate } from '../shared/infrastructure/database/time.js';
import type {
  AuthenticatedPlayer,
  NewPlayer,
  PlayerStore,
} from './player-store.js';
import { PlayerRecord } from './player.record.js';

export class MikroOrmPlayerStore implements PlayerStore {
  constructor(private readonly em: EntityManager) {}

  async insert(player: NewPlayer): Promise<void> {
    await this.em.insert(PlayerRecord, {
      ...player,
      createdAt: toDate(player.createdAt),
    });
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<AuthenticatedPlayer | null> {
    const row = await this.em.findOne(
      PlayerRecord,
      { tokenHash },
      { fields: ['id', 'nickname'], disableIdentityMap: true },
    );
    return row ? { id: row.id, nickname: row.nickname } : null;
  }
}
