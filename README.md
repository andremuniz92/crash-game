# Crash Game

Crash game multiplayer com rodada global, usando créditos fictícios. Projeto de portfólio.
As decisões de arquitetura estão no [CLAUDE.md](./CLAUDE.md#4-decisões-registradas-adrs-resumidos).

## Estrutura

| Pacote          | Caminho           | O que é                                                   |
| --------------- | ----------------- | --------------------------------------------------------- |
| `@crash/api`    | `apps/api`        | API NestJS (REST + WebSocket com `ws` nativo)             |
| `@crash/web`    | `apps/web`        | Front em Vite + React                                     |
| `@crash/shared` | `packages/shared` | Tipos, constantes e fórmulas compartilhados entre os dois |

## Como rodar

Requisitos: Node.js 24 (veja `.nvmrc`), pnpm 11 e Docker.

### Setup único

A infra (`docker-compose.yml`) e o AI Jail (`.ai-jail/compose.yml`) compartilham a rede
Docker `crash-game`, declarada como externa nos dois. Crie-a uma vez:

```sh
docker network create crash-game
cp .env.example .env
pnpm install
```

Depois disso, os dois composes sobem de forma independente, em qualquer ordem.

### Banco de dados

```sh
docker compose up -d
```

Postgres 18, acessível de dois jeitos:

- **Dentro da rede `crash-game`** (AI Jail, API em container): sempre `postgres:5432`.
- **Do host** (psql, DBeaver): `localhost:${POSTGRES_PORT}`, por padrão `5433`. Essa porta só
  importa para acesso externo; mude no `.env` se ela já estiver em uso.

### Variáveis de ambiente

Um `.env` só, na raiz, compartilhado entre o host e o AI Jail. Testes, migrations e a API rodam
dentro do jail, então `DATABASE_URL` e `TEST_DATABASE_URL` usam o endereço da rede `crash-game`
(`postgres:5432`). O `localhost:5433` do `.env.example` serve só de referência para acesso
externo a partir do host (DBeaver, psql).

### Migrations

```sh
pnpm --filter @crash/api migration:up      # aplica as migrations pendentes no banco de DATABASE_URL
pnpm --filter @crash/api migration:create  # gera uma migration a partir dos registros do MikroORM
pnpm --filter @crash/api migration:check   # falha se algum registro mudou sem migration (roda no CI)
```

A API não aplica migrations sozinha no boot.

### Testes de integração

```sh
pnpm --filter @crash/api test:int
```

Usam o Postgres do compose, no banco `crash_game_test` de `TEST_DATABASE_URL`. O setup cria o
banco se ele não existir, aplica as migrations e esvazia as tabelas antes de cada teste. Os arquivos
rodam em sequência, porque todos usam o mesmo banco. O `pnpm test` continua só com os unitários,
sem banco.

### Desenvolvimento

```sh
pnpm dev
```

Builda o `shared` e sobe, em paralelo, o watch do `shared`, a API em `http://localhost:3000` e
o front em `http://localhost:5173`.

A API roda com `tsc --watch` e `node --watch` sobre o `dist`, então reinicia tanto quando muda o
código dela quanto quando muda o `shared`. Ela conecta no banco no boot e lê o `.env` da raiz.

### Scripts da raiz

| Script              | O que faz                                           |
| ------------------- | --------------------------------------------------- |
| `pnpm dev`          | Ambiente de desenvolvimento completo                |
| `pnpm build`        | Build de todos os pacotes                           |
| `pnpm typecheck`    | `tsc --noEmit` em todos os pacotes                  |
| `pnpm test`         | Vitest em todos os pacotes                          |
| `pnpm lint`         | oxlint (com tipos) no monorepo inteiro              |
| `pnpm format`       | Prettier em tudo                                    |
| `pnpm format:check` | Confere a formatação sem alterar nada (usado no CI) |

Cada pacote tem os mesmos scripts, restritos a ele (`pnpm --filter @crash/web lint`, por exemplo).

O CI (`.github/workflows/ci.yml`) roda, em cada push e pull request: install com
`--frozen-lockfile`, build do `shared`, format, lint, typecheck e testes. Um segundo job roda os
testes de integração e o `migration:check` contra um Postgres 18 em service container.

## Limitações conhecidas

- **Provably fair sem client seed.** Cada rodada usa uma seed gerada pelo servidor, e o hash dela é
  publicado antes das apostas. Isso garante que a seed não muda depois de publicada, mas não impede
  o servidor de gerar várias seeds e escolher uma antes de publicar o hash. Sistemas como o Bustabit
  resolvem isso com uma cadeia de hashes e uma seed pública que o servidor não controla. Fica
  registrado como evolução futura (seção 14 do CLAUDE.md).
- **Uma instância só da API** roda o game loop (D13).

## Versões

| Ferramenta | Versão |
| ---------- | ------ |
| Node.js    | 24     |
| pnpm       | 11.24  |
| TypeScript | 6.0    |
| NestJS     | 12.2   |
| MikroORM   | 7.2    |
| React      | 19.3   |
| Vite       | 8.3    |
| Vitest     | 5.0    |
| PostgreSQL | 18     |
| oxlint     | 1.89   |
| Prettier   | 3.9    |
