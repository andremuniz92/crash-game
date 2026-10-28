import type { PlaceBetRequest } from '@crash/shared';
import { InvalidRequestError } from '../../shared/infrastructure/http/request-errors.js';

/**
 * Corpo do `POST /bets`: `amount` inteiro seguro, em centavos. A faixa
 * (e o sinal) é regra do domínio: INVALID_BET_AMOUNT. Campos extras são
 * ignorados e não entram no request_hash (D60).
 */
export function parseBetBody(body: unknown): PlaceBetRequest {
  const amount =
    typeof body === 'object' && body !== null && 'amount' in body
      ? body.amount
      : undefined;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) {
    throw new InvalidRequestError('amount deve ser um inteiro de centavos');
  }
  return { amount };
}
