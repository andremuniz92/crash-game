import { useEffect, useRef } from 'react';
import { useGame } from '../app/game-context.js';
import styles from './GameCanvas.module.css';
import { mountScene } from './mount-scene.js';
import { useStageScale } from './stage-scale.js';

/**
 * Camada da cena no palco (D10): o Pixi é montado imperativamente no efeito e
 * desenha pelo frame loop, sem re-render do React. O texto do multiplicador
 * fica por cima, no DOM (D90). O pixi.js chega num chunk à parte, pelo
 * carregador do ambiente (D94).
 */
export function GameCanvas() {
  const { store, frames, scene, marks } = useGame();
  const stageScale = useStageScale();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    return mountScene(node, {
      store,
      frames,
      environment: scene,
      stageScale,
      marks,
    });
  }, [store, frames, scene, stageScale, marks]);

  return <div ref={host} className={styles.host} data-scene-host />;
}
