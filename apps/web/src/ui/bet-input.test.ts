import { describe, expect, it } from 'vitest';
import { betLimitsHint, readBetInput } from './bet-input.js';

describe('readBetInput (D79)', () => {
  it('BI1: a dica dos limites vem do @crash/shared', () => {
    expect(betLimitsHint()).toBe('Mínimo 1,00 · máximo 1.000,00');
  });

  it.each([
    ['10,505', 'Use até duas casas decimais, como 10,50.'],
    ['abc', 'Use até duas casas decimais, como 10,50.'],
    ['0,50', 'A aposta mínima é 1,00.'],
    ['1000,01', 'A aposta máxima é 1.000,00.'],
  ])('BI2: "%s" → "%s", sem valor', (text, message) => {
    expect(readBetInput(text, 100_000)).toEqual({ cents: null, message });
  });

  it.each(['', '   '])(
    'BI3: campo vazio (%j) não tem valor nem mensagem',
    (text) => {
      expect(readBetInput(text, 100_000)).toEqual({
        cents: null,
        message: null,
      });
    },
  );

  it.each(['10.50', '10,50'])('BI4: "%s" vale 1.050 centavos', (text) => {
    expect(readBetInput(text, 100_000)).toEqual({
      cents: 1_050,
      message: null,
    });
  });

  it('BI5: acima do saldo conhecido, "Saldo insuficiente."; no limite, aceita', () => {
    expect(readBetInput('10,01', 1_000)).toEqual({
      cents: null,
      message: 'Saldo insuficiente.',
    });
    expect(readBetInput('10', 1_000)).toEqual({ cents: 1_000, message: null });
  });

  it('BI5: com o saldo desconhecido (null), o saldo não bloqueia e o servidor decide', () => {
    expect(readBetInput('500', null)).toEqual({ cents: 50_000, message: null });
  });
});
