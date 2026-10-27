import { GROWTH_RATE_PER_MS, ONE_X } from './constants.js';

/**
 * Multiplicador ×100 (inteiro) após `elapsedMs` de rodada, arredondado para baixo.
 * Tempo negativo conta como zero. Ex.: 157 = 1,57x.
 */
export function multiplierAt(elapsedMs: number): number {
  return Math.floor(
    ONE_X * Math.exp(GROWTH_RATE_PER_MS * Math.max(elapsedMs, 0)),
  );
}

/**
 * Milissegundos inteiros, arredondados para cima, até o multiplicador atingir
 * `crashPointX100`. Garante `multiplierAt(timeToCrash(c)) >= c`.
 */
export function timeToCrash(crashPointX100: number): number {
  if (!Number.isInteger(crashPointX100) || crashPointX100 < ONE_X) {
    throw new RangeError(
      `crash point deve ser um inteiro ×100 maior ou igual a 100, recebido ${crashPointX100}`,
    );
  }
  return Math.ceil(Math.log(crashPointX100 / ONE_X) / GROWTH_RATE_PER_MS);
}
