/**
 * Status HTTP de cada código de erro de domínio (D58). Todo código de src/
 * precisa estar aqui (error-status.spec.ts). 500 é bug: o cliente recebe uma
 * mensagem genérica e o erro vai para o log.
 *
 * Os erros de formato dos VOs (INVALID_MONEY, INVALID_SERVER_SEED...) são
 * 500: a entrada do cliente é validada antes, no HTTP, então chegar a eles
 * indica dado ruim do banco ou validação faltando.
 */
export const ERROR_STATUS: Readonly<Record<string, number>> = {
  INVALID_BET_AMOUNT: 400,

  ROUND_NOT_ACCEPTING_BETS: 409,
  BET_ALREADY_PLACED: 409,
  ROUND_NOT_RUNNING: 409,
  BET_NOT_PENDING: 409,
  TOO_LATE: 409,
  SECRET_NOT_REVEALED: 409,

  INSUFFICIENT_BALANCE: 422,

  BETTING_WINDOW_OPEN: 500,
  BET_ROUND_MISMATCH: 500,
  CORRUPTED_BET: 500,
  CORRUPTED_ROUND: 500,
  CORRUPTED_WALLET: 500,
  CRASH_BEFORE_CRASH_AT: 500,
  INVALID_MONEY: 500,
  INVALID_MULTIPLIER: 500,
  INVALID_ROUND_HASH: 500,
  INVALID_ROUND_ID: 500,
  INVALID_ROUND_TRANSITION: 500,
  INVALID_SEED_HASH: 500,
  INVALID_SERVER_SEED: 500,
  ROUND_NOT_CRASHED: 500,
  WALLET_NOT_FOUND: 500,
  WALLET_VERSION_CONFLICT: 500,
};
