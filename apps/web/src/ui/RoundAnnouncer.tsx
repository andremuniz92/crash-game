import { useGameState } from '../app/game-context.js';
import { formatMultiplier } from '../format/multiplier.js';

/**
 * Única região aria-live da tela: anuncia só as mudanças de estado da rodada,
 * nunca o multiplicador a cada frame. Assina só o status e o crash point,
 * então ticks e apostas não a re-renderizam.
 */
export function RoundAnnouncer() {
  const status = useGameState((state) => state.round?.status ?? null);
  const crashPoint = useGameState((state) =>
    state.round?.status === 'CRASHED' ? state.round.crashPoint : null,
  );

  let text = '';
  if (status === 'BETTING') text = 'Apostas abertas';
  if (status === 'RUNNING') text = 'A rodada começou';
  if (crashPoint !== null) text = `Crash em ${formatMultiplier(crashPoint)}`;

  return (
    <p className="visually-hidden" aria-live="polite">
      {text}
    </p>
  );
}
