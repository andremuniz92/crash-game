import { createHash } from 'node:crypto';
import { multiplierAt } from '@crash/shared';
import type {
  CashOutResponse,
  GuestResponse,
  PlaceBetResponse,
  VerifyResponse,
} from '@crash/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { GameLoopStep } from '../../src/rounds/application/game-loop-step.js';
import { FakeClock } from '../../src/shared/testing/fake-clock.js';
import { LOW } from '../integration/betting.js';
import {
  BETTING_MS,
  createTestApp,
  QueuedGenerators,
  wsUrl,
} from './test-app.js';
import { WsTestClient } from './ws-test-client.js';

const T0 = Date.parse('2026-10-28T12:00:00.000Z');
const STARTED_AT = T0 + BETTING_MS;
const CRASH_AT = STARTED_AT + LOW.timeToCrash;
const key = (n: number) =>
  `c8c8c8c8-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Todos os números de um JSON, em qualquer profundidade. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(numbersIn);
}

describe('WebSocket (E2E, seção 8.2)', () => {
  let app: INestApplication<App>;
  let clock: FakeClock;
  let generators: QueuedGenerators;
  let step: GameLoopStep;
  const clients: WsTestClient[] = [];

  async function setup(tickMs?: number): Promise<void> {
    clock = new FakeClock(T0);
    generators = new QueuedGenerators();
    app = await createTestApp({ clock, generators, tickMs });
    step = app.get(GameLoopStep);
  }

  async function connect(): Promise<WsTestClient> {
    const client = await WsTestClient.connect(wsUrl(app));
    clients.push(client);
    return client;
  }

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function openRound(): Promise<void> {
    generators.enqueueRound(LOW);
    await step.execute();
  }

  async function startRound(): Promise<void> {
    clock.advance(STARTED_AT - clock.now());
    await step.execute();
  }

  async function crashRound(): Promise<void> {
    clock.advance(CRASH_AT - clock.now());
    await step.execute();
  }

  it('X22: round:betting e round:started chegam sem crashPoint, crashAt nem a seed', async () => {
    await setup();
    const client = await connect();

    await openRound();
    const betting = await client.next('round:betting');
    expect(betting.message).toEqual({
      type: 'round:betting',
      payload: {
        roundId: LOW.id,
        seedHash: createHash('sha256').update(LOW.seed).digest('hex'),
        bettingEndsAt: STARTED_AT,
      },
      serverTime: T0,
    });

    await startRound();
    const started = await client.next('round:started');
    expect(started.message).toEqual({
      type: 'round:started',
      payload: { roundId: LOW.id, startedAt: STARTED_AT },
      serverTime: STARTED_AT,
    });

    for (const { message, text } of [betting, started]) {
      for (const field of ['crashPoint', 'crashAt', 'serverSeed']) {
        expect(text).not.toContain(`"${field}"`);
      }
      expect(text).not.toContain(LOW.seed);
      expect(text).not.toContain(String(CRASH_AT));
      expect(numbersIn(message)).not.toContain(LOW.crashPoint);
      expect(numbersIn(message)).not.toContain(CRASH_AT);
    }
  });

  it('X23: E2E da seção 12 ouvindo o WS: aposta, start, cash out e crash, na ordem', async () => {
    await setup();
    const client = await connect();
    const ana = (
      await http().post('/players/guest').send({ nickname: 'ana' }).expect(201)
    ).body as GuestResponse;

    await openRound();
    const { betId } = (
      await http()
        .post('/bets')
        .set('Authorization', `Bearer ${ana.token}`)
        .set('Idempotency-Key', key(1))
        .send({ amount: 1_000 })
        .expect(201)
    ).body as PlaceBetResponse;
    await client.next('bet:placed');
    await startRound();
    clock.advance(2_000);
    const cashOut = () =>
      http()
        .post(`/bets/${betId}/cashout`)
        .set('Authorization', `Bearer ${ana.token}`)
        .set('Idempotency-Key', key(2))
        .send();
    const cashed = (await cashOut().expect(200)).body as CashOutResponse;
    await cashOut().expect(200);
    await crashRound();
    await client.next('round:crashed');

    const verify = (await http().get(`/rounds/${LOW.id}/verify`).expect(200))
      .body as VerifyResponse;
    expect(client.events).toEqual([
      {
        type: 'round:betting',
        payload: expect.objectContaining({ roundId: LOW.id }),
        serverTime: T0,
      },
      {
        type: 'bet:placed',
        payload: { roundId: LOW.id, nickname: 'ana', amount: 1_000 },
        serverTime: T0,
      },
      {
        type: 'round:started',
        payload: { roundId: LOW.id, startedAt: STARTED_AT },
        serverTime: STARTED_AT,
      },
      {
        type: 'bet:cashed_out',
        payload: {
          roundId: LOW.id,
          nickname: 'ana',
          multiplier: cashed.multiplier,
          payout: cashed.payout,
        },
        serverTime: STARTED_AT + 2_000,
      },
      {
        type: 'round:crashed',
        payload: {
          roundId: LOW.id,
          crashPoint: verify.crashPoint,
          serverSeed: verify.serverSeed,
        },
        serverTime: CRASH_AT,
      },
    ]);
    expect(client.raw.join('\n')).not.toContain(ana.playerId);
  });

  it('X24: dois clientes recebem as mesmas mensagens; quem fica continua recebendo depois que o outro sai', async () => {
    await setup();
    const leaving = await connect();
    const staying = await connect();

    await openRound();
    await leaving.next('round:betting');
    await staying.next('round:betting');
    expect(leaving.raw).toEqual(staying.raw);

    await leaving.close();
    await startRound();
    await staying.next('round:started');
    expect(leaving.events.map((m) => m.type)).toEqual(['round:betting']);
  });

  it('X25: round:tick chega a cada tickMs com o multiplicador do relógio e para depois do crash', async () => {
    await setup(20);
    const client = await connect();
    await openRound();
    await startRound();

    await client.waitFor(
      (messages) => messages.filter((m) => m.type === 'round:tick').length >= 2,
    );
    clock.advance(2_000);
    await client.waitFor((messages) =>
      messages.some(
        (m) =>
          m.type === 'round:tick' &&
          m.payload.multiplier === multiplierAt(2_000),
      ),
    );
    const ticks = client.messages.filter((m) => m.type === 'round:tick');
    expect(ticks[0]).toEqual({
      type: 'round:tick',
      payload: { roundId: LOW.id, multiplier: multiplierAt(0) },
      serverTime: STARTED_AT,
    });

    await crashRound();
    await client.next('round:crashed');
    const afterCrash = client.raw.length;
    await sleep(100);
    expect(client.raw.slice(afterCrash)).toEqual([]);
  });

  it('X26: mensagens do cliente são ignoradas e a conexão continua aberta', async () => {
    await setup();
    const client = await connect();

    client.send('olá');
    client.send(JSON.stringify({ event: 'bet', data: { amount: 1_000 } }));
    await sleep(50);
    expect(client.isOpen).toBe(true);
    expect(client.raw).toEqual([]);

    await openRound();
    await client.next('round:betting');
    expect(client.isOpen).toBe(true);
  });
});
