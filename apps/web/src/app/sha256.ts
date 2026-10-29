/** SHA-256 em hex do texto em UTF-8, pelo Web Crypto (D23). */
export async function sha256Hex(
  text: string,
  subtle: SubtleCrypto,
): Promise<string> {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
