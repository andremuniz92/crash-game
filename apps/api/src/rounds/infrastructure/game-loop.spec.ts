import { deferred } from '../../../test/integration/fixtures.js';
import { GameLoop } from './game-loop.js';

/** Passo falso: cada chamada devolve a próxima resposta da fila. */
function fakeStep(...results: Array<number | Error>) {
  const queue = [...results];
  return {
    execute: vi.fn(() => {
      const next = queue.shift() ?? 60_000;
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve({ waitMs: next });
    }),
  };
}

describe('GameLoop (driver, D61)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('L1: start() roda o passo e agenda o próximo para daqui a waitMs', async () => {
    const step = fakeStep(5_000, 2_000);
    const loop = new GameLoop(step, { error: vi.fn() });

    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(step.execute).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(step.execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(step.execute).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(step.execute).toHaveBeenCalledTimes(3);
    await loop.stop();
  });

  it('L1: start() repetido não cria um segundo loop', async () => {
    const step = fakeStep(1_000);
    const loop = new GameLoop(step, { error: vi.fn() });

    loop.start();
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(step.execute).toHaveBeenCalledTimes(1);
    await loop.stop();
  });

  it('L2: os passos não se sobrepõem; o próximo só é agendado quando o anterior termina', async () => {
    const slow = deferred<{ waitMs: number }>();
    const step = {
      execute: vi
        .fn<() => Promise<{ waitMs: number }>>()
        .mockReturnValueOnce(slow.promise)
        .mockResolvedValue({ waitMs: 60_000 }),
    };
    const loop = new GameLoop(step, { error: vi.fn() });

    loop.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(step.execute).toHaveBeenCalledTimes(1);

    slow.resolve({ waitMs: 100 });
    await vi.advanceTimersByTimeAsync(99);
    expect(step.execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(step.execute).toHaveBeenCalledTimes(2);
    await loop.stop();
  });

  it('L3: falha no passo vai para o log e há nova tentativa em 1 s', async () => {
    const failure = new Error('banco fora');
    const step = fakeStep(failure, 5_000);
    const logger = { error: vi.fn() };
    const loop = new GameLoop(step, logger);

    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('passo do game loop falhou'),
      failure.stack,
    );

    await vi.advanceTimersByTimeAsync(999);
    expect(step.execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(step.execute).toHaveBeenCalledTimes(2);
    await loop.stop();
  });

  it('L4: stop() cancela o agendamento pendente', async () => {
    const step = fakeStep(5_000);
    const loop = new GameLoop(step, { error: vi.fn() });

    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    await loop.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(step.execute).toHaveBeenCalledTimes(1);
  });

  it('L4: stop() durante um passo espera ele terminar e não agenda o próximo', async () => {
    const slow = deferred<{ waitMs: number }>();
    const step = { execute: vi.fn(() => slow.promise) };
    const loop = new GameLoop(step, { error: vi.fn() });

    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    let stopped = false;
    const stopping = loop.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);

    slow.resolve({ waitMs: 100 });
    await stopping;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(step.execute).toHaveBeenCalledTimes(1);
  });
});
