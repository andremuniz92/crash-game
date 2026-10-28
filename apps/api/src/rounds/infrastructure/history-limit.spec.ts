import { InvalidRequestError } from '../../shared/infrastructure/http/request-errors.js';
import { parseHistoryLimit } from './history-limit.js';

describe('parseHistoryLimit', () => {
  it('H2: sem valor usa 20; aceita de 1 a 100', () => {
    expect(parseHistoryLimit(undefined)).toBe(20);
    expect(parseHistoryLimit('1')).toBe(1);
    expect(parseHistoryLimit('100')).toBe(100);
  });

  it.each(['0', '101', '1.5', 'abc', '-1', ''])('H2: recusa %j', (value) => {
    const parse = () => parseHistoryLimit(value);
    expect(parse).toThrow(InvalidRequestError);
    expect(parse).toThrow(/limit/);
  });

  it('H2: recusa limit repetido na query (?limit=1&limit=2 vira array)', () => {
    expect(() => parseHistoryLimit(['1', '2'])).toThrow(InvalidRequestError);
  });
});
