/**
 * Códigos de erro que a API devolve ao cliente com status 4xx (seção 8.1,
 * D58), no formato `{ code, message }`. O front tem uma mensagem para cada
 * um; um teste da API garante que a lista bate com a tabela da D58.
 */
export const CLIENT_ERROR_CODES = [
  // 400
  'VALIDATION_ERROR',
  'IDEMPOTENCY_KEY_REQUIRED',
  'INVALID_IDEMPOTENCY_KEY',
  'INVALID_BET_AMOUNT',
  // 401
  'UNAUTHORIZED',
  // 404
  'ROUND_NOT_FOUND',
  'BET_NOT_FOUND',
  // 409
  'ROUND_NOT_ACCEPTING_BETS',
  'BET_ALREADY_PLACED',
  'ROUND_NOT_RUNNING',
  'BET_NOT_PENDING',
  'TOO_LATE',
  'SECRET_NOT_REVEALED',
  // 422
  'INSUFFICIENT_BALANCE',
  'IDEMPOTENCY_KEY_REUSED',
] as const;

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
