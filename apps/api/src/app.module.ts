import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from './shared/infrastructure/config/app-config.module.js';
import { DatabaseModule } from './shared/infrastructure/database/database.module.js';
import { AppExceptionFilter } from './shared/infrastructure/http/app-exception.filter.js';

@Module({
  imports: [AppConfigModule, DatabaseModule],
  providers: [
    // Todo erro sai como { code, message } (D58).
    { provide: APP_FILTER, useFactory: () => new AppExceptionFilter() },
  ],
})
export class AppModule {}
