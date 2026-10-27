import { GROWTH_RATE_PER_MS } from '@crash/shared';

describe('monorepo wiring', () => {
  it('importa o pacote @crash/shared', () => {
    expect(GROWTH_RATE_PER_MS).toBe(0.00006);
  });
});
