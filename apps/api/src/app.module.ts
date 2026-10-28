import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BetsModule } from './bets/infrastructure/bets.module.js';
import { PlayersModule } from './players/players.module.js';
import { RoundsModule } from './rounds/infrastructure/rounds.module.js';
import { CoreModule } from './shared/infrastructure/core.module.js';
import { AppConfigModule } from './shared/infrastructure/config/app-config.module.js';
import { DatabaseModule } from './shared/infrastructure/database/database.module.js';
import { AppExceptionFilter } from './shared/infrastructure/http/app-exception.filter.js';
import { WalletModule } from './wallet/infrastructure/wallet.module.js';

@Module({
  imports: [
    AppConfigModule,
    CoreModule,
    DatabaseModule,
    PlayersModule,
    RoundsModule,
    BetsModule,
    WalletModule,
  ],
  providers: [
    // Todo erro sai como { code, message } (D58).
    { provide: APP_FILTER, useFactory: () => new AppExceptionFilter() },
  ],
})
export class AppModule {}
