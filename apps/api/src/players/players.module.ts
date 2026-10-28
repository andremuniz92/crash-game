import { Module } from '@nestjs/common';
import type { IdGenerator } from '../shared/application/id-generator.js';
import type { Clock } from '../shared/domain/clock.js';
import { UNIT_OF_WORK } from '../shared/infrastructure/database/database.module.js';
import type { MikroOrmUnitOfWork } from '../shared/infrastructure/database/mikro-orm-unit-of-work.js';
import { CLOCK, ID_GENERATOR } from '../shared/infrastructure/tokens.js';
import { AuthGuard, OptionalAuthGuard } from './auth.guard.js';
import { CreateGuest } from './create-guest.js';
import { PlayersController } from './players.controller.js';

@Module({
  controllers: [PlayersController],
  providers: [
    AuthGuard,
    OptionalAuthGuard,
    {
      provide: CreateGuest,
      useFactory: (uow: MikroOrmUnitOfWork, clock: Clock, ids: IdGenerator) =>
        new CreateGuest(uow, clock, ids),
      inject: [UNIT_OF_WORK, CLOCK, ID_GENERATOR],
    },
  ],
  exports: [AuthGuard, OptionalAuthGuard],
})
export class PlayersModule {}
