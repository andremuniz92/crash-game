import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readWebConfig } from './config.js';

/*
 * D106 e D107: o netlify.toml repete fatos que vivem em outros arquivos
 * (versões do Node e do pnpm, ordem do build, origem da API). Sem este teste,
 * eles divergiriam em silêncio e o erro só apareceria no deploy.
 */

const ROOT = join(import.meta.dirname, '../../..');
const NETLIFY = 'netlify.toml';

/** Lê um arquivo do repositório; ausente vira falha com o nome dele. */
function readRepoFile(path: string): string {
  expect(existsSync(join(ROOT, path)), `${path} existe`).toBe(true);
  return readFileSync(join(ROOT, path), 'utf8');
}

interface Table {
  [key: string]: string | Table | Table[];
}

/**
 * Só o subconjunto de TOML que o netlify.toml usa: `[tabela]`, `[[lista]]` e
 * `chave = "texto"`. Qualquer outra linha lança erro, para o toml não sair
 * do que este teste entende sem que ninguém perceba.
 */
function parseToml(source: string): Table {
  const root: Table = {};
  let current = root;

  const descend = (path: string[]): Table => {
    let table = root;
    for (const part of path) {
      let next = table[part] ?? (table[part] = {});
      if (Array.isArray(next)) next = next[next.length - 1]!;
      if (typeof next === 'string') throw new Error(`${part} não é tabela`);
      table = next;
    }
    return table;
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    const list = /^\[\[([\w.]+)\]\]$/.exec(line);
    const table = /^\[([\w.]+)\]$/.exec(line);
    const pair = /^([\w-]+)\s*=\s*"([^"\\]*)"$/.exec(line);
    if (list) {
      const path = list[1]!.split('.');
      const parent = descend(path.slice(0, -1));
      const key = path[path.length - 1]!;
      const items = (parent[key] ??= []);
      if (!Array.isArray(items)) throw new Error(`${key} não é lista`);
      current = {};
      items.push(current);
    } else if (table) {
      current = descend(table[1]!.split('.'));
    } else if (pair) {
      current[pair[1]!] = pair[2]!;
    } else {
      throw new Error(`linha fora do subconjunto de TOML do teste: ${line}`);
    }
  }
  return root;
}

function text(table: Table | undefined, key: string): string | undefined {
  const value = table?.[key];
  return typeof value === 'string' ? value : undefined;
}

function sub(table: Table | undefined, key: string): Table | undefined {
  const value = table?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;
}

function netlify() {
  const config = parseToml(readRepoFile(NETLIFY));
  const build = sub(config, 'build');
  const headers = Array.isArray(config['headers']) ? config['headers'] : [];
  return { build, environment: sub(build, 'environment'), headers };
}

/** Diretivas da CSP servida em todas as rotas (`/*`), como listas de fontes. */
function cspDirectives(headers: Table[]): Map<string, string[]> {
  const all = headers.find((rule) => text(rule, 'for') === '/*');
  const csp = text(sub(all, 'values'), 'Content-Security-Policy');
  expect(csp, 'Content-Security-Policy em for = "/*"').toBeDefined();
  return new Map(
    csp!
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name!, sources]),
  );
}

describe('netlify.toml (D106, D107)', () => {
  it('NT1: NODE_VERSION e PNPM_VERSION são os do .nvmrc e do packageManager', () => {
    const { environment } = netlify();
    const pkg = JSON.parse(readRepoFile('package.json')) as {
      packageManager?: string;
    };

    expect(text(environment, 'NODE_VERSION')).toBe(
      readRepoFile('.nvmrc').trim(),
    );
    expect(`pnpm@${text(environment, 'PNPM_VERSION')}`).toBe(
      pkg.packageManager,
    );
  });

  it('NT2: VITE_API_URL é https, válida para o build, e o connect-src libera só ela e o WS', () => {
    const { environment, headers } = netlify();
    const raw = text(environment, 'VITE_API_URL');

    expect(raw?.startsWith('https://'), 'VITE_API_URL em https').toBe(true);
    const { apiUrl, wsUrl } = readWebConfig({ VITE_API_URL: raw, PROD: true });
    expect(cspDirectives(headers).get('connect-src')).toEqual([
      "'self'",
      apiUrl,
      new URL(wsUrl).origin,
    ]);
  });

  it('NT3: build na raiz, com o shared antes do web, publicando apps/web/dist', () => {
    const { build } = netlify();
    const command = text(build, 'command') ?? '';

    expect(text(build, 'base'), 'sem base: o build roda na raiz').toBe(
      undefined,
    );
    expect(text(build, 'publish')).toBe('apps/web/dist');
    const shared = command.indexOf('pnpm --filter @crash/shared build');
    const web = command.indexOf('pnpm --filter @crash/web build');
    expect(shared, 'build do shared no command').toBeGreaterThanOrEqual(0);
    expect(web, 'build do web depois do shared').toBeGreaterThan(shared);
  });

  it("NT4: o script-src existe e não tem 'unsafe-eval' nem 'unsafe-inline'", () => {
    const scriptSrc = cspDirectives(netlify().headers).get('script-src');

    expect(scriptSrc, 'script-src na CSP').toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});
