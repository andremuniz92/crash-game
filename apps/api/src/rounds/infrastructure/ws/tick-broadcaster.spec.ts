import { multiplierAt } from '@crash/shared';
import { Multiplier } from '../../../shared/domain/multiplier.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { ServerSeed } from '../../domain/server-seed.js';
import { TickBroadcaster } from './tick-broadcaster.js';

const T0 = 1_700_000_000_000;
const TICK_MS = 100;

function setup() {
  const clock = new FakeClock(T0);
  const broadcast = vi.fn();
  // Os timers falsos avançam junto com o relógio falso.
  const advance = async (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 10) {
      clock.advance(10);
      await vi.advanceTimersByTimeAsync(10);
    }
  };
  const ticks = new TickBroadcaster({ broadcast }, clock, TICK_MS);
  return { clock, broadcast, advance, ticks };
}

const started = (roundId: string, startedAt: number) =>
  ({ type: 'RoundStarted', roundId, startedAt }) as const;
const crashed = (roundId: string) =>
  ({
    type: 'RoundCrashed',
    roundId,
    crashPoint: Multiplier.fromX100(200),
    serverSeed: ServerSeed.fromHex('a'.repeat(64)),
    crashedAt: T0,
  }) as const;

describe('TickBroadcaster (D11, D68)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('T1: depois do RoundStarted, um tick a cada tickMs com multiplierAt(now − startedAt); para no RoundCrashed', async () => {
    const { clock, broadcast, advance, ticks } = setup();

    ticks.handle(started('r1', T0));
    await advance(300);

    expect(broadcast).toHaveBeenCalledTimes(3);
    expect(broadcast.mock.calls.map(([message]) => message)).toEqual(
      [100, 200, 300].map((elapsed) => ({
        type: 'round:tick',
        payload: { roundId: 'r1', multiplier: multiplierAt(elapsed) },
        serverTime: T0 + elapsed,
      })),
    );

    ticks.handle(crashed('r1'));
    await advance(500);
    expect(broadcast).toHaveBeenCalledTimes(3);

    ticks.handle(started('r2', clock.now()));
    await advance(100);
    expect(broadcast).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ roundId: 'r2' }),
      }),
    );
    ticks.stop();
  });

  it('T1: RoundStarted repetido não cria um segundo intervalo', async () => {
    const { broadcast, advance, ticks } = setup();

    ticks.handle(started('r1', T0));
    ticks.handle(started('r1', T0));
    await advance(200);

    expect(broadcast).toHaveBeenCalledTimes(2);
    ticks.stop();
  });

  it('T2: sem rodada em andamento, não sai tick; outros eventos não ligam o intervalo', async () => {
    const { broadcast, advance, ticks } = setup();

    ticks.handle({ type: 'RoundCreated' });
    ticks.handle(crashed('r0'));
    await advance(1_000);

    expect(broadcast).not.toHaveBeenCalled();
  });
});
