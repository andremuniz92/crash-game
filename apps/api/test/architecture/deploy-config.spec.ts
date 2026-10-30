import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * D103 e D104: o Dockerfile e o railway.json repetem fatos que vivem em outros
 * arquivos (versão do Node, rota do health, ponto de entrada das migrations).
 * Sem este teste, eles divergiriam em silêncio e o erro só apareceria no deploy.
 */

const ROOT = join(import.meta.dirname, '../../../..');
const API = join(ROOT, 'apps/api');
const DOCKERFILE = 'apps/api/Dockerfile';
const RAILWAY = 'apps/api/railway.json';

/** Lê um arquivo do repositório; ausente vira falha com o nome dele. */
function readRepoFile(path: string): string {
  expect(existsSync(join(ROOT, path)), `${path} existe`).toBe(true);
  return readFileSync(join(ROOT, path), 'utf8');
}

interface Instruction {
  keyword: string;
  args: string;
}

/** Instruções do Dockerfile, sem comentários e com as continuações (`\`) unidas. */
function instructions(dockerfile: string): Instruction[] {
  return dockerfile
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const [keyword = '', ...rest] = line.split(/\s+/);
      return { keyword: keyword.toUpperCase(), args: rest.join(' ') };
    });
}

/** Instruções do último estágio, depois do último FROM. */
function finalStage(all: Instruction[]): Instruction[] {
  const lastFrom = all.map((i) => i.keyword).lastIndexOf('FROM');
  return all.slice(lastFrom + 1);
}

function only(stage: Instruction[], keyword: string): string {
  const found = stage.filter((i) => i.keyword === keyword);
  expect(found, `um ${keyword} no estágio final`).toHaveLength(1);
  return found[0]!.args;
}

/** Argumentos de uma instrução em forma exec (array JSON), já lidos. */
function execForm(stage: Instruction[], keyword: string): unknown {
  const args = only(stage, keyword);
  expect(args.startsWith('['), `${keyword} em forma exec`).toBe(true);
  return JSON.parse(args);
}

describe('configuração do deploy (D103, D104)', () => {
  it('DC1: todo FROM usa node:<.nvmrc>-alpine ou um estágio anterior', () => {
    const node = `node:${readRepoFile('.nvmrc').trim()}-alpine`;
    const froms = instructions(readRepoFile(DOCKERFILE)).filter(
      (i) => i.keyword === 'FROM',
    );
    expect(froms.length, 'pelo menos um FROM').toBeGreaterThan(0);

    const stages = new Set<string>();
    for (const { args } of froms) {
      const [image = '', as, name] = args.split(/\s+/);
      expect(
        image === node || stages.has(image),
        `FROM ${args}: esperado ${node} ou um estágio anterior`,
      ).toBe(true);
      if (as?.toUpperCase() === 'AS' && name) stages.add(name);
    }
    expect(froms[0]!.args.split(/\s+/)[0]).toBe(node);
  });

  it('DC2: o estágio final roda como node, com o tini como PID 1 e o CMD em forma exec', () => {
    const all = instructions(readRepoFile(DOCKERFILE));
    const stage = finalStage(all);

    expect(only(stage, 'USER')).toBe('node');
    expect(execForm(stage, 'ENTRYPOINT')).toEqual(['/sbin/tini', '--']);
    expect(execForm(stage, 'CMD')).toEqual(['node', 'dist/main.js']);
    expect(
      all.some(
        (i) => i.keyword === 'RUN' && /\bapk add\b.*\btini\b/.test(i.args),
      ),
      'o tini é instalado por apk',
    ).toBe(true);
  });

  it('DC3: o railway.json aponta para o Dockerfile, o /health e o migrate.js, sem dormir', () => {
    const railway = JSON.parse(readRepoFile(RAILWAY)) as {
      build?: { builder?: string; dockerfilePath?: string };
      deploy?: {
        healthcheckPath?: string;
        preDeployCommand?: string[];
        restartPolicyType?: string;
        sleepApplication?: boolean;
      };
    };

    expect(railway.build?.builder).toBe('DOCKERFILE');
    expect(railway.build?.dockerfilePath).toBe(DOCKERFILE);

    expect(railway.deploy?.healthcheckPath).toBe('/health');
    expect(
      readFileSync(
        join(API, 'src/shared/infrastructure/http/health.controller.ts'),
        'utf8',
      ),
    ).toContain("@Controller('health')");

    expect(railway.deploy?.preDeployCommand).toEqual(['node dist/migrate.js']);
    expect(
      existsSync(join(API, 'src/migrate.ts')),
      'src/migrate.ts existe',
    ).toBe(true);

    expect(railway.deploy?.restartPolicyType).toBe('ON_FAILURE');
    expect(railway.deploy?.sleepApplication).toBe(false);
  });

  it('DC4: o .dockerignore exclui node_modules, dist e coverage em qualquer pasta', () => {
    // Sem **/, o padrão só vale na raiz do contexto, e os de apps/* e
    // packages/* entrariam na imagem.
    const patterns = readRepoFile('.dockerignore')
      .split(/\r?\n/)
      .map((line) => line.trim());

    for (const pattern of ['**/node_modules', '**/dist', '**/coverage']) {
      expect(patterns, `.dockerignore com ${pattern}`).toContain(pattern);
    }
  });
});
