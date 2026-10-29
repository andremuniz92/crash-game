/**
 * Cores da cena, as mesmas dos tokens.css (D81, D87). Constantes em TS em vez
 * de variáveis CSS lidas no mount: o palette.test.ts falha se divergirem.
 */
export const PALETTE = {
  skyDeep: 0x0b1a33,
  sky: 0x13294b,
  skyLine: 0x22406e,
  amber: 0xf2a541,
  teal: 0x2ec4b6,
  text: 0xf4efe6,
  muted: 0x9fb0c8,
  danger: 0xef6461,
} as const;
