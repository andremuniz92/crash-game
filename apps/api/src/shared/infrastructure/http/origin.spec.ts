import { isAllowedOrigin } from './origin.js';

const WEB_ORIGIN = 'http://localhost:5173';

describe('isAllowedOrigin (D69, D70)', () => {
  it('O1: aceita só a origem configurada', () => {
    expect(isAllowedOrigin(WEB_ORIGIN, WEB_ORIGIN)).toBe(true);
    expect(isAllowedOrigin(WEB_ORIGIN, undefined)).toBe(false);
    // Iframe com sandbox e páginas file:// mandam a origem literal "null".
    expect(isAllowedOrigin(WEB_ORIGIN, 'null')).toBe(false);
    expect(isAllowedOrigin(WEB_ORIGIN, 'http://127.0.0.1:5173')).toBe(false);
  });

  it('O2: recusa origens que só começam como a configurada', () => {
    expect(isAllowedOrigin(WEB_ORIGIN, 'http://localhost:5173.evil.com')).toBe(
      false,
    );
    expect(isAllowedOrigin(WEB_ORIGIN, 'http://localhost:51730')).toBe(false);
  });
});
