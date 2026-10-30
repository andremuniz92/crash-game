import { checkHealth, HEALTH_TIMEOUT_MS, type HealthResult } from './health.js';

/** Texto que o driver poderia mandar: não pode sair na rota pública. */
const DRIVER_MESSAGE =
  'password authentication failed for user "postgres" at postgres.railway.internal:5432/railway';

describe('checkHealth (D105)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('HC2: banco fora responde 503 { code: UNHEALTHY } sem o texto do erro, que vai só para o log', async () => {
    const logError = vi.fn();
    const ping = { ping: () => Promise.reject(new Error(DRIVER_MESSAGE)) };

    const result = await checkHealth(ping, { error: logError });

    expect(result).toEqual({ status: 503, body: { code: 'UNHEALTHY' } });
    expect(JSON.stringify(result.body)).not.toContain('password');
    expect(JSON.stringify(result.body)).not.toContain('railway');
    expect(logError).toHaveBeenCalledTimes(1);
    const logged = (logError.mock.lastCall ?? []).map(String);
    expect(logged.some((arg) => arg.includes(DRIVER_MESSAGE))).toBe(true);
  });

  it('HC4: ping sem resposta vira 503 { code: UNHEALTHY } no timeout, nem antes nem nunca', async () => {
    vi.useFakeTimers();
    const logError = vi.fn();
    const ping = { ping: () => new Promise<void>(() => {}) };

    let result: HealthResult | undefined;
    void checkHealth(ping, { error: logError }).then((value) => {
      result = value;
    });

    await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS - 1);
    expect(result).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(result).toEqual({ status: 503, body: { code: 'UNHEALTHY' } });
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
