import { InvalidDatabaseConfigError } from '../database/database-config.js';
import { InvalidAppConfigError, readAppConfig } from './app-config.js';

const DATABASE_URL = 'postgres://crash:crash@postgres:5432/crash_game';

const VALID = {
  DATABASE_URL,
  PORT: '4000',
  BETTING_MS: '5000',
  TICK_MS: '50',
  PAUSE_MS: '2000',
  WS_HEARTBEAT_MS: '15000',
};

const NUMERIC = [
  'PORT',
  'BETTING_MS',
  'TICK_MS',
  'PAUSE_MS',
  'WS_HEARTBEAT_MS',
] as const;

describe('readAppConfig (D64)', () => {
  it('C1: com todas as variáveis válidas, devolve a configuração tipada', () => {
    expect(readAppConfig(VALID)).toEqual({
      port: 4000,
      database: { clientUrl: DATABASE_URL },
      bettingMs: 5000,
      tickMs: 50,
      pauseMs: 2000,
      wsHeartbeatMs: 15000,
    });
  });

  it('C2: sem as variáveis numéricas (ou vazias), usa os padrões', () => {
    const expected = {
      port: 3000,
      database: { clientUrl: DATABASE_URL },
      bettingMs: 10_000,
      tickMs: 100,
      pauseMs: 3_000,
      wsHeartbeatMs: 30_000,
    };
    expect(readAppConfig({ DATABASE_URL })).toEqual(expected);
    expect(
      readAppConfig({
        DATABASE_URL,
        ...Object.fromEntries(NUMERIC.map((name) => [name, ' '])),
      }),
    ).toEqual(expected);
  });

  describe.each(NUMERIC)('C3: %s', (name) => {
    it.each(['abc', '1.5', '1e3', '0', '-10', '10ms'])(
      'recusa "%s" e nomeia a variável',
      (value) => {
        const read = () => readAppConfig({ ...VALID, [name]: value });
        expect(read).toThrow(InvalidAppConfigError);
        expect(read).toThrow(new RegExp(name));
      },
    );
  });

  it('C3: recusa PORT acima de 65535', () => {
    expect(() => readAppConfig({ ...VALID, PORT: '65536' })).toThrow(
      InvalidAppConfigError,
    );
    expect(readAppConfig({ ...VALID, PORT: '65535' }).port).toBe(65535);
  });

  it('C4: sem DATABASE_URL, lança o mesmo erro da readDatabaseConfig', () => {
    const { DATABASE_URL: _omitted, ...withoutUrl } = VALID;
    expect(() => readAppConfig(withoutUrl)).toThrow(InvalidDatabaseConfigError);
    expect(() => readAppConfig(withoutUrl)).toThrow(/DATABASE_URL/);
  });
});
