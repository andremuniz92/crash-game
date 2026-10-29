import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from './api-client.js';
import { withRetry } from './retry.js';

const noWait = { sleep: () => Promise.resolve() };
const network = () => new NetworkError('network', 'falha de rede');
const status = (code: number) => new ApiError(code, 'X', `HTTP ${code}`);

/** Tentativa que falha com os erros dados, na ordem, e depois resolve 'ok'. */
function failing(...errors: Error[]) {
  const attempt = vi.fn(() => {
    const error = errors.shift();
    return error ? Promise.reject(error) : Promise.resolve('ok');
  });
  return attempt;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('withRetry (D78)', () => {
  it('RT1: falha de rede duas vezes e depois sucesso: 3 tentativas', async () => {
    const attempt = failing(network(), network());
    await expect(withRetry(attempt, noWait)).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('RT2: timeout também retenta', async () => {
    const attempt = failing(new NetworkError('timeout', 'sem resposta'));
    await expect(withRetry(attempt, noWait)).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it.each([502, 503, 504])('RT3: %i retenta', async (code) => {
    const attempt = failing(status(code));
    await expect(withRetry(attempt, noWait)).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('RT4: 500 não retenta, porque é bug (D58)', async () => {
    const attempt = failing(status(500));
    await expect(withRetry(attempt, noWait)).rejects.toMatchObject({
      status: 500,
    });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 404, 409, 422])('RT5: %i não retenta', async (code) => {
    const attempt = failing(status(code));
    await expect(withRetry(attempt, noWait)).rejects.toMatchObject({
      status: code,
    });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('RT5: erro que não é da API (bug) não retenta', async () => {
    const attempt = failing(new TypeError('bug'));
    await expect(withRetry(attempt, noWait)).rejects.toThrow(TypeError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('RT6: desiste depois de 2 retentativas e repassa o último erro', async () => {
    const attempt = failing(
      new NetworkError('network', 'primeira'),
      new NetworkError('network', 'segunda'),
      new NetworkError('timeout', 'terceira'),
    );
    await expect(withRetry(attempt, noWait)).rejects.toMatchObject({
      kind: 'timeout',
      message: 'terceira',
    });
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('RT7: espera 300 ms entre as tentativas', async () => {
    vi.useFakeTimers();
    const attempt = failing(network());
    const result = withRetry(attempt);

    await vi.advanceTimersByTimeAsync(299);
    expect(attempt).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(2);
    await expect(result).resolves.toBe('ok');
  });
});
