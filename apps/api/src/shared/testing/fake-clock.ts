import type { Clock } from '../domain/clock.js';

/** Relógio controlável para testes. */
export class FakeClock implements Clock {
  private current: number;

  constructor(start: number) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  advance(ms: number): void {
    this.current += ms;
  }
}
