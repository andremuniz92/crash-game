import { inspect } from 'node:util';
import { multiplierAt as sharedMultiplierAt } from '@crash/shared';
import { Multiplier } from '../../shared/domain/multiplier.js';
import { InvalidRoundIdError } from './crash-point.js';
import {
  BettingWindowOpenError,
  CrashBeforeCrashAtError,
  InvalidRoundTransitionError,
  Round,
  RoundNotRunningError,
  SecretNotRevealedError,
} from './round.js';
import { ServerSeed } from './server-seed.js';

/* Vetores da Fase 2 (crash-point.spec.ts), calculados fora do projeto. */
const LOW = {
  seed: '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad',
  roundId: '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60',
  crashPoint: 126,
  timeToCrash: 3_852, // ceil(ln(1,26) / 0,00006)
};
const HIGH = {
  seed: 'dabbdcfa82ee4f2e349ef253955ca74a8cdc6abde9f63f87840a9659bf665921',
  roundId: '11111111-2222-4333-8444-000000000004',
  crashPoint: 1_585,
  timeToCrash: 46_053, // ceil(ln(15,85) / 0,00006)
};
const INSTANT = {
  seed: '4ea5e13de9e0aa99a3c8cb6c5ea849b44783b31f8a6056062203142341f07dfe',
  roundId: '00000000-0000-4000-8000-000000000034',
};

const BETTING_ENDS_AT = 1_700_000_010_000;
const STARTED_AT = BETTING_ENDS_AT;

function newRound(vector: { seed: string; roundId: string } = LOW): Round {
  return Round.create({
    id: vector.roundId,
    serverSeed: ServerSeed.fromHex(vector.seed),
    bettingEndsAt: BETTING_ENDS_AT,
  });
}

function runningRound(vector: { seed: string; roundId: string } = LOW): Round {
  const round = newRound(vector);
  round.start(STARTED_AT);
  return round;
}

function crashedRound(
  vector: { seed: string; roundId: string; timeToCrash: number } = LOW,
): Round {
  const round = runningRound(vector);
  round.crash(STARTED_AT + vector.timeToCrash);
  return round;
}

