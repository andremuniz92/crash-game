import { ApiError, NetworkError } from './api-client.js';

/** Proxy ou plataforma fora do ar: a requisição pode não ter chegado à API. */
const RETRYABLE_STATUS = new Set([502, 503, 504]);

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Repete `attempt` em falha de rede, timeout ou 502/503/504, até 2 vezes, com
 * 300 ms entre as tentativas (D78). Quem chama cria a Idempotency-Key antes,
 * então todas as tentativas levam a mesma: se a primeira chegou a ser
 * processada, a repetição recebe a resposta salva (D60). 500 é bug e 4xx é
 * resposta definitiva; nenhum dos dois se repete.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  {
    retries = 2,
    delayMs = 300,
    sleep = wait,
  }: {
    retries?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  for (let tried = 0; ; tried++) {
    try {
      return await attempt();
    } catch (error) {
      if (tried >= retries || !isRetryable(error)) throw error;
      await sleep(delayMs);
    }
  }
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof NetworkError ||
    (error instanceof ApiError && RETRYABLE_STATUS.has(error.status))
  );
}
