import { FakeClock } from './fake-clock.js';

describe('FakeClock', () => {
  it('começa no instante informado', () => {
    expect(new FakeClock(1_000).now()).toBe(1_000);
  });

  it('advance(ms) avança o tempo', () => {
    const clock = new FakeClock(1_000);
    clock.advance(250);
    clock.advance(1);
    expect(clock.now()).toBe(1_251);
  });
});
