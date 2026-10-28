# Crash Game

[![CI](https://github.com/andremuniz92/crash-game/actions/workflows/ci.yml/badge.svg)](https://github.com/andremuniz92/crash-game/actions/workflows/ci.yml)

**Status:** back-end completo (M0 a M3); front em desenvolvimento.

Crash game multiplayer com rodada global, usando créditos fictícios. Projeto de portfólio.
As decisões de arquitetura estão no [CLAUDE.md](./CLAUDE.md#4-decisões-registradas-adrs-resumidos).

## Destaques

- **Sem corrida entre cash out e crash.** Ordem fixa de locks (rodada → aposta → carteira): o
  crash espera os cash outs em andamento e nunca grava "perdeu" por cima de um saque aceito.
  [D57](./CLAUDE.md#4-decisões-registradas-adrs-resumidos), [fluxos críticos](./CLAUDE.md#10-fluxos-críticos-e-concorrência).
- **Idempotência com hash do corpo.** Repetir a mesma requisição devolve a resposta original, mesmo
  com as duas chegando ao mesmo tempo; a mesma chave com outro valor responde 422.
  [D60](./CLAUDE.md#4-decisões-registradas-adrs-resumidos).
- **Provably fair com verificação pública.** O hash da seed sai antes das apostas; depois do crash,
  qualquer pessoa confere a seed e recalcula o resultado.
  [D7, D23, D30](./CLAUDE.md#4-decisões-registradas-adrs-resumidos), [fórmula](./CLAUDE.md#72-crash-point-provably-fair-inspirado-no-modelo-do-bustabit).
- **Testes de concorrência determinísticos, sem `sleep`.** O teste segura o lock, dispara as
  operações e pergunta ao Postgres (`pg_locks`) se elas estão esperando antes de soltar.
  [D54](./CLAUDE.md#4-decisões-registradas-adrs-resumidos).
- **Testes que provam que pegam a falha.** Em cada fase, o código que protege uma regra foi removido
  de propósito para confirmar que o teste falha (mutação manual). [Testes](./CLAUDE.md#12-testes).
- **372 testes:** 246 unitários, 85 de integração com Postgres real e 41 E2E por HTTP e WebSocket,
  todos no CI. [D39, D40, D66](./CLAUDE.md#4-decisões-registradas-adrs-resumidos).

## Como foi desenvolvido

O código foi escrito com IA agêntica (Claude Code), seguindo um processo definido no
[CLAUDE.md](./CLAUDE.md#2-regras-de-colaboração-método-akita):

- O agente roda isolado num container, sem acesso a segredos do host. Ele não faz commit nem push
  (regra do projeto), e o container não tem as credenciais para isso. Eu reviso o diff e faço os
  commits.
- As decisões de arquitetura são minhas. O agente propõe e questiona, e cada decisão aprovada fica
  registrada na seção 4 do CLAUDE.md antes de virar código.
- Cada fase começa com a lista de testes, que eu aprovo antes de qualquer implementação.
- TDD: o teste é escrito primeiro, o vermelho é confirmado (com a classe de erro já existente, para
  não haver falso verde) e só então vem a implementação. As barreiras de concorrência e de
  segurança ganham um teste de mutação.
- Ao fim de cada fase, testes, lint, typecheck, formatação e build rodam antes da minha revisão.

## Estrutura

| Pacote          | Caminho           | O que é                                                   |
| --------------- | ----------------- | --------------------------------------------------------- |
| `@crash/api`    | `apps/api`        | API NestJS (REST + WebSocket com `ws` nativo)             |
| `@crash/web`    | `apps/web`        | Front em Vite + React                                     |
| `@crash/shared` | `packages/shared` | Tipos, constantes e fórmulas compartilhados entre os dois |

## Como rodar

Requisitos: Node.js 24 (veja `.nvmrc`), pnpm 11 e Docker.

### Onde rodar: no host ou no AI Jail

Os comandos (`pnpm dev`, testes, migrations) rodam em um de dois lugares. O que muda entre eles é
só o endereço do Postgres em `DATABASE_URL` e `TEST_DATABASE_URL`:

| Onde                                             | Como o banco é acessado  | `DATABASE_URL`                                     | `TEST_DATABASE_URL`                                     |
| ------------------------------------------------ | ------------------------ | -------------------------------------------------- | ------------------------------------------------------- |
| **No host** (o caminho de quem clona)            | porta publicada          | `postgres://crash:crash@localhost:5433/crash_game` | `postgres://crash:crash@localhost:5433/crash_game_test` |
| **No AI Jail** (`.ai-jail/`, onde o agente roda) | rede Docker `crash-game` | `postgres://crash:crash@postgres:5432/crash_game`  | `postgres://crash:crash@postgres:5432/crash_game_test`  |

O `5433` é o `POSTGRES_PORT` do `.env`; se mudar a porta, mude nas duas URLs do host. O
`.env.example` vem com as URLs do jail e traz as do host comentadas logo abaixo: **no host, troque
as duas linhas.** Nos dois caminhos, a API e o front ficam em `localhost:3000` e `localhost:5173`
no navegador do host (o jail publica essas portas).

O `.env` da raiz é lido pelos scripts nos dois lugares, então ele aponta para um caminho de cada
vez. Para alternar sem editar o arquivo, defina as variáveis no shell: as do ambiente têm
prioridade sobre o `.env`. Por exemplo, no host:

```sh
export DATABASE_URL=postgres://crash:crash@localhost:5433/crash_game
export TEST_DATABASE_URL=postgres://crash:crash@localhost:5433/crash_game_test
```

### Setup único

O `docker-compose.yml` usa a rede Docker `crash-game`, declarada como externa (o AI Jail usa a
mesma). Crie-a uma vez, mesmo que vá rodar só no host:

```sh
docker network create crash-game
cp .env.example .env     # no host, troque as URLs para localhost:5433 (veja acima)
pnpm install
```

### Banco de dados

```sh
docker compose up -d
```

Postgres 18, publicado só no loopback do host (`127.0.0.1:5433` por padrão) e acessível como
`postgres:5432` dentro da rede `crash-game`. Ferramentas como psql e DBeaver usam o endereço do
host.

### Migrations

```sh
pnpm --filter @crash/api migration:up      # aplica as migrations pendentes no banco de DATABASE_URL
pnpm --filter @crash/api migration:create  # gera uma migration a partir dos registros do MikroORM
pnpm --filter @crash/api migration:check   # falha se algum registro mudou sem migration (roda no CI)
```

A API não aplica migrations sozinha no boot.

### Testes

```sh
pnpm test                               # unitários de todos os pacotes, sem banco
pnpm --filter @crash/api test:int       # integração: repositórios, transações, locks, casos de uso
pnpm --filter @crash/api test:e2e       # E2E: a API inteira por HTTP e WebSocket
```

Integração e E2E usam o Postgres do compose, no banco `crash_game_test` de `TEST_DATABASE_URL`.
O setup cria o banco se ele não existir, aplica as migrations e esvazia as tabelas antes de cada
teste. Os arquivos rodam em sequência, porque todos usam o mesmo banco.

Os testes de concorrência não dependem de `sleep`: o teste segura um lock numa transação própria,
dispara as operações e pergunta ao próprio Postgres (`pg_locks`) se elas ficaram esperando, antes
de soltar. Os E2E controlam o relógio (`FakeClock`) e chamam o passo do game loop à mão, com
seeds conhecidas, para ter crash points e instantes exatos.

### Desenvolvimento

```sh
pnpm dev
```

Na primeira vez, com o banco no ar, aplique as migrations (`migration:up`, acima). Depois, o
`pnpm dev` builda o `shared` e sobe, em paralelo, o watch do `shared`, a API em
`http://localhost:3000` (REST e WebSocket em `/ws`) e o front em `http://localhost:5173`. O game
loop começa junto com a API: abre uma rodada, inicia, crasha e abre a próxima.

A API roda com `tsc --watch` e `node --watch` sobre o `dist`, então reinicia tanto quando muda o
código dela quanto quando muda o `shared`. Ela conecta no banco no boot (e falha na hora se ele
estiver fora) e lê o `.env` da raiz. O estado incremental do `tsc` fica dentro do `dist`, então um
clone limpo, ou um `dist` apagado, sempre gera tudo de novo.

Se a API cair no meio de uma rodada, o primeiro passo do game loop no boot termina o que ficou
pendente: uma rodada em apostas vencida é iniciada, e uma rodada em andamento com o crash no
passado é crashada e liquidada.

Encerramento: com SIGTERM ou SIGINT, a API para o game loop, espera o passo em andamento
terminar e fecha o banco. Rodando direto (`node dist/main.js`), o processo sai com o código 143
(128 + 15, o padrão para SIGTERM). No `pnpm dev`, quem recebe o sinal é o `node --watch`, que sai
com 0. Gerenciadores de processo podem mostrar outro número; o que vale é o log sem erro.

### Configuração da API

| Variável            | Padrão  | O que é                                                 |
| ------------------- | ------- | ------------------------------------------------------- |
| `DATABASE_URL`      | —       | Postgres da API (obrigatória)                           |
| `TEST_DATABASE_URL` | —       | Postgres dos testes; o nome precisa terminar em `_test` |
| `PORT`              | `3000`  | Porta HTTP e WebSocket                                  |
| `BETTING_MS`        | `10000` | Janela de apostas de cada rodada                        |
| `PAUSE_MS`          | `3000`  | Pausa entre o crash e a próxima rodada                  |
| `TICK_MS`           | `100`   | Intervalo do `round:tick`                               |
| `WS_HEARTBEAT_MS`   | `30000` | Intervalo do ping do WebSocket                          |

Valores inválidos (não inteiros, zero ou negativos) impedem a API de subir, com o nome da variável
no erro.

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
testes de integração, os E2E e o `migration:check` contra um Postgres 18 em service container.

## API

O contrato completo, com os tipos de cada resposta e mensagem, está em
[`packages/shared/src/api.ts`](./packages/shared/src/api.ts) e
[`packages/shared/src/ws.ts`](./packages/shared/src/ws.ts). Dinheiro trafega em **centavos
inteiros**, multiplicadores como **inteiros ×100** (1,57x = `157`) e instantes em **ms desde a
epoch**.

### REST

| Rota                     | Autenticação                 | O que faz                                                   |
| ------------------------ | ---------------------------- | ----------------------------------------------------------- |
| `POST /players/guest`    | —                            | Cria o jogador com 1.000,00 créditos e devolve o token      |
| `GET /wallet`            | `Bearer`                     | Saldo e os 20 lançamentos mais recentes                     |
| `GET /rounds/current`    | `Bearer` opcional            | Rodada atual (ou a última crashada), apostas e `serverTime` |
| `GET /rounds/history`    | —                            | Rodadas crashadas, da mais recente (`?limit=` de 1 a 100)   |
| `GET /rounds/:id/verify` | —                            | `serverSeed`, `seedHash` e `crashPoint` depois do crash     |
| `POST /bets`             | `Bearer` + `Idempotency-Key` | Aposta na rodada em apostas (`{ amount }`)                  |
| `POST /bets/:id/cashout` | `Bearer` + `Idempotency-Key` | Cash out pelo multiplicador do servidor                     |

Todo erro sai como `{ code, message }`, com um `code` estável: `VALIDATION_ERROR` (400),
`UNAUTHORIZED` (401), `BET_NOT_FOUND` (404), `BET_ALREADY_PLACED` e `TOO_LATE` (409),
`INSUFFICIENT_BALANCE` e `IDEMPOTENCY_KEY_REUSED` (422), entre outros. A tabela completa está
na D58 do CLAUDE.md. Erro interno sai como 500 `INTERNAL_ERROR`, sem detalhes, e vai para o log.

**Idempotência.** As duas ações que mexem com saldo exigem o header `Idempotency-Key` (um UUID).
Repetir a requisição com a mesma chave e o mesmo corpo devolve a resposta original, sem processar
de novo, mesmo que as duas cheguem ao mesmo tempo. A mesma chave com outro corpo ou em outra rota
responde 422. Só respostas de sucesso ficam salvas: depois de um erro, a mesma chave pode ser usada
de novo.

Um exemplo do fluxo, com o `jq`:

```sh
TOKEN=$(curl -s -X POST localhost:3000/players/guest -H "Content-Type: application/json" \
  -d '{"nickname":"ana"}' | jq -r .token)
curl -s -X POST localhost:3000/bets -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" -d '{"amount":1000}'
```

### WebSocket (`/ws`)

Só do servidor para o cliente, sem autenticação. Toda mensagem tem o formato
`{ type, payload, serverTime }`:

| `type`           | Quando                                    |
| ---------------- | ----------------------------------------- |
| `round:betting`  | Nova rodada aberta, com o `seedHash`      |
| `round:started`  | Fim da janela de apostas                  |
| `round:tick`     | A cada `TICK_MS` durante a rodada         |
| `round:crashed`  | No crash, com `crashPoint` e `serverSeed` |
| `bet:placed`     | Alguém apostou                            |
| `bet:cashed_out` | Alguém fez cash out                       |

Antes do crash, nenhuma resposta REST nem mensagem do WebSocket carrega o crash point, o instante
do crash ou a seed. O `round:tick` serve só para sincronizar: o cliente calcula o multiplicador a
cada frame com a fórmula do `@crash/shared`. O servidor manda ping a cada `WS_HEARTBEAT_MS` e
derruba a conexão que não responder.

**Verificando uma rodada.** Depois do crash, `GET /rounds/:id/verify` devolve a seed. Qualquer
pessoa pode conferir que `sha256(serverSeed)` é o `seedHash` publicado no `round:betting` e
recalcular o crash point com a fórmula da seção 7.2 do CLAUDE.md.

## Limitações conhecidas

- **Provably fair sem client seed.** Cada rodada usa uma seed gerada pelo servidor, e o hash dela é
  publicado antes das apostas. Isso garante que a seed não muda depois de publicada, mas não impede
  o servidor de gerar várias seeds e escolher uma antes de publicar o hash. Sistemas como o Bustabit
  resolvem isso com uma cadeia de hashes e uma seed pública que o servidor não controla. Fica
  registrado como evolução futura (seção 14 do CLAUDE.md).
- **Uma instância só da API** roda o game loop (D13). Os eventos do WebSocket também ficam em
  memória, no mesmo processo.
- **Guest sem limite de criação.** Não há limite de requisições no `POST /players/guest`: qualquer
  pessoa cria quantos jogadores quiser, cada um com 1.000,00 créditos. Os créditos são fictícios,
  mas o endpoint permite encher o banco.
- **O token do guest nunca expira.** Não há expiração, rotação nem revogação: quem tiver o token age
  pelo jogador para sempre. Login real fica fora do escopo (seção 14 do CLAUDE.md).
- **As chaves de idempotência não expiram.** A tabela `idempotency_keys` cresce sem limpeza; uma
  rotina de expiração (por exemplo, 24 h) fica para depois.
- **O `round:tick` não tem teto no crash point** (D68). Se o crash atrasar alguns milissegundos, um
  tick pode mostrar um valor um pouco acima do crash point; o `round:crashed` traz o valor exato.
  Isso não dá vantagem, porque qualquer cash out depois do instante do crash é recusado.

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
