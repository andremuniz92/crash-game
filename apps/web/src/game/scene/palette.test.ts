import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTE } from './palette.js';

const TOKENS = readFileSync(
  join(import.meta.dirname, '../../ui/tokens.css'),
  'utf8',
);

/** As cores hex dos tokens: `--sky-deep: #0b1a33;` → { 'sky-deep': 0x0b1a33 }. */
function hexTokens(css: string): Record<string, number> {
  const tokens: Record<string, number> = {};
  for (const [, name, hex] of css.matchAll(
    /--([a-z-]+):\s*#([0-9a-f]{6})\s*;/gi,
  )) {
    if (name && hex) tokens[name] = Number.parseInt(hex, 16);
  }
  return tokens;
}

const kebab = (key: string) =>
  key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('paleta da cena (D87)', () => {
  it('PL1: cada cor da paleta é igual ao token de mesmo nome no tokens.css', () => {
    const tokens = hexTokens(TOKENS);
    const expected = Object.fromEntries(
      Object.keys(PALETTE).map((key) => [key, tokens[kebab(key)]]),
    );
    expect(PALETTE).toEqual(expected);
  });
});
