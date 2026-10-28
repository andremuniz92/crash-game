import { DomainError } from '../../domain/domain-error.js';

/*
 * Erros da borda HTTP. Herdam de DomainError só para carregar o `code` e
 * passar pela mesma tabela do filtro (D58).
 */

/** Entrada do cliente fora do contrato: corpo, header ou parâmetro da URL. */
export class InvalidRequestError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
}

/** Sem `Bearer`, token malformado ou desconhecido (D59). */
export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
}
