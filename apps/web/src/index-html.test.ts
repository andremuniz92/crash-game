// @vitest-environment jsdom
// Lê o index.html com o DOMParser do jsdom (sem @types/jsdom).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = join(import.meta.dirname, '..');
const page = () =>
  new DOMParser().parseFromString(
    readFileSync(join(WEB, 'index.html'), 'utf8'),
    'text/html',
  );

describe('index.html', () => {
  it('FV1: idioma pt-BR, título e viewport de celular', () => {
    const doc = page();
    expect(doc.documentElement.getAttribute('lang')).toBe('pt-BR');
    expect(doc.title.trim()).not.toBe('');

    const viewport = doc
      .querySelector('meta[name="viewport"]')
      ?.getAttribute('content');
    const settings = Object.fromEntries(
      (viewport ?? '').split(',').map((part) => part.trim().split('=')),
    );
    expect(settings.width).toBe('device-width');
    expect(Number(settings['initial-scale'])).toBe(1);
  });

  it('FV1: favicon próprio em SVG, que existe em public/', () => {
    const icon = page().querySelector('link[rel="icon"]');
    expect(icon?.getAttribute('href')).toBe('/favicon.svg');
    expect(icon?.getAttribute('type')).toBe('image/svg+xml');

    const file = join(WEB, 'public', 'favicon.svg');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8').trimStart()).toMatch(/^<svg/);
  });
});
