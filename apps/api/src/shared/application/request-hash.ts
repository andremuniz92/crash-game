import { createHash } from 'node:crypto';

/**
 * SHA-256 hex do JSON canônico (chaves ordenadas em todos os níveis) da
 * entrada já validada (D60). A ordem das chaves no corpo não muda o hash.
 */
export function requestHash(input: object): string {
  return createHash('sha256')
    .update(canonicalJson(input), 'utf8')
    .digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