describe('Round', () => {
  describe('criação', () => {
    it('nasce em BETTING com id, bettingEndsAt e seedHash = seed.hash()', () => {
      const round = newRound();
      expect(round.status).toBe('BETTING');
      expect(round.id).toBe(LOW.roundId);
      expect(round.bettingEndsAt).toBe(BETTING_ENDS_AT);
      expect(round.seedHash.equals(ServerSeed.fromHex(LOW.seed).hash())).toBe(
        true,
      );
    });

    it('registra RoundCreated sem seed, crash point nem crashAt', () => {
      const [event, ...rest] = newRound().pullEvents();
      expect(rest).toHaveLength(0);
      expect(event).toMatchObject({
        type: 'RoundCreated',
        roundId: LOW.roundId,
        bettingEndsAt: BETTING_ENDS_AT,
      });
      expect(Object.keys(event!).sort()).toEqual(
        ['bettingEndsAt', 'roundId', 'seedHash', 'type'].sort(),
      );
      expect(JSON.stringify(event)).not.toContain(LOW.seed);
    });

    it('rejeita roundId fora do formato canônico', () => {
      expect(() =>
        newRound({ ...LOW, roundId: LOW.roundId.toUpperCase() }),
      ).toThrow(InvalidRoundIdError);
    });
  });

  describe('transições', () => {
    it('start(now) com now >= bettingEndsAt passa a RUNNING e registra RoundStarted sem crashAt', () => {
      const round = newRound();
      round.pullEvents();
      round.start(STARTED_AT);

      expect(round.status).toBe('RUNNING');
      expect(round.startedAt).toBe(STARTED_AT);
      const [event, ...rest] = round.pullEvents();
      expect(rest).toHaveLength(0);
      expect(event).toEqual({
        type: 'RoundStarted',
        roundId: LOW.roundId,
        startedAt: STARTED_AT,
      });
    });

    it('start antes de bettingEndsAt lança BettingWindowOpenError', () => {
      expect(() => newRound().start(BETTING_ENDS_AT - 1)).toThrow(
        BettingWindowOpenError,
      );
    });

    it('transições inválidas lançam InvalidRoundTransitionError', () => {
      const late = STARTED_AT + 1_000_000;
      expect(() => runningRound().start(late)).toThrow(
        InvalidRoundTransitionError,
      );
      expect(() => crashedRound().start(late)).toThrow(
        InvalidRoundTransitionError,
      );
      expect(() => newRound().crash(late)).toThrow(InvalidRoundTransitionError);
      expect(() => crashedRound().crash(late)).toThrow(
        InvalidRoundTransitionError,
      );
    });

    it('crash(now) com now >= crashAt passa a CRASHED e registra RoundCrashed com crash point e seed', () => {
      const round = runningRound();
      round.pullEvents();
      const crashedAt = STARTED_AT + LOW.timeToCrash;
      round.crash(crashedAt);

      expect(round.status).toBe('CRASHED');
      expect(round.crashedAt).toBe(crashedAt);
      const [event, ...rest] = round.pullEvents();
      expect(rest).toHaveLength(0);
      expect(event).toMatchObject({
        type: 'RoundCrashed',
        roundId: LOW.roundId,
        crashedAt,
      });
      if (event?.type !== 'RoundCrashed') throw new Error('evento inesperado');
      expect(event.crashPoint.x100).toBe(LOW.crashPoint);
      expect(event.serverSeed.toHex()).toBe(LOW.seed);
    });

    it('crash 1 ms antes de crashAt lança CrashBeforeCrashAtError; no próprio crashAt é aceito', () => {
      const round = runningRound();
      expect(() => round.crash(STARTED_AT + LOW.timeToCrash - 1)).toThrow(
        CrashBeforeCrashAtError,
      );
      expect(round.status).toBe('RUNNING');
      round.crash(STARTED_AT + LOW.timeToCrash);
      expect(round.status).toBe('CRASHED');
    });

    it('rodada de 1,00x pode crashar no próprio startedAt', () => {
      const round = runningRound(INSTANT);
      round.crash(STARTED_AT);
      expect(round.revealCrashPoint().x100).toBe(100);
    });

    it('recuperação: start e crash muito depois do prazo usam o now', () => {
      const round = newRound();
      const lateStart = BETTING_ENDS_AT + 60_000;
      round.start(lateStart);
      expect(round.startedAt).toBe(lateStart);

      const lateCrash = lateStart + LOW.timeToCrash + 3_600_000;
      round.crash(lateCrash);
      expect(round.crashedAt).toBe(lateCrash);
    });
  });

  describe('multiplierAt', () => {
    it('em RUNNING devolve o multiplierAt do shared sobre now − startedAt', () => {
      const round = runningRound(HIGH);
      for (const elapsed of [0, 1, 11_553, 30_000, HIGH.timeToCrash - 1]) {
        const multiplier = round.multiplierAt(STARTED_AT + elapsed);
        expect(multiplier).toBeInstanceOf(Multiplier);
        expect(multiplier.x100).toBe(sharedMultiplierAt(elapsed));
      }
    });

    it('depois do crashAt, ainda em RUNNING, devolve exatamente o crash point', () => {
      const round = runningRound(HIGH);
      for (const elapsed of [HIGH.timeToCrash, HIGH.timeToCrash + 5_000]) {
        expect(round.multiplierAt(STARTED_AT + elapsed).x100).toBe(
          HIGH.crashPoint,
        );
      }
    });

    it('fora de RUNNING lança RoundNotRunningError', () => {
      expect(() => newRound().multiplierAt(STARTED_AT)).toThrow(
        RoundNotRunningError,
      );
      expect(() => crashedRound().multiplierAt(STARTED_AT)).toThrow(
        RoundNotRunningError,
      );
    });
  });

  describe('regras para as apostas', () => {
    it('acceptsBetsAt só é verdadeiro em BETTING com now < bettingEndsAt', () => {
      const round = newRound();
      expect(round.acceptsBetsAt(BETTING_ENDS_AT - 1)).toBe(true);
      expect(round.acceptsBetsAt(BETTING_ENDS_AT)).toBe(false);
      round.start(STARTED_AT);
      expect(round.acceptsBetsAt(BETTING_ENDS_AT - 1)).toBe(false);
    });

    it('acceptsCashOutAt só é verdadeiro em RUNNING com now < crashAt', () => {
      const crashAt = STARTED_AT + LOW.timeToCrash;
      expect(newRound().acceptsCashOutAt(STARTED_AT)).toBe(false);

      const round = runningRound();
      expect(round.acceptsCashOutAt(crashAt - 1)).toBe(true);
      expect(round.acceptsCashOutAt(crashAt)).toBe(false);

      round.crash(crashAt);
      expect(round.acceptsCashOutAt(crashAt - 1)).toBe(false);
    });
  });

  describe('segredos e eventos', () => {
    it('revealServerSeed e revealCrashPoint só funcionam depois do crash', () => {
      for (const round of [newRound(), runningRound()]) {
        expect(() => round.revealServerSeed()).toThrow(SecretNotRevealedError);
        expect(() => round.revealCrashPoint()).toThrow(SecretNotRevealedError);
      }
      const round = crashedRound();
      expect(round.revealServerSeed().toHex()).toBe(LOW.seed);
      expect(round.revealCrashPoint().x100).toBe(LOW.crashPoint);
    });

    it('não vaza seed, crash point nem crashAt em JSON.stringify ou inspect antes do crash', () => {
      const crashAt = STARTED_AT + LOW.timeToCrash;
      const betting = newRound();
      const running = runningRound();

      for (const round of [betting, running]) {
        const outputs = [
          JSON.stringify(round),
          JSON.stringify({ round }),
          inspect(round, { depth: 10, showHidden: true }),
          inspect({ round }, { depth: 10, showHidden: true }),
        ];
        for (const output of outputs) {
          expect(output).not.toContain(LOW.seed);
          expect(output).not.toMatch(new RegExp(`\\b${LOW.crashPoint}\\b`));
          expect(output).not.toMatch(new RegExp(`\\b${crashAt}\\b`));
          expect(output).not.toMatch(new RegExp(`\\b${LOW.timeToCrash}\\b`));
        }
      }
    });

    it('pullEvents devolve os eventos em ordem e esvazia a lista', () => {
      const round = crashedRound();
      expect(round.pullEvents().map((event) => event.type)).toEqual([
        'RoundCreated',
        'RoundStarted',
        'RoundCrashed',
      ]);
      expect(round.pullEvents()).toEqual([]);
    });

    it('os erros carregam seus codes', () => {
      const late = STARTED_AT + 1_000_000;
      const cases: [() => unknown, string][] = [
        [() => runningRound().start(late), 'INVALID_ROUND_TRANSITION'],
        [() => newRound().start(BETTING_ENDS_AT - 1), 'BETTING_WINDOW_OPEN'],
        [() => runningRound().crash(STARTED_AT), 'CRASH_BEFORE_CRASH_AT'],
        [() => newRound().multiplierAt(STARTED_AT), 'ROUND_NOT_RUNNING'],
        [() => newRound().revealServerSeed(), 'SECRET_NOT_REVEALED'],
      ];
      for (const [act, code] of cases) {
        expect(act).toThrow(expect.objectContaining({ code }));
      }
    });
  });
});
