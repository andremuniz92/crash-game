import type {
  CurrentRoundResponse,
  RoundHistoryItem,
  VerifyResponse,
} from '@crash/shared';
import { MikroORM } from '@mikro-orm/postgresql';
import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BetQueries } from '../../bets/infrastructure/bet-queries.js';
import { OptionalAuthGuard, OptionalPlayer } from '../../players/auth.guard.js';
import type { AuthenticatedPlayer } from '../../players/player-store.js';
import type { Clock } from '../../shared/domain/clock.js';
import { parseUuidParam } from '../../shared/infrastructure/http/params.js';
import { CLOCK } from '../../shared/infrastructure/tokens.js';
import { RoundNotFoundError } from '../domain/round-repository.js';
import { parseHistoryLimit } from './history-limit.js';
import { MikroOrmRoundRepository } from './mikro-orm-round.repository.js';
import { toRoundDto } from './round-dto.js';
import { RoundQueries } from './round-queries.js';

/** Leituras públicas das rodadas (seção 8.1, D63). */
@Controller('rounds')
export class RoundsController {
  constructor(
    @Inject(MikroORM) private readonly orm: MikroORM,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(RoundQueries) private readonly rounds: RoundQueries,
    @Inject(BetQueries) private readonly bets: BetQueries,
  ) {}

  /**
   * A rodada vem do agregado, que não tem getter de segredo, e vira um DTO
   * sem campos para eles antes do crash (D30, D63).
   */
  @Get('current')
  @UseGuards(OptionalAuthGuard)
  async current(
    @OptionalPlayer() player: AuthenticatedPlayer | null,
  ): Promise<CurrentRoundResponse> {
    const serverTime = this.clock.now();
    const repository = this.repository();
    const round =
      (await repository.findCurrent()) ??
      (await repository.findLatestCrashed());
    if (!round) {
      return { round: null, bets: [], myBet: null, serverTime };
    }
    const [bets, myBet] = await Promise.all([
      this.bets.betsOf(round.id),
      player ? this.bets.myBet(round.id, player.id) : null,
    ]);
    return { round: toRoundDto(round), bets, myBet, serverTime };
  }

  @Get('history')
  history(@Query('limit') limit: unknown): Promise<RoundHistoryItem[]> {
    return this.rounds.history(parseHistoryLimit(limit));
  }

  /** Antes do crash, `reveal*` lança SECRET_NOT_REVEALED (409). */
  @Get(':id/verify')
  async verify(@Param('id') rawId: string): Promise<VerifyResponse> {
    const id = parseUuidParam(rawId, 'id');
    const round = await this.repository().findById(id);
    if (!round) {
      throw new RoundNotFoundError(`a rodada ${id} não existe`);
    }
    return {
      serverSeed: round.revealServerSeed().toHex(),
      seedHash: round.seedHash.toHex(),
      crashPoint: round.revealCrashPoint().x100,
    };
  }

  private repository(): MikroOrmRoundRepository {
    return new MikroOrmRoundRepository(this.orm.em.fork());
  }
}
