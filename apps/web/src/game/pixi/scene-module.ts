/**
 * Entrada do chunk da cena (D94): tudo o que importa o pixi.js com valor sai
 * daqui, pelo import() do main.tsx.
 */
// Antes de qualquer renderer: troca o código gerado por `new Function` por
// funções prontas, para a CSP sem 'unsafe-eval' (D107).
import 'pixi.js/unsafe-eval';

export { createPixiRenderer as createRenderer } from './create-renderer.js';
export { buildScene } from './pixi-scene.js';
