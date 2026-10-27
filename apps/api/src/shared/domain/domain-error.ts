/** Base dos erros de domínio (D28). O `code` é estável; a mensagem é só para humanos. */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
