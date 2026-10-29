import { MAX_BET_CENTS, MIN_BET_CENTS } from '@crash/shared';
import { messageFor } from '../app/error-messages.js';
import {
  type CreditsInput,
  formatCredits,
  parseCreditsInput,
} from '../format/credits.js';

export interface BetInput {
  /** Centavos prontos para o POST /bets, ou null. */
  cents: number | null;
  /** O que dizer ao jogador; null com o campo vazio ou o valor válido. */
  message: string | null;
}

const MESSAGES: Record<Extract<CreditsInput, { ok: false }>['error'], string> =
  {
    FORMAT: 'Use até duas casas decimais, como 10,50.',
    BELOW_MIN: `A aposta mínima é ${formatCredits(MIN_BET_CENTS)}.`,
    ABOVE_MAX: `A aposta máxima é ${formatCredits(MAX_BET_CENTS)}.`,
  };

export function betLimitsHint(): string {
  return `Mínimo ${formatCredits(MIN_BET_CENTS)} · máximo ${formatCredits(MAX_BET_CENTS)}`;
}

/**
 * O valor digitado (D79). Com o saldo conhecido, recusa o que passar dele;
 * com o saldo ainda desconhecido, não bloqueia: o servidor decide (D3).
 */
export function readBetInput(text: string, balance: number | null): BetInput {
  if (text.trim() === '') return { cents: null, message: null };
  const parsed = parseCreditsInput(text);
  if (!parsed.ok) return { cents: null, message: MESSAGES[parsed.error] };
  if (balance !== null && parsed.cents > balance) {
    return { cents: null, message: messageFor('INSUFFICIENT_BALANCE') };
  }
  return { cents: parsed.cents, message: null };
}
