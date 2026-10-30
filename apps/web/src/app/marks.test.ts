import { describe, expect, it, vi } from 'vitest';
import { createMarks } from './marks.js';

describe('marcas de desempenho (D94, D97)', () => {
  it('MK1: cada nome é marcado uma vez só', () => {
    const mark = vi.fn();
    const marks = createMarks(mark);

    marks.once('app:first-render');
    marks.once('app:first-render');
    marks.once('app:first-render');
    marks.once('scene:first-frame');

    expect(mark.mock.calls).toEqual([
      ['app:first-render'],
      ['scene:first-frame'],
    ]);
  });
});
