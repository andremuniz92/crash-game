import '../testing/silence-canvas.js'; // primeiro import: troca o getContext antes de o Pixi carregar
import type { RoundDto } from '@crash/shared';
import { act } from '@testing-library/react';
import type { GraphicsContext } from 'pixi.js';
import { Graphics } from 'pixi.js';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFrameLoop } from '../app/frame-loop.js';
import { createGameStore, type GameStore } from '../store/game-store.js';
import { fakeFrames, fakeResizeObserver } from '../testing/fake-browser.js';
import { renderWithGame } from '../testing/render-game.js';
import { trackSubscriptions } from '../testing/track-subscriptions.js';
import { GameCanvas } from './GameCanvas.js';
import { GameStage } from './GameStage.js';
import type {
  RendererOptions,
  SceneEnvironment,
  SceneModule,
  SceneRenderer,
} from './mount-scene.js';
import { MultiplierText } from './MultiplierText.js';
import { createStageScale, StageScaleContext } from './stage-scale.js';
import { buildScene, type PixiScene } from './pixi/pixi-scene.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ID = '00000000-0000-4000-8000-0000000000a1';
const NEXT = '00000000-0000-4000-8000-0000000000a2';
const STARTED_AT = 10_000;
const betting: RoundDto = {
  status: 'BETTING',
  id: ID,
  seedHash: 'h'.repeat(64),
  bettingEndsAt: STARTED_AT,
};
const running: RoundDto = {
  ...betting,
  status: 'RUNNING',
  startedAt: STARTED_AT,
};
const crashed: RoundDto = {
  ...running,
  status: 'CRASHED',
  crashPoint: 150,
  crashedAt: STARTED_AT + 7_000,
  serverSeed: 's'.repeat(64),
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Deixa as promessas já resolvidas (carregador, init) seguirem adiante. */
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** Renderer fake: canvas do jsdom, render e destroy espionados. */
function fakeRenderer() {
  const canvas = document.createElement('canvas');
  const listeners = { added: 0, removed: 0 };
  const add = canvas.addEventListener.bind(canvas);
  const remove = canvas.removeEventListener.bind(canvas);
  canvas.addEventListener = ((...args: Parameters<typeof add>) => {
    listeners.added++;
    add(...args);
  }) as typeof canvas.addEventListener;
  canvas.removeEventListener = ((...args: Parameters<typeof remove>) => {
    listeners.removed++;
    remove(...args);
  }) as typeof canvas.removeEventListener;
  const renderer = {
    canvas,
    render: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn((options?: { removeView?: boolean }) => {
      if (options?.removeView) canvas.remove();
    }),
  } satisfies SceneRenderer;
  return { renderer, listeners };
}

/** matchMedia fake: conta os listeners e dispara o change. */
function fakeMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  return {
    query: {
      get matches() {
        return matches;
      },
      addEventListener: (_: 'change', listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_: 'change', listener: () => void) => {
        listeners.delete(listener);
      },
    },
    listeners,
    change(value: boolean) {
      matches = value;
      for (const listener of listeners) listener();
    },
  };
}

interface Drawn {
  phase: string;
  rotation: number;
}

/**
 * Monta o palco com a cena. Com `loader: 'ready'`, o carregador da cena
 * (D94) já resolveu quando o setup devolve; com `'pending'`, o teste decide
 * quando ele resolve ou rejeita, por `load`.
 */
