import { InvalidRequestError } from '../../shared/infrastructure/http/request-errors.js';
import { parseBetBody } from './bet-body.js';

describe('parseBetBody', () => {
  it('HB1: aceita amount inteiro e ignora campos extras', () => {
    expect(parseBetBody({ amount: 1_000 })).toEqual({ amount: 1_000 });
    expect(parseBetBody({ amount: -100, extra: 'x' })).toEqual({
      amount: -100,
    });
  });

  it.each([
    ['corpo ausente', undefined],
    ['corpo nulo', null],
    ['sem amount', {}],
    ['amount string', { amount: '1000' }],
    ['amount fracionado', { amount: 10.5 }],
    ['amount nulo', { amount: null }],
    ['amount acima do inteiro seguro', { amount: Number.MAX_SAFE_INTEGER + 1 }],
  ])('HB1: recusa %s com VALIDATION_ERROR', (_case, body) => {
    const parse = () => parseBetBody(body);
    expect(parse).toThrow(InvalidRequestError);
    expect(parse).toThrow(/amount/);
  });
});
