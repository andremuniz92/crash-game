import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importsOf, layerViolations, sourceFiles } from './layers.js';

/*
 * D55: domain/ e application/ não importam NestJS nem MikroORM, e só
 * importam o próprio contexto e o shared/. Os specs ficam fora da regra entre
 * contextos: os testes do bets usam o Round real para checar a RoundView (D32).
 */

const SRC = join(import.meta.dirname, '../../src');

function readSources(): Map<string, string> {
  return new Map(
    sourceFiles(SRC).map((path) => [
      path,
      readFileSync(join(SRC, path), 'utf8'),
    ]),
  );
}

describe('camadas e contextos (D55)', () => {
  it('A1 e A2: nenhuma violação em src/', () => {
    const sources = readSources();
    // Sanidade: a varredura enxergou o domínio.
    expect(sources.has('rounds/domain/round.ts')).toBe(true);
    expect(layerViolations(sources)).toEqual([]);
  });

  describe('A3: o detector pega os casos difíceis', () => {
    it('extrai imports de tipo, com aspas duplas, em várias linhas, reexports, de efeito e dinâmicos', () => {
      const source = [
        `import type { Round } from '../../rounds/domain/round.js';`,
        `import { Injectable } from "@nestjs/common";`,
        `import {`,
        `  type EntityManager,`,
        `  LockMode,`,
        `} from '@mikro-orm/core';`,
        `export { Money } from '../domain/money.js';`,
        `import 'reflect-metadata';`,
        `const lazy = await import('../../wallet/domain/wallet.js');`,
        `const text = 'from não é import';`,
      ].join('\n');

      expect(importsOf(source)).toEqual([
        '../../rounds/domain/round.js',
        '@nestjs/common',
        '@mikro-orm/core',
        '../domain/money.js',
        'reflect-metadata',
        '../../wallet/domain/wallet.js',
      ]);
    });

    it('acusa framework na aplicação e import de outro contexto no domínio', () => {
      const sources = new Map([
        [
          'bets/application/place-bet.ts',
          `import { Injectable } from '@nestjs/common';\nimport type { Wallet } from '../../wallet/domain/wallet.js';`,
        ],
        [
          'rounds/domain/round.ts',
          `import type {\n  Bet,\n} from "../../bets/domain/bet.js";\nimport { Money } from '../../shared/domain/money.js';`,
        ],
        // Permitidos: infraestrutura, specs e o próprio contexto.
        [
          'bets/infrastructure/bets.module.ts',
          `import { Module } from '@nestjs/common';\nimport { Wallet } from '../../wallet/domain/wallet.js';`,
        ],
        [
          'bets/domain/bet.spec.ts',
          `import { Round } from '../../rounds/domain/round.js';`,
        ],
        [
          'rounds/application/game-loop-step.int-spec.ts',
          `import { Bet } from '../../bets/domain/bet.js';\nimport { testOrm } from '../../../test/integration/test-orm.js';`,
        ],
        [
          'wallet/application/open-wallet.ts',
          `import { Wallet } from '../domain/wallet.js';\nimport type { Clock } from '../../shared/domain/clock.js';\nimport { MIN_BET_CENTS } from '@crash/shared';`,
        ],
      ]);

      expect(layerViolations(sources)).toEqual([
        'bets/application/place-bet.ts importa @nestjs/common',
        'bets/application/place-bet.ts importa wallet/domain/wallet.js',
        'rounds/domain/round.ts importa bets/domain/bet.js',
      ]);
    });

    it('acusa o shared importando um contexto', () => {
      const sources = new Map([
        [
          'shared/domain/money.ts',
          `import { Round } from '../../rounds/domain/round.js';`,
        ],
      ]);
      expect(layerViolations(sources)).toEqual([
        'shared/domain/money.ts importa rounds/domain/round.js',
      ]);
    });
  });
});
