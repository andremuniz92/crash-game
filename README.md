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

### Desenvolvimento

```sh
pnpm dev
```

Builda o `shared` e sobe, em paralelo, o watch do `shared`, a API em `http://localhost:3000` e
o front em `http://localhost:5173`.

Limitação conhecida: a API não reinicia sozinha quando só o `shared` muda. Salve um arquivo da
API ou reinicie o `pnpm dev`. O Vite recarrega normalmente.

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
`--frozen-lockfile`, build do `shared`, format, lint, typecheck e testes.

## Versões

| Ferramenta | Versão |
| ---------- | ------ |
| Node.js    | 24     |
| pnpm       | 11.24  |
| TypeScript | 6.0    |
| NestJS     | 12.2   |
| React      | 19.3   |
| Vite       | 8.3    |
| Vitest     | 5.0    |
| PostgreSQL | 18     |
| oxlint     | 1.89   |
| Prettier   | 3.9    |
