const BASE_MS = 500;
const CAP_MS = 10_000;

/**
 * Espera antes da tentativa `attempt` (0, 1, 2...) de reconexão, com "full
 * jitter": um valor aleatório entre 0 e min(10 s, 500 ms × 2^attempt), para
 * os clientes não voltarem todos juntos depois de uma queda da API (D76).
 */
export function backoffDelay(attempt: number, random: () => number): number {
  return random() * Math.min(CAP_MS, BASE_MS * 2 ** attempt);
}
