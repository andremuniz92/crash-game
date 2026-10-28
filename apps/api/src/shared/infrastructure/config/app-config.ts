import {
  type DatabaseConfig,
  readDatabaseConfig,
} from '../database/database-config.js';

export class InvalidAppConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAppConfigError';
  }
}

export interface AppConfig {
  port: number;
  database: DatabaseConfig;
  bettingMs: number;
  tickMs: number;
  pauseMs: number;
  wsHeartbeatMs: number;
}

/** Token de injeção da configuração no Nest. */
export const APP_CONFIG = Symbol('APP_CONFIG');

type Env = Record<string, string | undefined>;

const MAX_PORT = 65_535;

/** Configuração da API a partir das variáveis de ambiente (D64). */
export function readAppConfig(env: Env): AppConfig {
  return {
    port: readPositiveInt(env, 'PORT', 3_000, MAX_PORT),
    database: readDatabaseConfig(env),
    bettingMs: readPositiveInt(env, 'BETTING_MS', 10_000),
    tickMs: readPositiveInt(env, 'TICK_MS', 100),
    pauseMs: readPositiveInt(env, 'PAUSE_MS', 3_000),
    wsHeartbeatMs: readPositiveInt(env, 'WS_HEARTBEAT_MS', 30_000),
  };
}

/** Inteiro positivo em decimal; ausente ou vazio usa o padrão. */
function readPositiveInt(
  env: Env,
  variable: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = env[variable]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > max) {
    throw new InvalidAppConfigError(
      `${variable} deve ser um inteiro entre 1 e ${max}, recebido "${raw}"`,
    );
  }
  return value;
}
