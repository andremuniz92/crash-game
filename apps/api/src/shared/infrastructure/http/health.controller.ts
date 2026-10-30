import {
  Controller,
  Get,
  Inject,
  Logger,
  type LoggerService,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { checkHealth, type DatabasePing, type HealthResult } from './health.js';

/** Token do `DatabasePing` do `GET /health`. */
export const DATABASE_PING = Symbol('DATABASE_PING');

/**
 * `GET /health` para o healthcheck do Railway (D105). Monta a resposta sem
 * passar pelo filtro da D58, que transformaria o 503 em INTERNAL_ERROR.
 */
@Controller('health')
export class HealthController {
  private readonly logger: Pick<LoggerService, 'error'> = new Logger('Health');

  constructor(@Inject(DATABASE_PING) private readonly database: DatabasePing) {}

  @Get()
  async check(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResult['body']> {
    const { status, body } = await checkHealth(this.database, this.logger);
    response.status(status);
    return body;
  }
}
