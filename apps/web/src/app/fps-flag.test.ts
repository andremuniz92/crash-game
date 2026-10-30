import { describe, expect, it, vi } from 'vitest';
import { fpsEnabled, maybeStartFpsMeter } from './fps-flag.js';

describe('medidor só com ?fps (D97)', () => {
  it('FM5: o loader só é chamado com o parâmetro fps', () => {
    for (const search of ['?fps', '?a=1&fps', '?fps=1']) {
      const load = vi.fn();
      maybeStartFpsMeter(search, load);
      expect({ search, calls: load.mock.calls.length }).toEqual({
        search,
        calls: 1,
      });
      expect(fpsEnabled(search)).toBe(true);
    }
    for (const search of ['', '?fpsx', '?a=1', '?x=fps']) {
      const load = vi.fn();
      maybeStartFpsMeter(search, load);
      expect({ search, calls: load.mock.calls.length }).toEqual({
        search,
        calls: 0,
      });
      expect(fpsEnabled(search)).toBe(false);
    }
  });
});
