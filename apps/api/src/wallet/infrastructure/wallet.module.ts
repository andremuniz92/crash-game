import { MikroORM } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';
import { PlayersModule } from '../../players/players.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletQueries } from './wallet-queries.js';

@Module({
  imports: [PlayersModule],
  controllers: [WalletController],
  providers: [
    {
      provide: WalletQueries,
      useFactory: (orm: MikroORM) => new WalletQueries(orm),
      inject: [MikroORM],
    },
  ],
})
export class WalletModule {}
