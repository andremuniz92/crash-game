export class InvalidWebConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWebConfigError';
  }
}

export interface WebConfig {
  /** Origem da API REST, sem barra final. */
  apiUrl: string;
  /** WebSocket na mesma origem, em /ws. */
  wsUrl: string;
}

const DEV_API_URL = 'http://localhost:3000';

/**
 * Endereço da API a partir do `import.meta.env` (D73). Em dev, sem a
 * variável, usa a API local; no build de produção, a variável é obrigatória.
 * Origem pura, como a `WEB_ORIGIN` da API (D69).
 */
export function readWebConfig(env: {
  VITE_API_URL?: string;
  PROD: boolean;
}): WebConfig {
  const raw = env.VITE_API_URL?.trim();
  if (!raw && env.PROD) {
    throw new InvalidWebConfigError(
      'VITE_API_URL é obrigatória no build de produção: a origem da API',
    );
  }
  const apiUrl = raw || DEV_API_URL;
  if (originOf(apiUrl) !== apiUrl) {
    throw new InvalidWebConfigError(
      `VITE_API_URL deve ser uma origem http ou https, sem caminho nem barra final, recebido "${apiUrl}"`,
    );
  }
  return { apiUrl, wsUrl: `${apiUrl.replace(/^http/, 'ws')}/ws` };
}

/** A origem normalizada de uma URL http ou https, ou null. */
function originOf(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
