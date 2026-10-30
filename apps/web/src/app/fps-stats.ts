/**
 * Intervalo acima disso não é um frame: é aba oculta (o rAF para e não há
 * handler de visibilitychange, D93) ou depurador. Fica fora da média, dos
 * lentos e do 1% low.
 */
export const MAX_FRAME_INTERVAL_MS = 1_000;
/** Frame acima disso conta como lento (D97). */
export const SLOW_FRAME_MS = 50;

export interface FpsSnapshot {
  frames: number;
  averageFps: number;
  /** 1000 ÷ a média dos tempos do pior 1% dos frames da janela. */
  onePercentLowFps: number;
  slowFrames: number;
}

export interface FpsStats {
  /** Registra um frame pelo timestamp do rAF; devolve o intervalo aceito, ou null. */
  record(frameTime: number): number | null;
  snapshot(): FpsSnapshot;
}

const EMPTY: FpsSnapshot = {
  frames: 0,
  averageFps: 0,
  onePercentLowFps: 0,
  slowFrames: 0,
};

/**
 * Estatísticas dos últimos `windowMs` (D97) num buffer circular pré-alocado:
 * nada é alocado por frame. Com o buffer cheio, ficam as amostras mais
 * recentes.
 */
export function createFpsStats({
  windowMs = 10_000,
  capacity = 2_400,
}: { windowMs?: number; capacity?: number } = {}): FpsStats {
  const intervals = new Float64Array(capacity);
  const ends = new Float64Array(capacity);
  const sorted = new Float64Array(capacity);
  let oldest = 0;
  let size = 0;
  let last: number | null = null;

  return {
    record(frameTime) {
      const previous = last;
      last = frameTime;
      if (previous === null) return null;
      const interval = frameTime - previous;
      if (interval <= 0 || interval > MAX_FRAME_INTERVAL_MS) return null;
      if (size === capacity) {
        intervals[oldest] = interval;
        ends[oldest] = frameTime;
        oldest = (oldest + 1) % capacity;
      } else {
        const index = (oldest + size) % capacity;
        intervals[index] = interval;
        ends[index] = frameTime;
        size++;
      }
      return interval;
    },

    snapshot() {
      if (size === 0) return EMPTY;
      const latest = ends[(oldest + size - 1) % capacity] ?? 0;
      const cutoff = latest - windowMs;
      let frames = 0;
      let total = 0;
      let slowFrames = 0;
      for (let i = 0; i < size; i++) {
        const index = (oldest + i) % capacity;
        if ((ends[index] ?? 0) <= cutoff) continue;
        const interval = intervals[index] ?? 0;
        sorted[frames++] = interval;
        total += interval;
        if (interval > SLOW_FRAME_MS) slowFrames++;
      }
      if (frames === 0) return EMPTY;
      const window = sorted.subarray(0, frames).sort();
      const worst = Math.max(1, Math.ceil(frames / 100));
      let worstTotal = 0;
      for (let i = frames - worst; i < frames; i++)
        worstTotal += window[i] ?? 0;
      return {
        frames,
        averageFps: (1_000 * frames) / total,
        onePercentLowFps: 1_000 / (worstTotal / worst),
        slowFrames,
      };
    },
  };
}
