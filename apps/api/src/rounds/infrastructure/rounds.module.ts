import { MikroORM } from '@mikro-orm/postgresql';
import { type BeforeApplicationShutdown, Inject, Module } from '@nestjs/common';
import { BetsModule } from '../../bets/infrastructure/bets.module.js';
import { PlayersModule } from '../../players/players.module.js';
import type { EventPublisher } from '../../shared/application/event-publisher.js';
import type { IdGenerator } from '../../shared/application/id-generator.js';
import type { Clock } from '../../shared/domain/clock.js';
import {
  APP_CONFIG,
  type AppConfig,
} from '../../shared/infrastructure/config/app-config.js';
import { UNIT_OF_WORK } from '../../shared/infrastructure/database/database.module.js';
import type { MikroOrmUnitOfWork } from '../../shared/infrastructure/database/mikro-orm-unit-of-work.js';
import {
  CLOCK,
  EVENT_PUBLISHER,
  ID_GENERATOR,
} from '../../shared/infrastructure/tokens.js';
import { GameLoopStep } from '../application/game-loop-step.js';
import type { SeedGenerator } from '../application/seed-generator.js';
import { GameLoop } from './game-loop.js';
import { RandomSeedGenerator } from './random-seed-generator.js';
import { RoundQueries } from './round-queries.js';
import { RoundsController } from './rounds.controller.js';
import { SEED_GENERATOR } from './seed-generator.token.js';

@Module({
  imports: [PlayersModule, BetsModule],
  controllers: [RoundsController],
  providers: [
    {
      provide: RoundQueries,
      useFactory: (orm: MikroORM) => new RoundQueries(orm),
      inject: [MikroORM],
    },
    { provide: SEED_GENERATOR, useValue: new RandomSeedGenerator() },
    {
      provide: GameLoopStep,
      useFactory: (
        uow: MikroOrmUnitOfWork,
        clock: Clock,
        ids: IdGenerator,
        seeds: SeedGenerator,
        events: EventPublisher,
        config: AppConfig,
      ) =>
        new GameLoopStep(uow, clock, ids, seeds, events, {
          bettingMs: config.bettingMs,
          pauseMs: config.pauseMs,
        }),
      inject: [
        UNIT_OF_WORK,
        CLOCK,
        ID_GENERATOR,
        SEED_GENERATOR,
        EVENT_PUBLISHER,
        APP_CONFIG,
      ],
    },
    {
      provide: GameLoop,
      useFactory: (step: GameLoopStep) => new GameLoop(step),
      inject: [GameLoopStep],
    },
  ],
  exports: [GameLoop, GameLoopStep],
})
export class RoundsModule implements BeforeApplicationShutdown {
  constructor(@Inject(GameLoop) private readonly loop: GameLoop) {}

  /** Antes do DatabaseModule fechar o banco: o passo em andamento termina. */
  beforeApplicationShutdown(): Promise<void> {
    return this.loop.stop();
  }
}
