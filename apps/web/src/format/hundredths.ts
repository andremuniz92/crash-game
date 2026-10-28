/**
 * Inteiro ×100 (centavos ou multiplicador, D6 e D21) em texto pt-BR, sem
 * float: "1.234,56". O sinal vem do valor todo, porque a parte inteira de
 * −5 centavos é zero.
 */
export function formatHundredths(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const whole = String(Math.floor(abs / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    '.',
  );
  return `${sign}${whole},${String(abs % 100).padStart(2, '0')}`;
}
