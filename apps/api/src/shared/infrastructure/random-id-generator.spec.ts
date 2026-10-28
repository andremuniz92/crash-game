import { RandomIdGenerator } from './random-id-generator.js';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('RandomIdGenerator', () => {
  it('G2: gera UUID v4 em minúsculas, diferente a cada chamada', () => {
    const generator = new RandomIdGenerator();
    const ids = Array.from({ length: 100 }, () => generator.newId());
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
