import { createHmac } from 'node:crypto';
import { DomainError } from '../../shared/domain/domain-error.js';
import { Multiplier } from '../../shared/domain/multiplier.js';
import type { ServerSeed } from './server-seed.js';

export class InvalidRoundIdError extends DomainError {
  readonly code = 'INVALID_ROUND_ID';
}

export class InvalidRoundHashError extends DomainError {
  readonly code = 'INVALID_ROUND_HASH';
}

/** UUID canônico: minúsculo e com hífens (D23). */
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const E = 2n ** 52n;
const INSTANT_CRASH_DIVISOR = 33n;

/**
 * `h` da fórmula publicada (seção 7.2): os 52 bits iniciais de
 * HMAC_SHA256(key = serverSeed, message = roundId).
 */
export function roundHashInt52(seed: ServerSeed, roundId: string): number {
  if (!CANONICAL_UUID.test(roundId)) {
    throw new InvalidRoundIdError(
      `roundId deve ser um UUID minúsculo com hífens, recebido ${roundId}`,
    );
  }
  const hmac = createHmac('sha256', seed.toHex())
    .update(roundId, 'utf8')
    .digest('hex');
  return Number.parseInt(hmac.slice(0, 13), 16);
}

/** Crash point a partir de `h`, com divisão inteira exata (D27) e teto (D24). */
export function crashPointFromInt52(h: number): Multiplier {
  if (!Number.isInteger(h) || h < 0 || h >= Number(E)) {
    throw new InvalidRoundHashError(
      `h deve ser um inteiro em [0, 2^52), recebido ${h}`,
    );
  }
  const hBig = BigInt(h);
  if (hBig % INSTANT_CRASH_DIVISOR === 0n) {
    return Multiplier.fromX100(Multiplier.MIN_X100);
  }
  const x100 = (100n * E - hBig) / (E - hBig);
  const capped =
    x100 < BigInt(Multiplier.MAX_X100) ? Number(x100) : Multiplier.MAX_X100;
  return Multiplier.fromX100(capped);
}

export function crashPointFor(seed: ServerSeed, roundId: string): Multiplier {
  return crashPointFromInt52(roundHashInt52(seed, roundId));
}