async function setup({
  round = running as RoundDto | null,
  serverNow = STARTED_AT + 5_000,
  reduced = false,
  strict = false,
  withText = false,
  clock,
  loader = 'ready',
  scale = 0.5,
  dpr = 3,
}: {
  round?: RoundDto | null;
  serverNow?: number;
  reduced?: boolean;
  strict?: boolean;
  withText?: boolean;
  clock?: { serverNow: () => number };
  loader?: 'ready' | 'pending';
  /** Escala do palco publicada antes da montagem. */
  scale?: number;
  dpr?: number;
} = {}) {
  const frames = fakeFrames();
  fakeResizeObserver();
  const base = createGameStore();
  base.load({ round, bets: [], myBet: null, serverTime: 0 });
  const store = trackSubscriptions(base);
  let now = serverNow;
  const time = clock ?? { serverNow: () => now };
  const loop = trackSubscriptions(createFrameLoop({ clock: time }));

  const inits: Array<ReturnType<typeof deferred<SceneRenderer>>> = [];
  const createRenderer = vi.fn((options: RendererOptions) => {
    void options;
    const init = deferred<SceneRenderer>();
    inits.push(init);
    return init.promise;
  });
  const media = fakeMedia(reduced);
  const load = deferred<SceneModule>();
  const loadScene = vi.fn(() => load.promise);
  const environment: SceneEnvironment = {
    loadScene,
    matchMedia: () => media.query,
    devicePixelRatio: () => pixelRatio,
  };
  let pixelRatio = dpr;
  const stageScale = createStageScale();
  stageScale.set(scale);
  const scales = trackSubscriptions(stageScale);

  const drawn: Drawn[] = [];
  const scenes: PixiScene[] = [];
  const draw = vi.fn();
  const build = vi.fn(() => {
    const scene = buildScene();
    scenes.push(scene);
    return {
      ...scene,
      draw(model: Parameters<PixiScene['draw']>[0]) {
        drawn.push({ phase: model.phase, rotation: model.kite.rotation });
        draw();
        scene.draw(model);
      },
    };
  });

  const module: SceneModule = { createRenderer, buildScene: build };
  if (loader === 'ready') load.resolve(module);

  const result = renderWithGame(
    <GameStage>
      <StageScaleContext.Provider value={scales.loop}>
        <GameCanvas />
        {withText && <MultiplierText />}
      </StageScaleContext.Provider>
    </GameStage>,
    {
      store: store.loop as GameStore,
      clock: time,
      frames: loop.loop,
      scene: environment,
      strict,
    },
  );
  await act(settle);

  /** Resolve o init de número `index` com um renderer fake novo. */
  async function resolveInit(index = 0) {
    const fake = fakeRenderer();
    await act(async () => {
      inits[index]?.resolve(fake.renderer);
      await settle();
    });
    return fake;
  }

  return {
    ...result,
    frames,
    store,
    loop,
    media,
    inits,
    createRenderer,
    load,
    loadScene,
    module,
    build,
    drawn,
    draw,
    scenes,
    resolveInit,
    setNow: (value: number) => {
      now = value;
    },
    setDpr: (value: number) => {
      pixelRatio = value;
    },
    /** Publica uma escala nova do palco, como o GameStage no resize. */
    publish: (value: number) => act(() => stageScale.set(value)),
    scaleLive: scales.live,
    canvases: () => document.querySelectorAll('[data-stage] canvas'),
  };
}

