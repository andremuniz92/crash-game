import { MikroORM } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';
import { PlayersModule } from '../../players/players.module.js';
import type { EventPublisher } from '../../shared/application/event-publisher.js';
import type { IdGenerator } from '../../shared/application/id-generator.js';
import type { Clock } from '../../shared/domain/clock.js';
import { UNIT_OF_WORK } from '../../shared/infrastructure/database/database.module.js';
import type { MikroOrmUnitOfWork } from '../../shared/infrastructure/database/mikro-orm-unit-of-work.js';
import {
  CLOCK,
  EVENT_PUBLISHER,
  ID_GENERATOR,
} from '../../shared/infrastructure/tokens.js';
import { CashOut } from '../application/cash-out.js';
import { PlaceBet } from '../application/place-bet.js';
import { BetQueries } from './bet-queries.js';
import { BetsController } from './bets.controller.js';

@Module({
  imports: [PlayersModule],
  controllers: [BetsController],
  providers: [
    {
      provide: BetQueries,
      useFactory: (orm: MikroORM) => new BetQueries(orm),
      inject: [MikroORM],
    },
    {
      provide: PlaceBet,
      useFactory: (
        uow: MikroOrmUnitOfWork,
        clock: Clock,
        ids: IdGenerator,
        events: EventPublisher,
      ) => new PlaceBet(uow, clock, ids, events),
      inject: [UNIT_OF_WORK, CLOCK, ID_GENERATOR, EVENT_PUBLISHER],
    },
    {
      provide: CashOut,
      useFactory: (
        uow: MikroOrmUnitOfWork,
        clock: Clock,
        events: EventPublisher,
      ) => new CashOut(uow, clock, events),
      inject: [UNIT_OF_WORK, CLOCK, EVENT_PUBLISHER],
    },
  ],
  exports: [BetQueries],
})
export class BetsModule {}
