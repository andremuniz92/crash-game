import { createHash } from 'node:crypto';
import { DomainError } from '../../shared/domain/domain-error.js';
import { HEX_32_BYTES } from './hex.js';
import { SeedHash } from './seed-hash.js';

export class InvalidServerSeedError extends DomainError {
  readonly code = 'INVALID_SERVER_SEED';
}

/**
 * Seed secreta da rodada: 32 bytes em hex (D23). O domínio só a reconstrói;
 * a geração aleatória fica na aplicação (D22).
 *
 * O valor fica num campo privado e não aparece em JSON, String() nem inspect,
 * para não vazar em log. A única saída é `toHex()`.
 */
export class ServerSeed {
  readonly #hex: string;

  private constructor(hex: string) {
    this.#hex = hex;
  }

  static fromHex(hex: string): ServerSeed {
    if (!HEX_32_BYTES.test(hex)) {
      throw new InvalidServerSeedError(
        'server seed deve ter 64 caracteres hex minúsculos',
      );
    }
    return new ServerSeed(hex);
  }

  toHex(): string {
    return this.#hex;
  }

  hash(): SeedHash {
    return SeedHash.fromHex(
      createHash('sha256').update(this.#hex, 'utf8').digest('hex'),
    );
  }

  toString(): string {
    return '[ServerSeed]';
  }

  toJSON(): string {
    return '[ServerSeed]';
  }
}
