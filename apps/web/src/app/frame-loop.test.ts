import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeFrames } from '../testing/fake-browser.js';
import { createFrameLoop } from './frame-loop.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Relógio que avança 1 ms a cada leitura, para distinguir leituras. */
function countingClock() {
  let now = 0;
  return { serverNow: vi.fn(() => ++now) };
}

describe('createFrameLoop (D89)', () => {
  it('FL1: um rAF para todos os assinantes; cada um roda uma vez por frame', () => {
    const frames = fakeFrames();
    const loop = createFrameLoop({ clock: countingClock() });
    const listeners = [vi.fn(), vi.fn(), vi.fn()];
    for (const listener of listeners) loop.subscribe(listener);
    for (const listener of listeners) listener.mockClear();

    expect(frames.active()).toBe(1);
    frames.step();

    for (const listener of listeners) {
      expect(listener).toHaveBeenCalledTimes(1);
    }
  });

  it('FL2: o relógio é lido uma vez por frame, e todos recebem o mesmo valor', () => {
    const frames = fakeFrames();
    const clock = countingClock();
    const loop = createFrameLoop({ clock });
    const listeners = [vi.fn(), vi.fn(), vi.fn()];
    for (const listener of listeners) loop.subscribe(listener);
    for (const listener of listeners) listener.mockClear();
    clock.serverNow.mockClear();

    frames.step();

    expect(clock.serverNow).toHaveBeenCalledTimes(1);
    const [value] = clock.serverNow.mock.results.map((r) => r.value as number);
    for (const listener of listeners) {
      expect(listener).toHaveBeenCalledWith(value);
    }
  });

  it('FL3: sem assinantes o loop para; a primeira assinatura o religa', () => {
    const frames = fakeFrames();
    const loop = createFrameLoop({ clock: countingClock() });
    const a = vi.fn();
    const b = vi.fn();
    const offA = loop.subscribe(a);
    const offB = loop.subscribe(b);
    offA();
    offB();
    a.mockClear();
    b.mockClear();

    expect(frames.active()).toBe(0);
    frames.step();
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();

    const c = vi.fn();
    loop.subscribe(c);
    c.mockClear();
    expect(frames.active()).toBe(1);
    frames.step();
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('FL4: quem é cancelado no meio do frame não roda mais, nem quem se cancela', () => {
    const frames = fakeFrames();
    const loop = createFrameLoop({ clock: countingClock() });
    const b = vi.fn();
    let offB = () => {};
    let ranA = 0;
    const a = vi.fn(() => {
      // Na chamada imediata da assinatura, B ainda não existe.
      if (++ranA === 2) offB();
    });
    loop.subscribe(a);
    offB = loop.subscribe(b);
    b.mockClear();

    frames.step();
    frames.step();
    expect(a).toHaveBeenCalledTimes(3);
    expect(b).not.toHaveBeenCalled();

    let offSelf = () => {};
    const self = vi.fn(() => offSelf());
    offSelf = loop.subscribe(self);
    self.mockClear();
    frames.step();
    frames.step();
    expect(self).toHaveBeenCalledTimes(1);
  });

  it('FL5: um assinante que lança não para os outros nem o próximo frame', () => {
    const frames = fakeFrames();
    const onError = vi.fn();
    const loop = createFrameLoop({ clock: countingClock(), onError });
    const boom = new Error('falha no desenho');
    let calls = 0;
    loop.subscribe(() => {
      // A chamada imediata passa; os frames lançam.
      if (calls++ > 0) throw boom;
    });
    const second = vi.fn();
    loop.subscribe(second);
    second.mockClear();

    frames.step();

    expect(second).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(boom);
    expect(frames.active()).toBe(1);
  });

  it('FL6: a assinatura chama o assinante na hora, com o serverNow atual', () => {
    fakeFrames();
    const loop = createFrameLoop({ clock: { serverNow: () => 11_553 } });
    const listener = vi.fn();

    loop.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(11_553);
  });

  it('FL7: quem assina durante um frame roda na hora com o serverNow do frame e só volta no próximo', () => {
    const frames = fakeFrames();
    const clock = countingClock();
    const loop = createFrameLoop({ clock });
    const c = vi.fn();
    // Armado depois da chamada imediata de A: C entra no primeiro frame.
    let armed = false;
    loop.subscribe(() => {
      if (!armed) return;
      armed = false;
      loop.subscribe(c);
    });
    armed = true;
    clock.serverNow.mockClear();

    frames.step();

    expect(clock.serverNow).toHaveBeenCalledTimes(1);
    const frameNow = clock.serverNow.mock.results[0]?.value as number;
    expect(c).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledWith(frameNow);

    frames.step();
    expect(c).toHaveBeenCalledTimes(2);
  });

  it('FL8: erro na chamada imediata não propaga; a assinatura fica registrada', () => {
    const frames = fakeFrames();
    const onError = vi.fn();
    const loop = createFrameLoop({ clock: countingClock(), onError });
    const other = vi.fn();
    loop.subscribe(other);
    const boom = new Error('falha na primeira chamada');
    let calls = 0;
    const flaky = vi.fn(() => {
      if (calls++ === 0) throw boom;
    });
    other.mockClear();

    expect(() => loop.subscribe(flaky)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(boom);

    frames.step();
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('FL9: cancelar duas vezes é o mesmo que cancelar uma', () => {
    const frames = fakeFrames();
    const loop = createFrameLoop({ clock: countingClock() });
    const offA = loop.subscribe(vi.fn());
    const b = vi.fn();
    loop.subscribe(b);
    b.mockClear();

    offA();
    offA();

    expect(frames.active()).toBe(1);
    frames.step();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
