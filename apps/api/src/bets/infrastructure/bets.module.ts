import { MikroORM } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';
import { BetQueries } from './bet-queries.js';

@Module({
  providers: [
    {
      provide: BetQueries,
      useFactory: (orm: MikroORM) => new BetQueries(orm),
      inject: [MikroORM],
    },
  ],
  exports: [BetQueries],
})
export class BetsModule {}
