import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import {
  APP_CONFIG,
  type AppConfig,
} from '../../src/shared/infrastructure/config/app-config.js';
import { readTestDatabaseConfig } from '../../src/shared/infrastructure/database/database-config.js';

/**
 * App completa apontando para o banco de teste (D66), sem o game loop: ele só
 * é ligado pelo main.ts (D61).
 */
export async function createTestApp(): Promise<INestApplication<App>> {
  const config: AppConfig = {
    port: 0,
    database: readTestDatabaseConfig(process.env),
    bettingMs: 10_000,
    tickMs: 100,
    pauseMs: 3_000,
    wsHeartbeatMs: 30_000,
  };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: false,
  });
  await app.init();
  return app;
}
