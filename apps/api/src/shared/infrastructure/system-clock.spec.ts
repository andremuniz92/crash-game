import { SystemClock } from './system-clock.js';

describe('SystemClock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('G1: now() devolve o horário do sistema em ms', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-28T12:00:00.000Z') });
    const clock = new SystemClock();
    expect(clock.now()).toBe(Date.parse('2026-10-28T12:00:00.000Z'));
    vi.advanceTimersByTime(250);
    expect(clock.now()).toBe(Date.parse('2026-10-28T12:00:00.250Z'));
  });
});
