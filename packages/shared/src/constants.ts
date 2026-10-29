/** Taxa de crescimento do multiplicador, por milissegundo */
export const GROWTH_RATE_PER_MS = 0.00006;

/** 1,00x na escala ×100 usada em todo o projeto (D21). */
export const ONE_X = 100;

/**
 * Teto do multiplicador e do crash point, ×100: 1.000.000,00x (D24). Mantém
 * os valores dentro de inteiros seguros e da coluna `integer` do Postgres.
 */
export const MAX_MULTIPLIER_X100 = 100_000_000;

/** Limites de uma aposta, em centavos (seção 6.3, D36). */
export const MIN_BET_CENTS = 100;
export const MAX_BET_CENTS = 100_000;
