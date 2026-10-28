/** Relógio em ms. Lido uma vez por operação, na aplicação (D29). */
export interface Clock {
  now(): number;
}
