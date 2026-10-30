/** Limites da resolução do renderer (D93): backing de no máximo 2560×1440. */
const MIN_RESOLUTION = 0.25;
const MAX_RESOLUTION = 2;
const MAX_PIXEL_RATIO = 2;

/**
 * Resolução do renderer pela escala do palco (D93): o canvas fica em
 * 1280×720 CSS e é escalado por transform, então basta desenhar os pixels
 * físicos que ele ocupa. Escala 0 (contêiner oculto) dá null: não
 * redimensionar.
 */
export function renderResolution(fitScale: number, dpr: number): number | null {
  if (!(fitScale > 0)) return null;
  const resolution = fitScale * Math.min(dpr, MAX_PIXEL_RATIO);
  return Math.min(MAX_RESOLUTION, Math.max(MIN_RESOLUTION, resolution));
}

/**
 * Antialias decidido uma vez, no init (é opção de criação do contexto):
 * ligado só quando a tela não tem densidade para disfarçar o serrilhado.
 */
export function antialiasFor(dpr: number): boolean {
  return Math.min(dpr, MAX_PIXEL_RATIO) < MAX_PIXEL_RATIO;
}
