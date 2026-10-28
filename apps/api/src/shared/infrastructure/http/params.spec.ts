import { parseUuidParam } from './params.js';
import { InvalidRequestError } from './request-errors.js';

describe('parseUuidParam (D58)', () => {
  it('H1: aceita UUID canônico e normaliza para minúsculas', () => {
    const id = '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60';
    expect(parseUuidParam(id, 'id')).toBe(id);
    expect(parseUuidParam(id.toUpperCase(), 'id')).toBe(id);
  });

  it.each([
    ['texto qualquer', 'abc'],
    ['sem hífens', '3f2b8c1e6d4a4e9b9a7c1b2d3e4f5a60'],
    ['com espaço', ' 3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60'],
    ['caractere fora do hex', '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a6g'],
    ['vazio', ''],
  ])('H1: recusa %s, citando o parâmetro', (_case, value) => {
    const parse = () => parseUuidParam(value, 'id');
    expect(parse).toThrow(InvalidRequestError);
    expect(parse).toThrow(/id/);
  });
});