describe('GameCanvas (D89, D91, D92)', () => {
  it('GC1: depois do init, o canvas entra no palco fora da leitura de tela e sem capturar cliques', async () => {
    const t = await setup();
    const { renderer } = await t.resolveInit();

    expect(t.canvases()).toHaveLength(1);
    expect(renderer.canvas.getAttribute('aria-hidden')).toBe('true');
    expect(renderer.canvas.getAttribute('role')).toBe('presentation');
    expect(renderer.canvas.style.pointerEvents).toBe('none');
    expect(t.createRenderer).toHaveBeenCalledTimes(1);
    expect(t.createRenderer.mock.calls[0]?.[0]).toEqual({
      preference: ['webgl', 'canvas'],
      width: 1280,
      height: 720,
      backgroundAlpha: 0,
      resolution: 1,
      autoDensity: false,
      antialias: false,
    });
  });

  it('GC1b: o primeiro quadro sai assim que o init resolve, sem esperar frame', async () => {
    const t = await setup({ round: running });
    const { renderer } = await t.resolveInit();

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(t.drawn).toEqual([
      { phase: 'RUNNING', rotation: expect.any(Number) },
    ]);
  });

  it('GC2: dispose antes do init: nada entra no DOM e o renderer é destruído uma vez', async () => {
    const t = await setup();
    t.unmount();
    const { renderer } = await t.resolveInit();

    expect(t.canvases()).toHaveLength(0);
    expect(renderer.canvas.isConnected).toBe(false);
    expect(renderer.destroy.mock.calls).toEqual([[{ removeView: true }]]);
    expect(t.build).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
    expect(t.loop.live()).toBe(0);
  });

  it('GC2b: dispose e depois o init rejeita: sem canvas, sem aviso e sem rejeição solta', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await setup();
    t.unmount();
    await act(async () => {
      t.inits[0]?.reject(new Error('sem WebGL'));
      await Promise.resolve();
    });

    expect(t.canvases()).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
    expect(t.build).not.toHaveBeenCalled();
    expect(t.loop.live()).toBe(0);
  });

  it('GC3: no StrictMode, a montagem descartada não cria renderer, e uma cena fica viva', async () => {
    const t = await setup({ strict: true });
    expect(t.loadScene).toHaveBeenCalledTimes(2);
    expect(t.createRenderer).toHaveBeenCalledTimes(1);
    const { renderer } = await t.resolveInit(0);

    expect(t.canvases()).toHaveLength(1);
    expect(renderer.canvas.isConnected).toBe(true);
    expect(renderer.destroy).not.toHaveBeenCalled();
    expect(t.loop.live()).toBe(1);
  });

  it('GC4: o unmount desfaz todas as assinaturas e destrói renderer, palco e contexts', async () => {
    const t = await setup({ strict: true });
    const { renderer, listeners } = await t.resolveInit(0);
    expect(t.store.live()).toBe(1);
    expect(t.loop.live()).toBe(1);
    expect(t.media.listeners.size).toBe(1);
    expect(t.scaleLive()).toBe(1);
    expect(listeners.added).toBeGreaterThan(0);
    const scene = t.scenes.at(-1);
    if (!scene) throw new Error('cena não montada');
    const parts = [...scene.stage.children];
    const contexts: GraphicsContext[] = parts.map(
      (child) => (child as Graphics).context,
    );
    expect(parts.every((child) => child instanceof Graphics)).toBe(true);

    t.unmount();

    expect(t.store.live()).toBe(0);
    expect(t.loop.live()).toBe(0);
    expect(t.frames.active()).toBe(0);
    expect(t.media.listeners.size).toBe(0);
    expect(t.scaleLive()).toBe(0);
    expect(listeners.removed).toBe(listeners.added);
    expect(renderer.canvas.isConnected).toBe(false);
    expect(renderer.destroy.mock.calls).toEqual([[{ removeView: true }]]);
    expect(scene.stage.destroyed).toBe(true);
    expect(parts.map((child) => child.destroyed)).toEqual([true, true, true]);
    expect(contexts.map((context) => context.destroyed)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('GC5: por frame, uma leitura do relógio, o draw e depois o render', async () => {
    let now = STARTED_AT + 5_000;
    const clock = { serverNow: vi.fn(() => now) };
    const t = await setup({ clock, withText: true });
    const { renderer } = await t.resolveInit();
    clock.serverNow.mockClear();
    t.draw.mockClear();
    renderer.render.mockClear();

    now += 16;
    t.frames.step();

    expect(clock.serverNow).toHaveBeenCalledTimes(1);
    expect(t.draw).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(t.draw.mock.invocationCallOrder[0]).toBeLessThan(
      renderer.render.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('GC6: init rejeitado: sem canvas, aviso no console e o texto continua', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await setup({ withText: true });
    const error = new Error('sem WebGL nem Canvas');
    await act(async () => {
      t.inits[0]?.reject(error);
      await Promise.resolve();
    });

    expect(t.canvases()).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.any(String), error);
    const text = () => t.container.querySelector('p')?.textContent;
    const before = text();
    t.setNow(STARTED_AT + 11_553);
    t.frames.step();
    expect(text()).not.toBe(before);
    expect(text()).toBe('2,00x');
  });

  it('GC7: com o contexto perdido, não desenha e esconde o canvas até voltar', async () => {
    const t = await setup();
    const { renderer } = await t.resolveInit();
    renderer.render.mockClear();

    renderer.canvas.dispatchEvent(new Event('webglcontextlost'));
    t.frames.step();
    expect(renderer.render).not.toHaveBeenCalled();
    expect(renderer.canvas.style.visibility).toBe('hidden');

    renderer.canvas.dispatchEvent(new Event('webglcontextrestored'));
    t.frames.step();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.canvas.style.visibility).toBe('');
  });

  it('GC8: segue o prefers-reduced-motion, inclusive quando ele muda', async () => {
    const t = await setup({ round: betting, serverNow: 600, reduced: true });
    await t.resolveInit();
    expect(t.drawn.at(-1)).toEqual({ phase: 'BETTING', rotation: 0 });

    t.media.change(false);
    t.frames.step();
    expect(t.drawn.at(-1)?.phase).toBe('BETTING');
    expect(t.drawn.at(-1)?.rotation).not.toBe(0);
  });

  it('GC9: os frames não re-renderizam o React', async () => {
    const commits = vi.fn();
    const frames = fakeFrames();
    fakeResizeObserver();
    let now = STARTED_AT + 1_000;
    const store = createGameStore();
    store.load({ round: running, bets: [], myBet: null, serverTime: 0 });
    const init = deferred<SceneRenderer>();
    const { setServerNow } = renderWithGame(
      <Profiler id="cena" onRender={commits}>
        <GameCanvas />
      </Profiler>,
      {
        store,
        clock: { serverNow: () => now },
        scene: {
          loadScene: () =>
            Promise.resolve({ createRenderer: () => init.promise, buildScene }),
          matchMedia: () => fakeMedia(false).query,
          devicePixelRatio: () => 1,
        },
      },
    );
    void setServerNow;
    await act(async () => {
      init.resolve(fakeRenderer().renderer);
      await settle();
    });
    commits.mockClear();

    for (let i = 0; i < 10; i++) {
      now += 1_000;
      act(() => frames.step());
    }

    expect(commits).not.toHaveBeenCalled();
  });

  it('GC12: a rodada vem da assinatura: CRASHED → BETTING sem remontar a cena', async () => {
    const t = await setup({ round: crashed, serverNow: STARTED_AT + 60_000 });
    await t.resolveInit();
    t.frames.step();
    expect(t.drawn.at(-1)?.phase).toBe('CRASHED');

    act(() =>
      t.store.loop.receive({
        type: 'round:betting',
        payload: {
          roundId: NEXT,
          seedHash: 'n'.repeat(64),
          bettingEndsAt: STARTED_AT + 80_000,
        },
        serverTime: STARTED_AT + 60_000,
      }),
    );
    t.frames.step();

    expect(t.drawn.at(-1)?.phase).toBe('BETTING');
    expect(t.createRenderer).toHaveBeenCalledTimes(1);
    expect(t.build).toHaveBeenCalledTimes(1);
  });

  it('GC10: scene:first-frame é marcado uma vez, logo depois do primeiro render', async () => {
    const t = await setup({ strict: true });
    const { renderer } = await t.resolveInit(0);
    const once = vi.mocked(t.marks.once);
    const firstFrame = () =>
      once.mock.calls.filter(([name]) => name === 'scene:first-frame');
    expect(firstFrame()).toHaveLength(1);
    const markIndex = once.mock.calls.findIndex(
      ([name]) => name === 'scene:first-frame',
    );
    expect(once.mock.invocationCallOrder[markIndex]).toBeGreaterThan(
      renderer.render.mock.invocationCallOrder[0] ?? Infinity,
    );

    for (let i = 0; i < 10; i++) t.frames.step();

    expect(firstFrame()).toHaveLength(1);
  });
});

describe('GameCanvas com a cena por import dinâmico (D94)', () => {
  it('LZ2: carregador rejeitado (chunk da cena falhou): sem canvas, aviso no console e o texto continua', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await setup({ withText: true, loader: 'pending' });
    const error = new Error('Failed to fetch dynamically imported module');
    await act(async () => {
      t.load.reject(error);
      await settle();
    });

    expect(t.canvases()).toHaveLength(0);
    expect(t.createRenderer).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.any(String), error);
    const text = () => t.container.querySelector('p')?.textContent;
    t.setNow(STARTED_AT + 11_553);
    t.frames.step();
    expect(text()).toBe('2,00x');
  });

  it('LZ3: unmount com o carregador pendente: quando ele resolve, nada é criado', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await setup({ loader: 'pending' });
    expect(t.loadScene).toHaveBeenCalledTimes(1);
    t.unmount();
    await act(async () => {
      t.load.resolve(t.module);
      await settle();
    });

    expect(t.createRenderer).not.toHaveBeenCalled();
    expect(t.build).not.toHaveBeenCalled();
    expect(t.canvases()).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
    expect(t.loop.live()).toBe(0);
    expect(t.store.live()).toBe(0);
  });

  it('LZ3b: unmount com o carregador pendente e depois a rejeição: sem aviso e sem rejeição solta', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await setup({ loader: 'pending' });
    t.unmount();
    await act(async () => {
      t.load.reject(new Error('Failed to fetch dynamically imported module'));
      await settle();
    });

    expect(t.createRenderer).not.toHaveBeenCalled();
    expect(t.canvases()).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('GameCanvas com a resolução pela escala do palco (D93)', () => {
  it('GC13: uma escala nova redimensiona o renderer, sem recriá-lo; a mesma resolução não redimensiona', async () => {
    const t = await setup();
    const { renderer } = await t.resolveInit();

    t.publish(0.25);
    expect(renderer.resize.mock.calls).toEqual([[1280, 720, 0.5]]);
    t.publish(0.1); // 0,2 → piso 0,25
    t.publish(0.12); // 0,24 → piso 0,25: a mesma resolução
    expect(renderer.resize.mock.calls).toEqual([
      [1280, 720, 0.5],
      [1280, 720, 0.25],
    ]);

    expect(t.createRenderer).toHaveBeenCalledTimes(1);
    expect(t.canvases()).toHaveLength(1);
    expect(t.canvases()[0]).toBe(renderer.canvas);
  });

  it('GC14a: escala publicada antes do chunk da cena entra direto no init, sem resize depois', async () => {
    // Como no navegador: o efeito do GameCanvas (filho) roda antes do efeito
    // do GameStage, então a montagem vê escala 0, e a primeira medida do
    // palco chega antes do chunk.
    const t = await setup({ scale: 0, loader: 'pending' });
    t.publish(0.25);
    await act(async () => {
      t.load.resolve(t.module);
      await settle();
    });

    expect(t.createRenderer.mock.calls[0]?.[0].resolution).toBe(0.5);
    const { renderer } = await t.resolveInit();
    expect(renderer.resize).not.toHaveBeenCalled();
  });

  it('GC14b: escalas publicadas durante o init viram um resize só, com a última', async () => {
    const t = await setup();
    t.publish(0.25);
    t.publish(0.75);
    const { renderer } = await t.resolveInit();
    expect(renderer.resize.mock.calls).toEqual([[1280, 720, 1.5]]);

    // A última volta à resolução do init: nada a aplicar.
    const u = await setup();
    u.publish(0.25);
    u.publish(0.5);
    const other = await u.resolveInit();
    expect(other.renderer.resize).not.toHaveBeenCalled();
  });

  it('GC15: escala 0 (palco oculto) não redimensiona; o init sem escala usa resolução 1', async () => {
    const t = await setup({ scale: 0 });
    expect(t.createRenderer.mock.calls[0]?.[0].resolution).toBe(1);
    const { renderer } = await t.resolveInit();

    t.publish(0);
    expect(renderer.resize).not.toHaveBeenCalled();
    t.publish(0.25);
    expect(renderer.resize).toHaveBeenCalledTimes(1);
    expect(renderer.resize.mock.calls).toEqual([[1280, 720, 0.5]]);
  });

  it('GC16: o resize usa o DPR do momento (zoom); o antialias fica o do init', async () => {
    const t = await setup({ scale: 0.5, dpr: 1 });
    expect(t.createRenderer.mock.calls[0]?.[0]).toMatchObject({
      resolution: 0.5,
      antialias: true,
    });
    const { renderer } = await t.resolveInit();

    t.setDpr(2);
    t.publish(0.5);

    expect(renderer.resize.mock.calls).toEqual([[1280, 720, 1]]);
    expect(t.createRenderer).toHaveBeenCalledTimes(1);
  });
});
