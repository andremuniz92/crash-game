import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../application/id-generator.js';

export class RandomIdGenerator implements IdGenerator {
  newId(): string {
    return randomUUID();
  }
}
