import { Container, Graphics } from 'pixi.js';
import type { FrameModel } from '../scene/frame-model.js';

/** Espessura do traço do rastro e do fio, em pixels do palco. */
export const TRAIL_WIDTH = 6;
export const LINE_WIDTH = 2;

/** Cor neutra da pipa: a cor de verdade vem do tint (FrameModel.kiteColor). */
const WHITE = 0xffffff;
/** Varetas escuras: o tint multiplica, então continuam escuras sobre a cor. */
const SPAR = 0x000000;

export interface PixiScene {
  stage: Container;
  /** Só atribui propriedades e redesenha os Graphics; nada é criado (D95). */
  draw(model: FrameModel): void;
  destroy(): void;
}

/**
 * Adaptador fino entre o FrameModel (puro) e o Pixi (D88): monta a árvore
 * uma vez, com rastro, fio e pipa nessa ordem de desenho, e a reaproveita em
 * todos os frames.
 */
export function buildScene(): PixiScene {
  const stage = new Container();
  const trail = new Graphics({ label: 'trail' });
  const line = new Graphics({ label: 'line' });
  const kite = drawKite(new Graphics({ label: 'kite' }));
  stage.addChild(trail, line, kite);

  return {
    stage,
    draw(model) {
      trail.clear();
      trail.visible = model.trail.visible;
      const { count, points } = model.trail;
      if (model.trail.visible && count > 0) {
        trail.moveTo(points[0] ?? 0, points[1] ?? 0);
        for (let i = 1; i < count; i++) {
          trail.lineTo(points[2 * i] ?? 0, points[2 * i + 1] ?? 0);
        }
        trail.stroke({
          width: TRAIL_WIDTH,
          color: model.trailColor,
          cap: 'round',
          join: 'round',
        });
      }

      line.clear();
      line.visible = model.line.visible;
      if (model.line.visible) {
        const { fromX, fromY, ctrlX, ctrlY, toX, toY } = model.line;
        line
          .moveTo(fromX, fromY)
          .quadraticCurveTo(ctrlX, ctrlY, toX, toY)
          .stroke({ width: LINE_WIDTH, color: model.lineColor, cap: 'round' });
      }

      kite.visible = model.kite.visible;
      kite.position.set(model.kite.x, model.kite.y);
      kite.rotation = model.kite.rotation;
      kite.alpha = model.kite.alpha;
      kite.tint = model.kiteColor;
    },
    destroy() {
      // Sem `context: true`, o Graphics destruído com opções deixa o próprio
      // GraphicsContext vivo.
      stage.destroy({ children: true, context: true });
    },
  };
}

/** Pipa procedural em coordenadas locais, centrada na origem (D87). */
function drawKite(kite: Graphics): Graphics {
  kite.poly([0, -32, 22, -6, 0, 34, -22, -6]).fill(WHITE);
  kite
    .moveTo(0, -32)
    .lineTo(0, 34)
    .moveTo(-22, -6)
    .lineTo(22, -6)
    .stroke({ width: 2, color: SPAR, alpha: 0.45 });
  kite
    .moveTo(0, 34)
    .lineTo(-8, 48)
    .lineTo(6, 62)
    .lineTo(-6, 76)
    .lineTo(4, 90)
    .stroke({ width: 2, color: WHITE, cap: 'round', join: 'round' });
  return kite;
}
