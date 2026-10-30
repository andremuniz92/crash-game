import type { Container } from 'pixi.js';
import type { FrameLoop } from '../app/frame-loop.js';
import type { GameStore } from '../store/game-store.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from './fit-scale.js';
import type { Marks } from '../app/marks.js';
import type { PixiScene } from './pixi/pixi-scene.js';
import { createFrameModel, writeFrame } from './scene/frame-model.js';

/** O que o ciclo de vida usa do renderer do Pixi (D89: sem Application). */
export interface SceneRenderer {
  readonly canvas: HTMLCanvasElement;
  render(stage: Container): void;
  destroy(options?: { removeView?: boolean }): void;
}

export interface RendererOptions {
  preference: Array<'webgl' | 'canvas'>;
  width: number;
  height: number;
  backgroundAlpha: number;
  resolution: number;
  autoDensity: boolean;
  antialias: boolean;
}

export type CreateRenderer = (
  options: RendererOptions,
) => Promise<SceneRenderer>;

/** O pedaço do MediaQueryList que a cena usa. */
export interface MediaQueryLike {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

/** O que vem do navegador; nos testes, fakes (D82). */
export interface SceneEnvironment {
  createRenderer: CreateRenderer;
  matchMedia(query: string): MediaQueryLike;
  devicePixelRatio(): number;
}

export interface SceneDeps {
  store: Pick<GameStore, 'getState' | 'subscribe'>;
  frames: FrameLoop;
  environment: SceneEnvironment;
  buildScene: () => PixiScene;
  marks: Marks;
  warn?: (message: string, error: unknown) => void;
}

/** As opções da versão simples (o "antes" das medições, D97). */
function rendererOptions(devicePixelRatio: number): RendererOptions {
  return {
    preference: ['webgl', 'canvas'],
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    backgroundAlpha: 0,
    resolution: devicePixelRatio,
    autoDensity: true,
    antialias: true,
  };
}

/**
 * Monta a cena no `host` e devolve o dispose, síncrono (D91). O init do
 * renderer é assíncrono: se o dispose vier antes, o renderer é destruído
 * assim que resolver, e o canvas nunca entra no DOM. A rodada vem da
 * assinatura da store (D10), e cada frame do loop único (D89) escreve o
 * modelo puro, desenha e renderiza.
 */
export function mountScene(
  host: HTMLElement,
  {
    store,
    frames,
    environment,
    buildScene,
    marks,
    warn = (message, error) => console.warn(message, error),
  }: SceneDeps,
): () => void {
  let disposed = false;
  let teardown = () => {};

  let round = store.getState().round;
  const unsubscribeStore = store.subscribe((state) => {
    round = state.round;
  });
  const motion = environment.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motion.matches;
  const onMotion = () => {
    reducedMotion = motion.matches;
  };
  motion.addEventListener('change', onMotion);

  environment
    .createRenderer(rendererOptions(environment.devicePixelRatio()))
    .then((renderer) => {
      if (disposed) {
        renderer.destroy({ removeView: true });
        return;
      }
      teardown = start(renderer);
    })
    .catch((error: unknown) => {
      // Depois do dispose, é uma montagem descartada (StrictMode, ou desmonte
      // durante o carregamento): o usuário não perdeu nada, não há o que avisar.
      if (!disposed) {
        warn('[cena] sem renderer; o jogo segue sem a animação', error);
      }
    });

  function start(renderer: SceneRenderer): () => void {
    const scene = buildScene();
    const model = createFrameModel();
    const { canvas } = renderer;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.setAttribute('role', 'presentation');
    canvas.style.pointerEvents = 'none';

    // Sem contexto, não desenha; o Pixi restaura os recursos sozinho (D92).
    let lost = false;
    const onLost = () => {
      lost = true;
      canvas.style.visibility = 'hidden';
    };
    const onRestored = () => {
      lost = false;
      canvas.style.visibility = '';
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    host.appendChild(canvas);

    // A assinatura chama na hora (FL6): o primeiro quadro sai já no init.
    let rendered = false;
    const unsubscribeFrames = frames.subscribe((serverNow) => {
      if (lost) return;
      writeFrame(model, round, serverNow, { reducedMotion });
      scene.draw(model);
      renderer.render(scene.stage);
      if (!rendered) {
        rendered = true;
        marks.once('scene:first-frame');
      }
    });

    return () => {
      unsubscribeFrames();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      scene.destroy();
      renderer.destroy({ removeView: true });
    };
  }

  return () => {
    disposed = true;
    unsubscribeStore();
    motion.removeEventListener('change', onMotion);
    teardown();
  };
}
