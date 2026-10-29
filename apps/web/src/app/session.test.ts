import { describe, expect, it } from 'vitest';
import { blockedStorage, memoryStorage } from '../testing/fake-storage.js';
import { createSessionStorage, type Session, SESSION_KEY } from './session.js';

const ana: Session = {
  playerId: 'a0a0a0a0-0000-4000-8000-000000000001',
  nickname: 'ana',
  token: 'tok-ana',
};

describe('createSessionStorage (D77)', () => {
  it('SE1: save e load devolvem a mesma sessão, na chave crash.session', () => {
    const { storage, items } = memoryStorage();
    createSessionStorage(storage).save(ana);

    expect(SESSION_KEY).toBe('crash.session');
    expect(JSON.parse(items.get(SESSION_KEY) ?? 'null')).toEqual(ana);
    // Outra página (outro objeto) lê o que ficou no storage.
    expect(createSessionStorage(storage).load()).toEqual(ana);
  });

  it('SE2: JSON corrompido devolve null e remove a chave', () => {
    const { storage, items } = memoryStorage({ [SESSION_KEY]: '{oops' });

    expect(createSessionStorage(storage).load()).toBeNull();
    expect(items.has(SESSION_KEY)).toBe(false);
  });

  it.each([
    ['null', 'null'],
    ['lista', '[]'],
    ['token que não é string', JSON.stringify({ ...ana, token: 1 })],
    ['token vazio', JSON.stringify({ ...ana, token: '' })],
    [
      'sem nickname',
      JSON.stringify({ playerId: ana.playerId, token: ana.token }),
    ],
    ['nickname inválido', JSON.stringify({ ...ana, nickname: '<script>' })],
    ['sem playerId', JSON.stringify({ nickname: 'ana', token: ana.token })],
  ])('SE3: formato errado (%s) devolve null e remove a chave', (_case, raw) => {
    const { storage, items } = memoryStorage({ [SESSION_KEY]: raw });

    expect(createSessionStorage(storage).load()).toBeNull();
    expect(items.has(SESSION_KEY)).toBe(false);
  });

  it('SE4: com o storage bloqueado, nada lança e a sessão vale em memória nesta página', () => {
    const session = createSessionStorage(blockedStorage);

    expect(session.load()).toBeNull();
    expect(() => session.save(ana)).not.toThrow();
    expect(session.load()).toEqual(ana);
    expect(() => session.clear()).not.toThrow();
    expect(session.load()).toBeNull();
  });

  it('SE5: clear remove a chave', () => {
    const { storage, items } = memoryStorage();
    const session = createSessionStorage(storage);
    session.save(ana);

    session.clear();

    expect(items.has(SESSION_KEY)).toBe(false);
    expect(session.load()).toBeNull();
  });
});
