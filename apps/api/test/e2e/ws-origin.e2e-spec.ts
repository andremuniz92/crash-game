import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { GameLoopStep } from '../../src/rounds/application/game-loop-step.js';
import { FakeClock } from '../../src/shared/testing/fake-clock.js';
import { LOW } from '../integration/betting.js';
import {
  createTestApp,
  QueuedGenerators,
  WEB_ORIGIN,
  wsUrl,
} from './test-app.js';
import { WsTestClient } from './ws-test-client.js';

const T0 = Date.parse('2026-10-28T12:00:00.000Z');

/**
 * Handshake cru do WebSocket: a API `WebSocket` esconde o status da recusa.
 * `upgraded` diz se o servidor trocou de protocolo (101).
 */
function handshake(
  url: string,
  origin?: string,
): Promise<{ status: number; upgraded: boolean }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url.replace(/^ws:/, 'http:'), {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        ...(origin === undefined ? {} : { Origin: origin }),
      },
    });
    request.on('upgrade', (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode ?? 0, upgraded: true });
    });
    request.on('response', (response) => {
      response.resume();
      resolve({ status: response.statusCode ?? 0, upgraded: false });
    });
    request.on('error', reject);
    request.end();
  });
}

describe('origem do WebSocket (E2E, D70)', () => {
  let app: INestApplication<App>;
  const clients: WsTestClient[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await app.close();
  });

  it('W1: a origem do front conecta e recebe round:betting', async () => {
    const generators = new QueuedGenerators();
    app = await createTestApp({ clock: new FakeClock(T0), generators });
    const client = await WsTestClient.connect(wsUrl(app), WEB_ORIGIN);
    clients.push(client);

    generators.enqueueRound(LOW);
    await app.get(GameLoopStep).execute();

    const { message } = await client.next('round:betting');
    expect(message.payload.roundId).toBe(LOW.id);
  });

  it('W2: outra origem recebe 403 no handshake, sem trocar de protocolo', async () => {
    app = await createTestApp();

    expect(await handshake(wsUrl(app), 'http://evil.test')).toEqual({
      status: 403,
      upgraded: false,
    });
  });

  it('W3: sem Origin, o handshake também recebe 403', async () => {
    app = await createTestApp();

    expect(await handshake(wsUrl(app))).toEqual({
      status: 403,
      upgraded: false,
    });
  });
});
