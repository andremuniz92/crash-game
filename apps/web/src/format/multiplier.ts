import { formatHundredths } from './hundredths.js';

/** Multiplicador ×100 (D21) em texto: 157 → "1,57x". */
export function formatMultiplier(x100: number): string {
  if (!Number.isSafeInteger(x100)) {
    throw new RangeError(
      `o multiplicador deve ser um inteiro ×100 seguro, recebido ${x100}`,
    );
  }
  return `${formatHundredths(x100)}x`;
}
