import { InvalidDatabaseConfigError } from '../database/database-config.js';
import { InvalidAppConfigError, readAppConfig } from './app-config.js';

const DATABASE_URL = 'postgres://crash:crash@postgres:5432/crash_game';
const WEB_ORIGIN = 'http://localhost:5173';

const VALID = {
  DATABASE_URL,
  WEB_ORIGIN,
  PORT: '4000',
  BETTING_MS: '5000',
  TICK_MS: '50',
  PAUSE_MS: '2000',
  WS_HEARTBEAT_MS: '15000',
};

/** A mensagem do erro lançado por `read`, para conferir o que ela não diz. */
function messageOf(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof InvalidAppConfigError) return error.message;
    throw error;
  }
  throw new Error('esperava InvalidAppConfigError, mas nada foi lançado');
}

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
      webOrigin: WEB_ORIGIN,
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
      webOrigin: WEB_ORIGIN,
    };
    expect(readAppConfig({ DATABASE_URL, WEB_ORIGIN })).toEqual(expected);
    expect(
      readAppConfig({
        DATABASE_URL,
        WEB_ORIGIN,
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

describe('readAppConfig: WEB_ORIGIN (D69)', () => {
  it.each(['http://localhost:5173', 'https://crash.example.app'])(
    'C7: aceita a origem pura %s e a devolve igual',
    (origin) => {
      expect(readAppConfig({ ...VALID, WEB_ORIGIN: origin }).webOrigin).toBe(
        origin,
      );
    },
  );

  it.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['só com espaços', '   '],
  ])(
    'C8: %s, o boot falha dizendo que a variável é obrigatória',
    (_case, value) => {
      const read = () => readAppConfig({ ...VALID, WEB_ORIGIN: value });
      expect(read).toThrow(InvalidAppConfigError);
      expect(read).toThrow(/WEB_ORIGIN é obrigatória/);
    },
  );

  it.each([
    '*',
    'http://localhost:5173/',
    'http://x.com/app',
    'http://x.com?a=1',
    'ftp://x.com',
    'localhost:5173',
    'http://a.com,http://b.com',
    'http://user@x.com',
  ])('C9: recusa "%s", que não é uma origem pura', (value) => {
    const read = () => readAppConfig({ ...VALID, WEB_ORIGIN: value });
    expect(read).toThrow(InvalidAppConfigError);
    expect(read).toThrow(/WEB_ORIGIN deve ser uma origem/);
  });

  it.each(['HTTP://LOCALHOST:5173', 'http://localhost:5173/'])(
    'C10: recusa "%s" e mostra a forma esperada',
    (value) => {
      const read = () => readAppConfig({ ...VALID, WEB_ORIGIN: value });
      expect(read).toThrow(InvalidAppConfigError);
      expect(read).toThrow(/a forma esperada é "http:\/\/localhost:5173"/);
    },
  );

  it('C10: sem forma possível ("*"), a mensagem não sugere nada', () => {
    const message = messageOf(() =>
      readAppConfig({ ...VALID, WEB_ORIGIN: '*' }),
    );
    expect(message).toMatch(/WEB_ORIGIN deve ser uma origem/);
    expect(message).not.toMatch(/forma esperada/);
  });
});
