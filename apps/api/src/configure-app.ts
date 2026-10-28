import type { INestApplication } from '@nestjs/common';
import { OriginCheckedWsAdapter } from './rounds/infrastructure/ws/origin-checked-ws-adapter.js';
import type { AppConfig } from './shared/infrastructure/config/app-config.js';
import { isAllowedOrigin } from './shared/infrastructure/http/origin.js';

/**
 * O que a app precisa além dos módulos, igual no boot e nos testes E2E:
 * CORS e WebSocket só para a origem do front (D69, D70).
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.enableCors({
    // Em função, e não em array: com `false`, o pacote cors não escreve
    // nenhum header, nem Allow-Methods no preflight.
    origin: (
      origin: string | undefined,
      allow: (error: Error | null, allowed: boolean) => void,
    ) => allow(null, isAllowedOrigin(config.webOrigin, origin)),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
  });
  app.useWebSocketAdapter(new OriginCheckedWsAdapter(app, config.webOrigin));
}
