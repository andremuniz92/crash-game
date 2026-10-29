import {
  type ClientErrorCode,
  MAX_BET_CENTS,
  MIN_BET_CENTS,
} from '@crash/shared';
import { formatCredits } from '../format/credits.js';
import { ApiError, NetworkError } from '../net/api-client.js';

export const GENERIC_MESSAGE = 'Algo deu errado. Tente de novo.';

/**
 * Uma mensagem para cada código 4xx da seção 8.1 (D78). O tipo obriga a
 * tabela a cobrir todos os `CLIENT_ERROR_CODES` do @crash/shared.
 */
const MESSAGES: Record<ClientErrorCode, string> = {
  VALIDATION_ERROR: 'Dados inválidos. Confira o que foi digitado.',
  IDEMPOTENCY_KEY_REQUIRED:
    'A operação foi enviada sem identificação. Tente de novo.',
  INVALID_IDEMPOTENCY_KEY:
    'A operação foi enviada com uma identificação inválida. Tente de novo.',
  INVALID_BET_AMOUNT: `A aposta deve ser de ${formatCredits(MIN_BET_CENTS)} a ${formatCredits(MAX_BET_CENTS)} créditos.`,
  UNAUTHORIZED: 'Sua sessão não vale mais. Entre com um nickname de novo.',
  ROUND_NOT_FOUND: 'Rodada não encontrada.',
  BET_NOT_FOUND: 'Aposta não encontrada.',
  ROUND_NOT_ACCEPTING_BETS:
    'As apostas desta rodada já fecharam. Aguarde a próxima.',
  BET_ALREADY_PLACED: 'Você já apostou nesta rodada.',
  ROUND_NOT_RUNNING: 'A rodada ainda não começou.',
  BET_NOT_PENDING: 'Esta aposta já foi encerrada.',
  TOO_LATE: 'Tarde demais: a rodada já crashou.',
  SECRET_NOT_REVEALED: 'A seed só é revelada depois do crash.',
  INSUFFICIENT_BALANCE: 'Saldo insuficiente.',
  IDEMPOTENCY_KEY_REUSED:
    'Esta operação já foi enviada com outros dados. Tente de novo.',
};

/** A mensagem de um código da tabela, para quem valida antes de chamar a API. */
export function messageFor(code: ClientErrorCode): string {
  return MESSAGES[code];
}

/** Texto para o jogador; a mensagem do servidor nunca é exibida. */
export function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return error.kind === 'timeout'
      ? 'O servidor demorou para responder. Tente de novo.'
      : 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  }
  if (error instanceof ApiError && Object.hasOwn(MESSAGES, error.code)) {
    return MESSAGES[error.code as ClientErrorCode];
  }
  return GENERIC_MESSAGE;
}
