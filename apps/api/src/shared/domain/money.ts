import { DomainError } from './domain-error.js';
import type { Multiplier } from './multiplier.js';

export class InvalidMoneyError extends DomainError {
  readonly code = 'INVALID_MONEY';
}

/** Dinheiro em centavos inteiros, sempre >= 0 (D6). */
export class Money {
  private constructor(readonly cents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isSafeInteger(cents) || cents < 0) {
      throw new InvalidMoneyError(
        `valor deve ser um inteiro de centavos >= 0, recebido ${cents}`,
      );
    }
    return new Money(cents);
  }

  add(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return Money.fromCents(this.cents - other.cents);
  }

  /** Arredonda para baixo. Usa BigInt para que o produto seja exato. */
  multiply(multiplier: Multiplier): Money {
    const product = (BigInt(this.cents) * BigInt(multiplier.x100)) / 100n;
    return Money.fromCents(Number(product));
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }
}
