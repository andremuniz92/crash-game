import { readdirSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

/** Arquivos .ts de `root`, com caminhos relativos e "/" em qualquer sistema. */
export function sourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((path) => path.endsWith('.ts'))
    .map((path) => relative(root, join(root, path)).split(sep).join('/'));
}

/*
 * `[^'"`;]*?` atravessa quebras de linha, o que pega import em várias linhas,
 * mas para em aspas e em `;`, para não emendar uma string com o `from` do
 * comando seguinte.
 */
// Três formas, nesta ordem: `... from '<x>'`, `import '<x>'` e `import('<x>')`.
const IMPORT =
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])([^'"]+)\1|\bimport\s*(['"])([^'"]+)\3|\bimport\s*\(\s*(['"])([^'"]+)\5\s*\)/g;

/** Especificadores de import, reexport, import de efeito e import dinâmico, em ordem. */
export function importsOf(source: string): string[] {
  return [...source.matchAll(IMPORT)].map(
    (match) => (match[2] ?? match[4] ?? match[6])!,
  );
}

const CONTEXTS = new Set(['rounds', 'bets', 'wallet', 'players', 'shared']);
const PURE_LAYERS = new Set(['domain', 'application']);
const FRAMEWORKS = /^@(?:nestjs|mikro-orm)\//;

/** Violações da D55, como "<arquivo> importa <alvo>". */
export function layerViolations(sources: Map<string, string>): string[] {
  const violations: string[] = [];
  for (const [path, source] of sources) {
    const [context, layer] = path.split('/');
    if (!context || !CONTEXTS.has(context) || !PURE_LAYERS.has(layer ?? '')) {
      continue;
    }
    const isSpec = /[.-]spec\.ts$/.test(path);

    for (const specifier of importsOf(source)) {
      if (FRAMEWORKS.test(specifier)) {
        violations.push(`${path} importa ${specifier}`);
        continue;
      }
      if (isSpec || !specifier.startsWith('.')) continue;

      const target = posix.normalize(
        posix.join(posix.dirname(path), specifier),
      );
      const [targetContext] = target.split('/');
      if (targetContext !== context && targetContext !== 'shared') {
        violations.push(`${path} importa ${target}`);
      }
    }
  }
  return violations;
}
