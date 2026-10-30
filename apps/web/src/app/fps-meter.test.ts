// @vitest-environment jsdom
import type { RoundDto } from '@crash/shared';
import { act } from '@testing-library/react';
import { createElement, Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultiplierText } from '../game/MultiplierText.js';
import { createGameStore } from '../store/game-store.js';
import { fakeFrames } from '../testing/fake-browser.js';
import { renderWithGame } from '../testing/render-game.js';
import '../testing/setup-dom.js';
import { trackSubscriptions } from '../testing/track-subscriptions.js';
import { startFpsMeter } from './fps-meter.js';
import { createFrameLoop, type FrameTimings } from './frame-loop.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const ID = '00000000-0000-4000-8000-0000000000a1';
const betting: RoundDto = {
  status: 'BETTING',
  id: ID,
  seedHash: 'h'.repeat(64),
  bettingEndsAt: 1_000,
};

/** Canal de tempo controlado pelo teste: `emit(frameTime)` é um frame. */
function fakeTimings() {
  const listeners = new Set<(frameTime: number) => void>();
  const timings: FrameTimings = {
    subscribeTiming(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    timings,
    emit: (frameTime: number) => {
      for (const listener of listeners) listener(frameTime);
    },
  };
}

const storeWith = (round: RoundDto | null) => {
  const store = createGameStore();
  store.load({ round, bets: [], myBet: null, serverTime: 0 });
  return store;
};
const panel = () => document.querySelector<HTMLElement>('[data-fps-meter]');
const windowLine = () =>
  document.querySelector<HTMLElement>('[data-fps-meter] [data-fps-window]');
const roundLine = () =>
  document.querySelector<HTMLElement>('[data-fps-meter] [data-fps-round]');

/** Os alvos de escrita que estão dentro do painel (ele incluído). */
const inside = (element: HTMLElement | null, contexts: unknown[]) =>
  contexts.filter(
    (context) =>
      context instanceof Node && element !== null && element.contains(context),
  );

const roundId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Mensagens de uma rodada, no formato do WS. */
const open = (id: string, at: number) => ({
  type: 'round:betting' as const,
  payload: { roundId: id, seedHash: 'h'.repeat(64), bettingEndsAt: at + 1_000 },
  serverTime: at,
});
const start = (id: string, at: number) => ({
  type: 'round:started' as const,
  payload: { roundId: id, startedAt: at },
  serverTime: at,
});
const crash = (id: string, at: number) => ({
  type: 'round:crashed' as const,
  payload: { roundId: id, crashPoint: 150, serverSeed: 's'.repeat(64) },
  serverTime: at,
});

describe('medidor de fps (D97)', () => {
  it('FM1: o painel escreve no máximo uma vez por segundo', () => {
    const { timings, emit } = fakeTimings();
    startFpsMeter({ frames: timings, store: storeWith(betting), document });
    const element = panel();
    expect(element).not.toBeNull();
    const text = vi.spyOn(Node.prototype, 'textContent', 'set');

    for (let i = 0; i < 300; i++) emit((i * 1_000) / 60);

    // O painel e os filhos (linha da janela e linha da rodada).
    const writes = inside(element, text.mock.contexts);
    expect(writes).toHaveLength(4);
  });

  it('FM2: com o medidor rodando, os frames não re-renderizam o React', () => {
    const frames = fakeFrames();
    const loop = createFrameLoop({ clock: { serverNow: () => 0 } });
    const commits = vi.fn();
    const store = storeWith(betting);
    renderWithGame(
      createElement(
        Profiler,
        { id: 'texto', onRender: commits },
        createElement(MultiplierText),
      ),
      { store, frames: loop },
    );
    startFpsMeter({ frames: loop, store, document });
    commits.mockClear();

    for (let i = 0; i < 300; i++) act(() => frames.step());

    expect(commits).not.toHaveBeenCalled();
  });

  it('FM3: painel fora da leitura de tela; stop remove o painel e as assinaturas', () => {
    const frames = fakeFrames();
    const loop = createFrameLoop({ clock: { serverNow: () => 0 } });
    const store = trackSubscriptions(storeWith(betting));
    const stop = startFpsMeter({ frames: loop, store: store.loop, document });
    expect(panel()?.getAttribute('aria-hidden')).toBe('true');
    expect(panel()?.parentElement).toBe(document.body);
    expect(frames.active()).toBe(1);
    expect(store.live()).toBe(1);

    stop();

    expect(panel()).toBeNull();
    expect(frames.active()).toBe(0);
    expect(store.live()).toBe(0);
  });

  it('FM4: uma linha no console só quando a rodada crasha', () => {
    const log = vi.fn();
    const store = storeWith(betting);
    const { timings } = fakeTimings();
    startFpsMeter({ frames: timings, store, document, log });

    store.receive({
      type: 'round:started',
      payload: { roundId: ID, startedAt: 1_000 },
      serverTime: 1_000,
    });
    expect(log).not.toHaveBeenCalled();

    store.receive({
      type: 'round:crashed',
      payload: { roundId: ID, crashPoint: 150, serverSeed: 's'.repeat(64) },
      serverTime: 8_000,
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatch(/^\[fps\] rodada /);

    // O mesmo crash de novo, por um snapshot: não é outra rodada medida.
    const crashed = store.getState().round;
    store.load({
      round: crashed ? { ...crashed } : null,
      bets: [],
      myBet: null,
      serverTime: 9_000,
    });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('FM6: a linha da rodada acumula média e lentos da rodada inteira; o 1% low é da janela', () => {
    const log = vi.fn();
    const store = storeWith(betting);
    const { timings, emit } = fakeTimings();
    startFpsMeter({ frames: timings, store, document, log });

    // Frames das apostas não contam para a rodada.
    let time = 0;
    for (; time <= 1_000; time += 20) emit(time);
    time = 1_000;
    store.receive({
      type: 'round:started',
      payload: { roundId: ID, startedAt: 1_000 },
      serverTime: 1_000,
    });
    // 5 s de frames lentos (100 ms) e 25 s a 50 fps (20 ms).
    for (let i = 0; i < 50; i++) emit((time += 100));
    for (let i = 0; i < 1_250; i++) emit((time += 20));
    store.receive({
      type: 'round:crashed',
      payload: { roundId: ID, crashPoint: 150, serverSeed: 's'.repeat(64) },
      serverTime: 31_000,
    });

    expect(log.mock.calls).toEqual([
      [
        '[fps] rodada 30,0 s: média 43,3 · lentos 50 · 1% low (últimos 10 s) 50',
      ],
    ]);
  });

  it('FM7: no crash, o painel mostra a mesma linha passada ao console', () => {
    const log = vi.fn();
    const store = storeWith(betting);
    const { timings, emit } = fakeTimings();
    startFpsMeter({ frames: timings, store, document, log });
    expect(roundLine()?.textContent).toBe('');

    store.receive(start(ID, 1_000));
    let time = 1_000;
    for (let i = 0; i < 120; i++) emit((time += 20));
    store.receive(crash(ID, time));

    expect(log).toHaveBeenCalledTimes(1);
    expect(roundLine()?.textContent).toBe(log.mock.calls[0]?.[0]);
    expect(windowLine()?.textContent).toMatch(/^[\d,]+ fps · 1% low /);
  });

  it('FM8: a linha fica durante a rodada seguinte e é trocada no crash dela', () => {
    const log = vi.fn();
    const store = storeWith(betting);
    const { timings, emit } = fakeTimings();
    startFpsMeter({ frames: timings, store, document, log });

    let time = 1_000;
    store.receive(start(ID, time));
    for (let i = 0; i < 100; i++) emit((time += 20));
    store.receive(crash(ID, time));
    const first = log.mock.calls[0]?.[0];

    const next = roundId(2);
    store.receive(open(next, (time += 1_000)));
    for (let i = 0; i < 100; i++) emit((time += 20));
    expect(roundLine()?.textContent).toBe(first);
    store.receive(start(next, (time += 1_000)));
    for (let i = 0; i < 300; i++) emit((time += 10));
    expect(roundLine()?.textContent).toBe(first);

    store.receive(crash(next, time));

    expect(log).toHaveBeenCalledTimes(2);
    const second = log.mock.calls[1]?.[0];
    expect(second).not.toBe(first);
    expect(roundLine()?.textContent).toBe(second);
    expect(
      document.querySelectorAll('[data-fps-meter] [data-fps-round]'),
    ).toHaveLength(1);
  });

  it('FM9: uma escrita por segundo na janela e uma por rodada na linha', () => {
    const store = storeWith(betting);
    const { timings, emit } = fakeTimings();
    startFpsMeter({ frames: timings, store, document, log: () => {} });
    const text = vi.spyOn(Node.prototype, 'textContent', 'set');

    let time = 0;
    const frames = (count: number) => {
      for (let i = 0; i < count; i++) emit((time += 1_000 / 60));
    };
    for (let n = 1; n <= 3; n++) {
      const id = n === 1 ? ID : roundId(n);
      if (n > 1) store.receive(open(id, time));
      store.receive({
        type: 'bet:placed',
        payload: {
          roundId: id,
          betId: roundId(100 + n),
          nickname: 'ana',
          amount: 100,
        },
        serverTime: time,
      });
      frames(60);
      store.receive(start(id, time));
      frames(120);
      store.receive(crash(id, time));
      frames(30);
    }

    const writes = inside(panel(), text.mock.contexts);
    const round = roundLine();
    const roundWrites = writes.filter((context) => context === round);
    expect(roundWrites).toHaveLength(3);
    expect(writes.length - roundWrites.length).toBeLessThanOrEqual(
      Math.ceil(time / 1_000),
    );
  });

  it('FM10: crash que chega por snapshot não escreve linha nem loga', () => {
    const log = vi.fn();
    const store = storeWith(betting);
    const { timings, emit } = fakeTimings();
    startFpsMeter({ frames: timings, store, document, log });
    const text = vi.spyOn(Node.prototype, 'textContent', 'set');

    // Reconexão: outra rodada, já crashada, sem RUNNING visto pelo medidor.
    store.load({
      round: {
        status: 'CRASHED',
        id: roundId(2),
        seedHash: 'h'.repeat(64),
        bettingEndsAt: 1_000,
        startedAt: 1_000,
        crashedAt: 5_000,
        crashPoint: 130,
        serverSeed: 's'.repeat(64),
      },
      bets: [],
      myBet: null,
      serverTime: 6_000,
    });
    expect(log).not.toHaveBeenCalled();
    expect(roundLine()?.textContent).toBe('');

    // Uma rodada medida, e o mesmo crash repetido por um snapshot.
    const id = roundId(3);
    let time = 7_000;
    store.receive(open(id, time));
    store.receive(start(id, (time += 1_000)));
    for (let i = 0; i < 60; i++) emit((time += 20));
    store.receive(crash(id, time));
    const line = roundLine()?.textContent;
    const crashed = store.getState().round;
    store.load({
      round: crashed ? { ...crashed } : null,
      bets: [],
      myBet: null,
      serverTime: time + 1_000,
    });

    expect(log).toHaveBeenCalledTimes(1);
    expect(roundLine()?.textContent).toBe(line);
    const round = roundLine();
    expect(
      text.mock.contexts.filter((context) => context === round),
    ).toHaveLength(1);
  });
});
