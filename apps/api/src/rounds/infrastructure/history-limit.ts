import { InvalidRequestError } from '../../shared/infrastructure/http/request-errors.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** `?limit=` do histórico: inteiro de 1 a 100, padrão 20. */
export function parseHistoryLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  const limit =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(limit >= 1 && limit <= MAX_LIMIT)) {
    throw new InvalidRequestError(
      `limit deve ser um inteiro de 1 a ${MAX_LIMIT}`,
    );
  }
  return limit;
}
