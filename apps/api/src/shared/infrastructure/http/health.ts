import type { LoggerService } from '@nestjs/common';

/** Consulta mínima ao banco; rejeita se ele não responder. */
export interface DatabasePing {
  ping(): Promise<void>;
}

/**
 * Espera máxima pelo `select 1`, bem abaixo do `healthcheckTimeout` do
 * Railway (D105): um banco pendurado responde 503 em vez de prender a rota.
 */
export const HEALTH_TIMEOUT_MS = 2_000;

export interface HealthResult {
  status: number;
  body: { status: 'ok' } | { code: 'UNHEALTHY' };
}

/**
 * Resposta do `GET /health` (D105). O corpo de falha não leva a mensagem do
 * erro, que pode trazer host, usuário ou nome do banco: ela vai só para o log.
 */
export async function checkHealth(
  database: DatabasePing,
  logger: Pick<LoggerService, 'error'>,
): Promise<HealthResult> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new Error(`o banco não respondeu em ${HEALTH_TIMEOUT_MS} ms`)),
      HEALTH_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([database.ping(), timeout]);
    return { status: 200, body: { status: 'ok' } };
  } catch (error) {
    logger.error(
      'healthcheck falhou',
      error instanceof Error ? error.stack : String(error),
    );
    return { status: 503, body: { code: 'UNHEALTHY' } };
  } finally {
    clearTimeout(timer);
  }
}
