import { MAX_MULTIPLIER_X100, ONE_X } from '@crash/shared';
import { DomainError } from './domain-error.js';

export class InvalidMultiplierError extends DomainError {
  readonly code = 'INVALID_MULTIPLIER';
}

/** Multiplicador como inteiro ×100 (D21), entre 1,00x e o teto de 1.000.000,00x (D24). */
export class Multiplier {
  static readonly MIN_X100 = ONE_X;
  static readonly MAX_X100 = MAX_MULTIPLIER_X100;

  private constructor(readonly x100: number) {}

  static fromX100(x100: number): Multiplier {
    if (
      !Number.isInteger(x100) ||
      x100 < Multiplier.MIN_X100 ||
      x100 > Multiplier.MAX_X100
    ) {
      throw new InvalidMultiplierError(
        `multiplicador deve ser um inteiro ×100 entre ${Multiplier.MIN_X100} e ${Multiplier.MAX_X100}, recebido ${x100}`,
      );
    }
    return new Multiplier(x100);
  }

  equals(other: Multiplier): boolean {
    return this.x100 === other.x100;
  }
}
