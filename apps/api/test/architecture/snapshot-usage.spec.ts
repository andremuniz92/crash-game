import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceFiles } from './layers.js';

/*
 * D47 e D61: métodos que revelam os segredos da rodada (D30) só podem ser
 * chamados em lugares conhecidos. Este teste varre src/ e falha se a chamada
 * aparecer fora deles, dos specs e dos arquivos que definem o método.
 */

const SRC = join(import.meta.dirname, '../../src');
const SPEC = /[.-]spec\.ts$/;
const COMMENT = /^\s*(\/\/|\/\*|\*)/;

interface Rule {
  method: string;
  /** Arquivos que definem o método. Um agregado novo com o método entra aqui. */
  definitions: string[];
  /** Onde a chamada é permitida, além dos specs e das definições. */
  allowed: (path: string) => boolean;
  where: string;
}

const RULES: Rule[] = [
  {
    method: 'toSnapshot',
    definitions: [
      'rounds/domain/round.ts',
      'bets/domain/bet.ts',
      'wallet/domain/wallet.ts',
    ],
    allowed: (path) => path.split('/').includes('infrastructure'),
    where: 'pastas infrastructure/ (D47)',
  },
  {
    method: 'msUntilCrash',
    definitions: ['rounds/domain/round.ts'],
    allowed: (path) => path === 'rounds/application/game-loop-step.ts',
    where: 'o passo do game loop (D61)',
  },
];

function violations(rule: Rule): string[] {
  const call = new RegExp(`\\b${rule.method}\\s*\\(`);
  const found: string[] = [];
  for (const path of sourceFiles(SRC)) {
    if (
      SPEC.test(path) ||
      rule.definitions.includes(path) ||
      rule.allowed(path)
    ) {
      continue;
    }
    readFileSync(join(SRC, path), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (call.test(line) && !COMMENT.test(line)) {
          found.push(`src/${path}:${index + 1}: ${line.trim()}`);
        }
      });
  }
  return found;
}

describe.each(RULES)('arquitetura: $method', (rule) => {
  it(`só é chamado em ${rule.where}, nos specs e nas definições`, () => {
    expect(violations(rule)).toEqual([]);
  });

  it('as definições e os arquivos permitidos existem', () => {
    const files = sourceFiles(SRC);
    for (const definition of rule.definitions) {
      expect(files, definition).toContain(definition);
    }
    expect(files.some(rule.allowed), rule.where).toBe(true);
  });
});
