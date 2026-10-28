import { NicknameDirectory } from './nickname-directory.js';

describe('NicknameDirectory (D62)', () => {
  it('W3: consulta o banco uma vez por jogador, inclusive com pedidos simultâneos', async () => {
    const lookup = vi.fn((playerId: string) =>
      Promise.resolve(`nick-${playerId}`),
    );
    const directory = new NicknameDirectory(lookup);

    const [a, b] = await Promise.all([
      directory.nicknameOf('p1'),
      directory.nicknameOf('p1'),
    ]);
    expect([a, b]).toEqual(['nick-p1', 'nick-p1']);
    expect(await directory.nicknameOf('p1')).toBe('nick-p1');
    expect(await directory.nicknameOf('p2')).toBe('nick-p2');
    expect(lookup.mock.calls).toEqual([['p1'], ['p2']]);
  });

  it('W3: uma consulta que falha não fica no cache', async () => {
    const lookup = vi
      .fn<(playerId: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('banco fora'))
      .mockResolvedValue('ana');
    const directory = new NicknameDirectory(lookup);

    await expect(directory.nicknameOf('p1')).rejects.toThrow('banco fora');
    expect(await directory.nicknameOf('p1')).toBe('ana');
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
