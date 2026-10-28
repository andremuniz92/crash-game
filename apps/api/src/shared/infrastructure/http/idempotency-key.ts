import { DomainError } from '../../domain/domain-error.js';

export class IdempotencyKeyRequiredError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REQUIRED';
}

export class InvalidIdempotencyKeyError extends DomainError {
  readonly code = 'INVALID_IDEMPOTENCY_KEY';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Header `Idempotency-Key` (D5, D60). A coluna `key` é uuid, então qualquer
 * outra coisa é recusada aqui com 400, antes de chegar ao banco.
 */
export function parseIdempotencyKey(
  header: string | string[] | undefined,
): string {
  if (header === undefined || (typeof header === 'string' && !header.trim())) {
    throw new IdempotencyKeyRequiredError(
      'o header Idempotency-Key é obrigatório',
    );
  }
  if (typeof header !== 'string' || !UUID.test(header)) {
    throw new InvalidIdempotencyKeyError('Idempotency-Key deve ser um UUID');
  }
  return header.toLowerCase();
}
