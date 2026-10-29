import { createHash } from 'node:crypto';
import type { WsMessage } from '@crash/shared';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../net/api-client.js';
import { createGameStore } from '../store/game-store.js';
import { fakeFetch, json, offline } from '../testing/fake-fetch.js';
import { memoryStorage } from '../testing/fake-storage.js';
import { createActions } from './actions.js';
import { createSessionStorage } from './session.js';

const ROUND = '3f2b8c1e-6d4a-4e9b-9a7c-1b2d3e4f5a60';
const SEED = '2c0f65319e31a974c4adaf5b079290d328ff6014ffbe12033a075b0d05da19ad';
const OTHER_SEED = 'f'.repeat(64);
/** Implementação independente do Web Crypto que o código usa. */
const sha256 = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');
const tamper = (seed: string) =>
  `${seed.slice(0, -1)}${seed.endsWith('0') ? '1' : '0'}`;

/** `subtle: null` simula o contexto inseguro, em que o navegador não oferece o Web Crypto. */
function setup(
  responders: Parameters<typeof fakeFetch>,
  { subtle = crypto.subtle }: { subtle?: SubtleCrypto | null } = {},
) {
  const fake = fakeFetch(...responders);
  const store = createGameStore();
  const actions = createActions({
    api: createApiClient({ baseUrl: 'http://api', fetch: fake.fetch }),
    store,
    session: createSessionStorage(memoryStorage().storage),
    newKey: () => 'k',
    resync: vi.fn(),
    subtle: subtle ?? undefined,
  });
  return { actions, store, calls: fake.calls };
}

const seenLive = (seedHash: string): WsMessage => ({
  type: 'round:betting',
  payload: { roundId: ROUND, seedHash, bettingEndsAt: 1 },
  serverTime: 0,
});

describe('verifyRound (D7, D23, D80, D86)', () => {
  it('VF1: chama o verify e confere o SHA-256 da seed (hex em UTF-8)', async () => {
    const { actions, calls } = setup([
      json(200, { serverSeed: SEED, seedHash: sha256(SEED), crashPoint: 126 }),
    ]);

    const result = await actions.verifyRound(ROUND);

    expect(calls[0]?.url).toBe(`http://api/rounds/${ROUND}/verify`);
    expect(result).toEqual({
      status: 'done',
      serverSeed: SEED,
      seedHash: sha256(SEED),
      crashPoint: 126,
      seenLive: false,
      hashMatches: true,
    });
  });

  it('VF2: seed adulterada não confere', async () => {
    const { actions } = setup([
      json(200, {
        serverSeed: tamper(SEED),
        seedHash: sha256(SEED),
        crashPoint: 126,
      }),
    ]);
    expect(await actions.verifyRound(ROUND)).toMatchObject({
      hashMatches: false,
    });
  });

  it('VF3: com o hash publicado antes do crash, compara com ele, não com o da resposta', async () => {
    const { actions, store } = setup([
      // Resposta coerente consigo mesma, mas com outra seed: não é a que foi fixada.
      json(200, {
        serverSeed: OTHER_SEED,
        seedHash: sha256(OTHER_SEED),
        crashPoint: 126,
      }),
    ]);
    store.receive(seenLive(sha256(SEED)));

    expect(await actions.verifyRound(ROUND)).toMatchObject({
      seedHash: sha256(SEED),
      seenLive: true,
      hashMatches: false,
    });
  });

  it('VF4: rodada não vista ao vivo compara com o hash da resposta e diz isso', async () => {
    const { actions } = setup([
      json(200, { serverSeed: SEED, seedHash: sha256(SEED), crashPoint: 126 }),
    ]);
    expect(await actions.verifyRound(ROUND)).toMatchObject({
      seenLive: false,
      hashMatches: true,
    });
  });

  it('VF5: sem crypto.subtle, a conferência fica indisponível e os dados continuam', async () => {
    const { actions } = setup(
      [
        json(200, {
          serverSeed: SEED,
          seedHash: sha256(SEED),
          crashPoint: 126,
        }),
      ],
      { subtle: null },
    );
    expect(await actions.verifyRound(ROUND)).toEqual({
      status: 'done',
      serverSeed: SEED,
      seedHash: sha256(SEED),
      crashPoint: 126,
      seenLive: false,
      hashMatches: null,
    });
  });

  it.each([
    [409, 'SECRET_NOT_REVEALED', 'A seed só é revelada depois do crash.'],
    [404, 'ROUND_NOT_FOUND', 'Rodada não encontrada.'],
  ])(
    'VF7: %i %s mostra a mensagem da tabela',
    async (status, code, message) => {
      const { actions } = setup([json(status, { code, message: 'servidor' })]);
      expect(await actions.verifyRound(ROUND)).toEqual({
        status: 'failed',
        message,
      });
    },
  );

  it('VF7: falha de rede mostra a mensagem de conexão', async () => {
    const { actions } = setup([offline]);
    expect(await actions.verifyRound(ROUND)).toMatchObject({
      status: 'failed',
      message: expect.stringMatching(/conexão/),
    });
  });
});
