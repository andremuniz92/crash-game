import {
  InvalidDatabaseConfigError,
  readDatabaseConfig,
  readTestDatabaseConfig,
} from './database-config.js';

const URL = 'postgres://crash:crash@postgres:5432/crash_game';
const TEST_URL = 'postgres://crash:crash@postgres:5432/crash_game_test';

describe('readDatabaseConfig', () => {
  it('devolve clientUrl a partir de DATABASE_URL', () => {
    expect(readDatabaseConfig({ DATABASE_URL: URL })).toEqual({
      clientUrl: URL,
    });
    const postgresql = URL.replace('postgres://', 'postgresql://');
    expect(readDatabaseConfig({ DATABASE_URL: postgresql }).clientUrl).toBe(
      postgresql,
    );
  });

  it('nomeia a variável quando DATABASE_URL falta ou está vazia', () => {
    for (const env of [{}, { DATABASE_URL: '' }, { DATABASE_URL: '   ' }]) {
      expect(() => readDatabaseConfig(env)).toThrow(InvalidDatabaseConfigError);
      expect(() => readDatabaseConfig(env)).toThrow(/DATABASE_URL/);
    }
  });

  it('rejeita URL malformada ou com esquema diferente de postgres e postgresql', () => {
    for (const invalid of [
      'not a url',
      'mysql://crash:crash@postgres:3306/crash_game',
      'http://postgres:5432/crash_game',
      'postgres://crash:crash@postgres:5432/',
    ]) {
      expect(() => readDatabaseConfig({ DATABASE_URL: invalid })).toThrow(
        InvalidDatabaseConfigError,
      );
    }
  });
});

describe('readTestDatabaseConfig', () => {
  it('lê TEST_DATABASE_URL com as mesmas regras', () => {
    expect(readTestDatabaseConfig({ TEST_DATABASE_URL: TEST_URL })).toEqual({
      clientUrl: TEST_URL,
    });
    expect(() => readTestDatabaseConfig({})).toThrow(/TEST_DATABASE_URL/);
    expect(() =>
      readTestDatabaseConfig({ TEST_DATABASE_URL: 'not a url' }),
    ).toThrow(InvalidDatabaseConfigError);
    // DATABASE_URL não serve de substituto para os testes.
    expect(() => readTestDatabaseConfig({ DATABASE_URL: TEST_URL })).toThrow(
      /TEST_DATABASE_URL/,
    );
  });

  it('recusa banco cujo nome não termina em _test e mostra o nome recebido', () => {
    expect(() => readTestDatabaseConfig({ TEST_DATABASE_URL: URL })).toThrow(
      InvalidDatabaseConfigError,
    );
    expect(() => readTestDatabaseConfig({ TEST_DATABASE_URL: URL })).toThrow(
      /crash_game/,
    );
    expect(() =>
      readTestDatabaseConfig({
        TEST_DATABASE_URL: `${URL.replace('crash_game', 'crash_game_test_old')}`,
      }),
    ).toThrow(InvalidDatabaseConfigError);
  });
});
