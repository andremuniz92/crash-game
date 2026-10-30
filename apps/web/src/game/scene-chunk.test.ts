import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
const PIXI_DIR = join(SRC, 'game', 'pixi');
const TESTING_DIR = join(SRC, 'testing');

/** Código de produção do front: sem os testes nem os ajudantes deles. */
function productionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return path === TESTING_DIR ? [] : productionFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

const inside = (dir: string, file: string) => file.startsWith(dir + sep);

/** Imports estáticos com valor: `import type` e `import()` ficam de fora. */
function staticImports(source: string): string[] {
  return [
    ...source.matchAll(
      /^\s*(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/gm,
    ),
  ].map((match) => match[1] ?? '');
}

describe('cena num chunk à parte (D94)', () => {
  it('LZ4: só game/pixi/ importa pixi.js com valor, e ninguém de fora importa game/pixi/ estaticamente', () => {
    const offenders = productionFiles(SRC)
      .filter((file) => !inside(PIXI_DIR, file))
      .flatMap((file) =>
        staticImports(readFileSync(file, 'utf8'))
          .filter(
            (target) =>
              /^pixi\.js(\/|$)/.test(target) || /(^|\/)pixi\//.test(target),
          )
          .map((target) => `${relative(SRC, file)} → ${target}`),
      );
    expect(offenders).toEqual([]);
  });
});
