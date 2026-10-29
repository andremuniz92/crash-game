/** Bytes aleatórios no formato do `crypto.getRandomValues`. */
export type RandomBytes = (bytes: Uint8Array<ArrayBuffer>) => unknown;

/**
 * Idempotency-Key como UUID v4 (RFC 9562), montada a partir de 16 bytes do
 * `crypto.getRandomValues` (D96). O `randomUUID` só existe em contexto
 * seguro; o `getRandomValues` existe também em HTTP, então dá para apostar
 * abrindo o front pelo IP da rede local (D98).
 */
export function createIdempotencyKey(
  getRandomValues: RandomBytes = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = new Uint8Array(16);
  getRandomValues(bytes);
  // Versão 4 no nibble alto do byte 6; variante 10xx no byte 8.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
