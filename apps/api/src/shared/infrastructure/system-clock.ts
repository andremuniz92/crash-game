import type { Clock } from '../domain/clock.js';

/** O único lugar que lê o relógio do sistema (D29). */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}
