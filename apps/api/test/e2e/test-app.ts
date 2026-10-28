import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import type { SeedGenerator } from '../../src/rounds/application/seed-generator.js';
import { ServerSeed } from '../../src/rounds/domain/server-seed.js';
import { SEED_GENERATOR } from '../../src/rounds/infrastructure/seed-generator.token.js';
import type { IdGenerator } from '../../src/shared/application/id-generator.js';
import type { Clock } from '../../src/shared/domain/clock.js';
import {
  APP_CONFIG,
  type AppConfig,
} from '../../src/shared/infrastructure/config/app-config.js';
import { readTestDatabaseConfig } from '../../src/shared/infrastructure/database/database-config.js';
import { CLOCK, ID_GENERATOR } from '../../src/shared/infrastructure/tokens.js';

export const BETTING_MS = 10_000;
export const PAUSE_MS = 3_000;

/**
 * Ids e seeds com fila: devolvem o que o teste enfileirou e, depois,
 * valores aleatórios. Assim os jogadores ganham ids reais e a rodada usa um
 * vetor conhecido do M1.
 */
export class QueuedGenerators implements IdGenerator, SeedGenerator {
  private readonly ids: string[] = [];
  private readonly seeds: string[] = [];

  enqueueRound(vector: { id: string; seed: string }): void {
    this.ids.push(vector.id);
    this.seeds.push(vector.seed);
  }

  newId(): string {
    return this.ids.shift() ?? randomUUID();
  }

  newSeed(): ServerSeed {
    return ServerSeed.fromHex(
      this.seeds.shift() ?? randomBytes(32).toString('hex'),
    );
  }
}

/**
 * App completa apontando para o banco de teste (D66), sem o game loop: ele só
 * é ligado pelo main.ts (D61). O teste chama o `GameLoopStep` à mão. Escuta
 * numa porta aleatória, com o WsAdapter do main.ts, para os testes do WS.
 */
export async function createTestApp(
  overrides: {
    clock?: Clock;
    generators?: QueuedGenerators;
    tickMs?: number;
  } = {},
): Promise<INestApplication<App>> {
  const config: AppConfig = {
    port: 0,
    database: readTestDatabaseConfig(process.env),
    bettingMs: BETTING_MS,
    tickMs: overrides.tickMs ?? 100,
    pauseMs: PAUSE_MS,
    wsHeartbeatMs: 30_000,
  };
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config);
  if (overrides.clock) {
    builder = builder.overrideProvider(CLOCK).useValue(overrides.clock);
  }
  if (overrides.generators) {
    builder = builder
      .overrideProvider(ID_GENERATOR)
      .useValue(overrides.generators)
      .overrideProvider(SEED_GENERATOR)
      .useValue(overrides.generators);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({
    logger: false,
  });
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.listen(0, '127.0.0.1');
  return app;
}

/** URL do WebSocket da app (`/ws`, seção 8.2). */
export function wsUrl(app: INestApplication<App>): string {
  const address = (app.getHttpServer() as unknown as Server).address();
  if (address === null || typeof address === 'string') {
    throw new Error('a app de teste não está escutando numa porta TCP');
  }
  return `ws://127.0.0.1:${address.port}/ws`;
}
