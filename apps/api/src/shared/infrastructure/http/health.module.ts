import { MikroORM } from '@mikro-orm/postgresql';
import { Module } from '@nestjs/common';
import { MikroOrmDatabasePing } from '../database/mikro-orm-database-ping.js';
import { DATABASE_PING, HealthController } from './health.controller.js';

/** `GET /health` (D105); o MikroORM vem do DatabaseModule global. */
@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: DATABASE_PING,
      useFactory: (orm: MikroORM) => new MikroOrmDatabasePing(orm),
      inject: [MikroORM],
    },
  ],
})
export class HealthModule {}
