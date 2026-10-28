import type { GuestRequest, GuestResponse } from '@crash/shared';
import type { IdGenerator } from '../shared/application/id-generator.js';
import type { UnitOfWork } from '../shared/application/unit-of-work.js';
import type { Clock } from '../shared/domain/clock.js';
import {
  openWallet,
  type OpenWalletTx,
} from '../wallet/application/open-wallet.js';
import type { PlayerStore } from './player-store.js';
import { generateToken, hashToken } from './player-token.js';

export type CreateGuestTx = OpenWalletTx & { players: PlayerStore };

/** Jogador e carteira nascem na mesma transação (D59). */
export class CreateGuest {
  constructor(
    private readonly uow: UnitOfWork<CreateGuestTx>,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute({ nickname }: GuestRequest): Promise<GuestResponse> {
    const now = this.clock.now();
    const playerId = this.ids.newId();
    const token = generateToken();

    const wallet = await this.uow.run(async (tx) => {
      await tx.players.insert({
        id: playerId,
        nickname,
        tokenHash: hashToken(token),
        createdAt: now,
      });
      return openWallet(tx, playerId, now);
    });

    return { playerId, nickname, token, balance: wallet.balance.cents };
  }
}
