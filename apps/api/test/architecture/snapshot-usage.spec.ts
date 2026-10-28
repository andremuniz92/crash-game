import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/*
 * D47: toSnapshot() expõe os segredos da rodada (D30) e só pode ser chamado
 * pela persistência. Este teste varre src/ e falha se a chamada aparecer
 * fora de pastas infrastructure/, dos specs e dos arquivos que definem o método.
 */

const SRC = join(import.meta.dirname, '../../src');

/** Arquivos de domínio que definem toSnapshot(). Um agregado novo com snapshot entra aqui. */
const DEFINITIONS = new Set([
  'rounds/domain/round.ts',
  'bets/domain/bet.ts',
  'wallet/domain/wallet.ts',
]);

const CALL = /\btoSnapshot\s*\(/;
const COMMENT = /^\s*(\/\/|\/\*|\*)/;

function isAllowed(path: string): boolean {
  return (
    path.endsWith('.spec.ts') ||
    path.split('/').includes('infrastructure') ||
    DEFINITIONS.has(path)
  );
}

/** Caminhos relativos a src/, com "/" em qualquer sistema operacional. */
function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts'))
    .map((path) => relative(SRC, join(SRC, path)).split(sep).join('/'));
}

function callsOutsideInfrastructure(): string[] {
  const violations: string[] = [];
  for (const path of sourceFiles()) {
    if (isAllowed(path)) continue;
    readFileSync(join(SRC, path), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (CALL.test(line) && !COMMENT.test(line)) {
          violations.push(`src/${path}:${index + 1}: ${line.trim()}`);
        }
      });
  }
  return violations;
}

describe('arquitetura: toSnapshot (D47)', () => {
  it('só é chamado em */infrastructure/, nos specs e nos arquivos que o definem', () => {
    expect(callsOutsideInfrastructure()).toEqual([]);
  });

  it('os arquivos de definição listados existem', () => {
    const files = new Set(sourceFiles());
    for (const definition of DEFINITIONS) {
      expect(files.has(definition), definition).toBe(true);
    }
  });
});
