import type { WalletResponse } from '@crash/shared';
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentPlayer } from '../../players/auth.guard.js';
import type { AuthenticatedPlayer } from '../../players/player-store.js';
import { WalletQueries } from './wallet-queries.js';

@Controller('wallet')
@UseGuards(AuthGuard)
export class WalletController {
  constructor(@Inject(WalletQueries) private readonly queries: WalletQueries) {}

  @Get()
  summary(
    @CurrentPlayer() player: AuthenticatedPlayer,
  ): Promise<WalletResponse> {
    return this.queries.summary(player.id);
  }
}
