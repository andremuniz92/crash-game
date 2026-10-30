import { useEffect, useRef } from 'react';
import { useGame } from '../app/game-context.js';
import styles from './GameCanvas.module.css';
import { mountScene } from './mount-scene.js';
import {
  buildScene as buildPixiScene,
  type PixiScene,
} from './pixi/pixi-scene.js';

/**
 * Camada da cena no palco (D10): o Pixi é montado imperativamente no efeito e
 * desenha pelo frame loop, sem re-render do React. O texto do multiplicador
 * fica por cima, no DOM (D90).
 */
export function GameCanvas({
  buildScene = buildPixiScene,
}: {
  /** Nos testes, a árvore real envolvida por um espião. */
  buildScene?: () => PixiScene;
}) {
  const { store, frames, scene, marks } = useGame();
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    return mountScene(node, {
      store,
      frames,
      environment: scene,
      buildScene,
      marks,
    });
  }, [store, frames, scene, buildScene, marks]);

  return <div ref={host} className={styles.host} data-scene-host />;
}
