import { Logger, type LoggerService } from '@nestjs/common';
import type { GameLoopStepResult } from '../application/game-loop-step.js';

export interface Step {
  execute(): Promise<GameLoopStepResult>;
}

const RETRY_MS = 1_000;

/**
 * Agenda os passos do game loop um depois do outro (D61): o próximo só é
 * agendado quando o anterior termina, então dois passos nunca se sobrepõem.
 */
export class GameLoop {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly step: Step,
    private readonly logger: Pick<LoggerService, 'error'> = new Logger(
      'GameLoop',
    ),
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  /** Cancela o próximo passo e espera o que estiver rodando terminar. */
  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.inFlight;
  }

  private schedule(ms: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.inFlight = this.run();
    }, ms);
  }

  private async run(): Promise<void> {
    let waitMs: number;
    try {
      ({ waitMs } = await this.step.execute());
    } catch (error) {
      this.logger.error(
        'passo do game loop falhou; nova tentativa em 1 s',
        error instanceof Error ? error.stack : String(error),
      );
      waitMs = RETRY_MS;
    }
    this.inFlight = null;
    if (this.running) this.schedule(waitMs);
  }
}
