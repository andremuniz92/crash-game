import { InvalidRequestError } from './request-errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Id da URL no formato canônico, em minúsculas (D23). Validar aqui faz o id
 * malformado responder 400, e não o 500 dos erros de formato dos VOs (D58).
 */
export function parseUuidParam(value: string, name: string): string {
  if (!UUID.test(value)) {
    throw new InvalidRequestError(`${name} deve ser um UUID`);
  }
  return value.toLowerCase();
}
