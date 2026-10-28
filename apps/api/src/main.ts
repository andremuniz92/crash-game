import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { GameLoop } from './rounds/infrastructure/game-loop.js';
import {
  APP_CONFIG,
  type AppConfig,
} from './shared/infrastructure/config/app-config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);
  // SIGTERM e SIGINT passam pelo shutdown dos módulos, que fecha o banco.
  app.enableShutdownHooks();
  await app.listen(config.port);
  // Só aqui: os testes sobem a app sem o loop e chamam o passo à mão (D61).
  app.get(GameLoop).start();
}
await bootstrap();
