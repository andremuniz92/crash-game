import type { CashOutResponse, PlaceBetResponse } from '@crash/shared';
import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, CurrentPlayer } from '../../players/auth.guard.js';
import type { AuthenticatedPlayer } from '../../players/player-store.js';
import { parseIdempotencyKey } from '../../shared/infrastructure/http/idempotency-key.js';
import { parseUuidParam } from '../../shared/infrastructure/http/params.js';
import { CashOut } from '../application/cash-out.js';
import { PlaceBet } from '../application/place-bet.js';
import { parseBetBody } from './bet-body.js';

/**
 * Ações que mexem com saldo (seção 8.1, D4, D5). Ordem de validação:
 * autenticação (guard) → id da URL → Idempotency-Key → corpo. O status vem
 * do caso de uso: 201/200, ou o salvo num replay (D60).
 */
@Controller('bets')
@UseGuards(AuthGuard)
export class BetsController {
  constructor(
    @Inject(PlaceBet) private readonly placeBet: PlaceBet,
    @Inject(CashOut) private readonly cashOut: CashOut,
  ) {}

  @Post()
  async place(
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PlaceBetResponse> {
    const idempotencyKey = parseIdempotencyKey(key);
    const { amount } = parseBetBody(body);
    const result = await this.placeBet.execute({
      playerId: player.id,
      amount,
      idempotencyKey,
    });
    response.status(result.status);
    return result.body;
  }

  @Post(':id/cashout')
  async cashOutBet(
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Param('id') rawId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CashOutResponse> {
    const betId = parseUuidParam(rawId, 'id');
    const idempotencyKey = parseIdempotencyKey(key);
    const result = await this.cashOut.execute({
      playerId: player.id,
      betId,
      idempotencyKey,
    });
    response.status(result.status);
    return result.body;
  }
}
