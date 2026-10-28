import { MAX_BET_CENTS, MIN_BET_CENTS } from '@crash/shared';
import { formatHundredths } from './hundredths.js';

export type CreditsInput =
  | { ok: true; cents: number }
  | { ok: false; error: 'FORMAT' | 'BELOW_MIN' | 'ABOVE_MAX' };

/** Centavos em créditos: 100050 → "1.000,50"; o extrato tem valores negativos. */
export function formatCredits(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(
      `centavos devem ser um inteiro seguro, recebido ${cents}`,
    );
  }
  return formatHundredths(cents);
}

/** Vírgula ou ponto como separador decimal, até 2 casas, sem milhar (D79). */
const INPUT = /^(\d+)(?:[.,](\d{1,2}))?$/;
/** Com até 13 dígitos inteiros, os centavos cabem num inteiro seguro. */
const MAX_WHOLE_DIGITS = 13;

/** O valor digitado no formulário de aposta, em centavos, sem float. */
export function parseCreditsInput(text: string): CreditsInput {
  const match = INPUT.exec(text.trim());
  if (!match) return { ok: false, error: 'FORMAT' };
  const whole = match[1]!.replace(/^0+(?=\d)/, '');
  if (whole.length > MAX_WHOLE_DIGITS) return { ok: false, error: 'ABOVE_MAX' };
  const cents = Number(whole) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (cents < MIN_BET_CENTS) return { ok: false, error: 'BELOW_MIN' };
  if (cents > MAX_BET_CENTS) return { ok: false, error: 'ABOVE_MAX' };
  return { ok: true, cents };
}
