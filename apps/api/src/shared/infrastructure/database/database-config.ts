/** Configuração do banco a partir das variáveis de ambiente (D43). */

export class InvalidDatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDatabaseConfigError';
  }
}

export interface DatabaseConfig {
  clientUrl: string;
}

type Env = Record<string, string | undefined>;

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

export function readDatabaseConfig(env: Env): DatabaseConfig {
  return { clientUrl: readPostgresUrl(env, 'DATABASE_URL').href };
}

/** Só aceita banco cujo nome termina em `_test`, para não truncar o banco de desenvolvimento (D40). */
export function readTestDatabaseConfig(env: Env): DatabaseConfig {
  const url = readPostgresUrl(env, 'TEST_DATABASE_URL');
  const dbName = databaseName(url);
  if (!dbName.endsWith('_test')) {
    throw new InvalidDatabaseConfigError(
      `TEST_DATABASE_URL deve apontar para um banco terminado em _test, recebido "${dbName}"`,
    );
  }
  return { clientUrl: url.href };
}

function readPostgresUrl(env: Env, variable: string): URL {
  const raw = env[variable]?.trim();
  if (!raw) {
    throw new InvalidDatabaseConfigError(`${variable} não está definida`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidDatabaseConfigError(`${variable} não é uma URL válida`);
  }
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new InvalidDatabaseConfigError(
      `${variable} deve usar postgres:// ou postgresql://, recebido ${url.protocol}//`,
    );
  }
  if (!databaseName(url)) {
    throw new InvalidDatabaseConfigError(
      `${variable} não informa o nome do banco`,
    );
  }
  return url;
}

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}
