import { createHash } from 'node:crypto';
import { requestHash } from './request-hash.js';

describe('requestHash (D60)', () => {
  it('RH1: ignora a ordem das chaves e muda com o valor', () => {
    const sha = createHash('sha256').update('{"a":1,"b":2}').digest('hex');

    expect(requestHash({ a: 1, b: 2 })).toBe(sha);
    expect(requestHash({ b: 2, a: 1 })).toBe(sha);
    expect(requestHash({ amount: 1_000 })).not.toBe(
      requestHash({ amount: 1_001 }),
    );
    expect(requestHash({})).toBe(
      createHash('sha256').update('{}').digest('hex'),
    );
  });
});
