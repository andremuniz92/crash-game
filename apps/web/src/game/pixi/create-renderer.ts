import { autoDetectRenderer } from 'pixi.js';
import type { CreateRenderer } from '../mount-scene.js';

/** O renderer de verdade: WebGL, com Canvas 2D como reserva (D92). */
export const createPixiRenderer: CreateRenderer = (options) =>
  autoDetectRenderer(options);
