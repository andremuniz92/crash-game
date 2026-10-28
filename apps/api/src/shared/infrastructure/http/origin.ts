/**
 * A única origem aceita pelo CORS e pelo WebSocket é a do front (D69, D70).
 * Igualdade exata: prefixo não basta, e origem ausente ou "null" é recusada.
 */
export function isAllowedOrigin(
  webOrigin: string,
  origin: string | undefined,
): boolean {
  return origin === webOrigin;
}
