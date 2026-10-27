import { DomainError } from '../../shared/domain/domain-error.js';
import { HEX_32_BYTES } from './hex.js';
import type { ServerSeed } from './server-seed.js';

export class InvalidSeedHashError extends DomainError {
  readonly code = 'INVALID_SEED_HASH';
}

/** `sha256(serverSeed)` em hex (D23). Público desde a criação da rodada. */
export class SeedHash {
  private constructor(private readonly hex: string) {}

  static fromHex(hex: string): SeedHash {
    if (!HEX_32_BYTES.test(hex)) {
      throw new InvalidSeedHashError(
        'seed hash deve ter 64 caracteres hex minúsculos',
      );
    }
    return new SeedHash(hex);
  }

  toHex(): string {
    return this.hex;
  }

  equals(other: SeedHash): boolean {
    return this.hex === other.hex;
  }

  matches(seed: ServerSeed): boolean {
    return this.equals(seed.hash());
  }
}
