import { type ReactNode, useEffect, useRef, useState } from 'react';
import { fitScale, STAGE_HEIGHT, STAGE_WIDTH } from './fit-scale.js';
import styles from './GameStage.module.css';
import { createStageScale, StageScaleContext } from './stage-scale.js';

/**
 * Palco de resolução lógica fixa, 1280×720, escalado para caber no contêiner
 * mantendo a proporção (seção 11.2). A escala vai direto no style, sem
 * re-render: o resize do contêiner não passa pelo React. A mesma escala é
 * publicada para a cena, que acerta a resolução do renderer (D93).
 */
export function GameStage({ children }: { children?: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale] = useState(createStageScale);

  useEffect(() => {
    const outer = viewport.current;
    const inner = stage.current;
    if (!outer || !inner) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const value = fitScale(width, height);
      inner.style.transform = `scale(${value})`;
      scale.set(value);
    });
    observer.observe(outer);
    return () => observer.disconnect();
  }, [scale]);

  return (
    <div ref={viewport} className={styles.viewport}>
      <div
        ref={stage}
        data-stage
        className={styles.stage}
        style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
      >
        <StageScaleContext.Provider value={scale}>
          {children}
        </StageScaleContext.Provider>
      </div>
    </div>
  );
}
