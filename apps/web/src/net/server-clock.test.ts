import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerClock } from './server-clock.js';

/** Relógio monotônico falso, no lugar do `performance.now()`. */
function fakeNow(start = 1_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createServerClock (D74)', () => {
  it('R1: sem amostras, o offset é 0 e serverNow é o relógio local', () => {
    const local = fakeNow();
    const clock = createServerClock({ now: local.now });

    expect(clock.offset()).toBe(0);
    expect(clock.serverNow()).toBe(1_000);
  });

  it('R2: uma amostra define o offset como serverTime − recebidoEm', () => {
    const local = fakeNow();
    const clock = createServerClock({ now: local.now });

    clock.sample(51_000, 1_000);
    local.advance(20);

    expect(clock.offset()).toBe(50_000);
    expect(clock.serverNow()).toBe(1_020 + 50_000);
  });

  it('R3: uma amostra com mais latência (offset menor) não reduz a estimativa', () => {
    const local = fakeNow();
    const clock = createServerClock({ now: local.now });

    clock.sample(51_000, 1_000);
    clock.sample(50_980, 1_000);

    expect(clock.offset()).toBe(50_000);
  });

  it('R4: uma amostra com menos latência sobe a estimativa', () => {
    const local = fakeNow();
    const clock = createServerClock({ now: local.now });

    clock.sample(50_980, 1_000);
    clock.sample(51_000, 1_000);

    expect(clock.offset()).toBe(50_000);
  });

  it('R5: a amostra vale por 10 s; com 10.001 ms de idade, sai da janela', () => {
    const local = fakeNow();
    const clock = createServerClock({ now: local.now });

    clock.sample(51_000, 1_000); // offset 50.000, a melhor
    local.advance(5_000);
    clock.sample(55_990, 6_000); // offset 49.990, mais nova

    local.advance(5_000); // a melhor tem exatamente 10.000 ms
    expect(clock.offset()).toBe(50_000);

    local.advance(1); // 10.001 ms: sai
    expect(clock.offset()).toBe(49_990);
  });

  it('R6: com a janela vazia, mantém a última estimativa', () => {
    const local = fakeNow();
    const clock = createServerClock({ now: local.now });

    clock.sample(51_000, 1_000);
    expect(clock.offset()).toBe(50_000);
    local.advance(60_000);

    expect(clock.offset()).toBe(50_000);
  });

  it('R9: a estimativa vale mesmo se ninguém leu o offset antes de a amostra expirar', () => {
    const local = fakeNow();
    const clock = createServerClock({ now: local.now });

    clock.restart(51_000, 1_000);
    local.advance(60_000);

    expect(clock.offset()).toBe(50_000);
  });

  it('R7: restart descarta as amostras anteriores e recomeça pela do snapshot', () => {
    const local = fakeNow();
    const clock = createServerClock({ now: local.now });

    clock.sample(51_000, 1_000); // offset 50.000, ainda na janela
    local.advance(100);
    clock.restart(50_000, 1_100); // offset 48.900

    expect(clock.offset()).toBe(48_900);
  });

  it('R8: serverNow usa só o relógio injetado, nunca o Date.now()', () => {
    const local = fakeNow();
    const clock = createServerClock({ now: local.now });
    clock.sample(51_000, 1_000);
    vi.spyOn(Date, 'now').mockReturnValue(9_000_000_000_000);

    expect(clock.serverNow()).toBe(1_000 + 50_000);
  });
});
