# CLAUDE.md — Crash Game (projeto de portfólio)

> Fonte única da verdade do projeto. Toda decisão de arquitetura passa por aqui antes de virar código.
> Se o código e este arquivo divergirem, o arquivo vence até ser atualizado de forma explícita.

---

## 1. Contexto e objetivo

Crash game **multiplayer** com rodada única e global. Todos os jogadores veem o mesmo multiplicador subir e precisam fazer cash out antes do crash. Usa moeda fictícia (créditos), sem dinheiro real.

Objetivo: projeto de portfólio que demonstre, de ponta a ponta, o stack das vagas júnior de back-end e front-end da Jungle Gaming:

- **Back:** NestJS, TypeScript, MikroORM, PostgreSQL, Docker, DDD, REST, WebSockets, testes
- **Front:** React, TypeScript, PixiJS, integração REST + WebSocket, responsividade, profiling

O README e a qualidade do histórico de commits pesam tanto quanto o código.

---

## 2. Regras de colaboração (método Akita)

- **Decisões de arquitetura são do André.** O agente executa, propõe e questiona, mas não decide sozinho. Qualquer mudança de arquitetura, contrato ou modelo de dados é proposta antes e registrada na seção 4.
- **TDD sempre no domínio:** teste que falha → código mínimo → refatoração.
- **Commits pequenos**, um assunto por commit, com mensagem no padrão Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`).
- **Nada de dependência nova sem justificar.** Antes de instalar um pacote, diga para que serve e qual a alternativa.
- **O agente roda isolado** (container Docker, "AI Jail"). Não há dado de produção neste projeto, e nenhum segredo vai para o repositório.
- **Todo código gerado é revisado** pelo André antes do merge. Se o agente não tiver certeza de algo, ele pergunta em vez de supor.
- Ao fim de cada etapa: rodar testes, lint e typecheck, e marcar o checklist da seção 13.

---

## 3. Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | pnpm workspaces |
| Linguagem | TypeScript (strict) em tudo |
| Runtime | Node.js LTS atual |
| API | NestJS |
| ORM / banco | MikroORM + PostgreSQL |
| Tempo real | Gateway WebSocket do NestJS com `ws` nativo (`@nestjs/platform-ws`, `WsAdapter`) |
| Front | Vite + React + TypeScript |
| Renderização | PixiJS v8 (uso imperativo) |
| Estado no front | Zustand |
| Testes | Vitest em todo o monorepo (decorators resolvidos pelo Vite 8, sem SWC); Testcontainers para integração com Postgres |
| Infra local | Docker Compose (postgres + api) |
| CI | GitHub Actions: lint, typecheck, testes |
| Deploy | web no Netlify, api + Postgres no Railway ou Render |

Use sempre a versão estável mais recente de cada pacote no momento do setup e registre as versões no README.

---

## 4. Decisões registradas (ADRs resumidos)

| # | Decisão | Motivo |
|---|---|---|
| D1 | Jogo: **crash** multiplayer com rodada global | Único dos três candidatos (crash, plinko, mines) em que WebSocket é essencial, e ele cobre o stack das duas vagas |
| D2 | **Monorepo** com `apps/api`, `apps/web` e `packages/shared` | Front e back compartilham tipos e a fórmula do multiplicador, então divergências viram erro de compilação |
| D3 | **Servidor autoritativo** | O cliente só renderiza; quem decide resultado, saldo e validade de cash out é o servidor |
| D4 | **REST para ações, WebSocket só para broadcast** | O que mexe com saldo passa por REST: idempotente, testável, auditável. O WS só empurra eventos do servidor para os clientes |
| D5 | **Idempotency-Key** obrigatória em `POST /bets` e `POST /bets/:id/cashout` | Evitar processamento duplicado em retry ou duplo clique |
| D6 | **Dinheiro em centavos inteiros** (value object `Money`) | Nunca usar float para dinheiro |
| D7 | **Provably fair** com commit de hash da seed | Padrão real do mercado; qualquer pessoa consegue verificar a rodada |
| D8 | Momento do crash é **determinístico** (`crashAt`) | Validar cash out por `now < crashAt` elimina a corrida entre cash out e game loop |
| D9 | **DDD**: três bounded contexts (`rounds`, `bets`, `wallet`) e domínio em TypeScript puro | Domínio testável sem framework nem banco |
| D10 | Pixi **imperativo**, montado em `useEffect`, lendo a store via `subscribe` | Mais controle; o Pixi não re-renderiza junto com o React |
| D11 | Multiplicador **calculado no cliente** a cada frame; o servidor manda ticks só para sincronizar | Animação a 60 fps mesmo com rede instável, e menos tráfego |
| D12 | Jogador **guest**: nickname + token opaco | Sem login real; foco no jogo |
| D13 | **Uma instância** da API roda o game loop | Escala horizontal fica fora do escopo e é documentada como limitação |
| D14 | SNS/SQS **fica para depois** (seção 14) | Priorizar o núcleo |
| D15 | WebSocket com **`ws` nativo**, sem socket.io | WebSocket puro no protocolo padrão; reconexão, backoff e heartbeat (ping/pong) feitos à mão, documentados no README |
| D16 | **Vitest** em todo o monorepo | Um runner só para api, web e shared; mais rápido. O template ESM do NestJS 12 já vem com Vitest, e o Vite 8 gera os metadados de decorators sem precisar de SWC |
| D17 | Versões compartilhadas no **catalog do pnpm** | Uma única fonte para typescript e vitest; evita versões diferentes entre pacotes |

### Decisões pendentes

Nenhuma no momento.

---

## 5. Arquitetura

```
crash-game/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── rounds/
│   │       │   ├── domain/          # Round, CrashPoint, ServerSeed, eventos, interface do repositório
│   │       │   ├── application/     # casos de uso: StartRound, CrashRound, GetCurrentRound, VerifyRound
│   │       │   └── infrastructure/  # entidades MikroORM, repositório, GameLoopService, gateway WS, controller
│   │       ├── bets/
│   │       │   ├── domain/          # Bet, regras de aposta e cash out
│   │       │   ├── application/     # PlaceBet, CashOut, SettleRound
│   │       │   └── infrastructure/
│   │       ├── wallet/
│   │       │   ├── domain/          # Wallet, Money, LedgerEntry
│   │       │   ├── application/
│   │       │   └── infrastructure/
│   │       ├── players/             # guest + autenticação por token (sem DDD, é infraestrutura)
│   │       └── shared/              # idempotência, filtros de erro, relógio (Clock)
│   └── web/
│       └── src/
│           ├── net/                 # cliente WS (reconexão, ressincronização), cliente REST
│           ├── store/               # Zustand
│           ├── ui/                  # componentes React
│           └── game/                # PixiJS: CrashScene e objetos da cena
├── packages/
│   └── shared/                      # tipos de eventos WS, DTOs, multiplierAt(), constantes
├── docker-compose.yml
└── CLAUDE.md
```

### Regra de dependência

```
infrastructure → application → domain
```

- `domain` não importa NestJS, MikroORM nem nada de infraestrutura.
- `application` depende de interfaces do domínio (repositórios, `Clock`), nunca das implementações.
- Os contextos não acessam o banco uns dos outros. `bets` fala com `wallet` por um caso de uso ou porta da aplicação, nunca pelo repositório do outro.

### Relógio injetável

Toda regra que depende de tempo recebe um `Clock` (`now(): number` em ms). Nos testes, use um relógio falso controlável. Nunca chame `Date.now()` dentro do domínio.

---

## 6. Domínio

### 6.1 Value objects

| VO | Regras |
|---|---|
| `Money` | Inteiro em centavos, ≥ 0. Operações `add`, `subtract` (lança erro se ficar negativo) e `multiply(multiplier)` com arredondamento **para baixo** |
| `Multiplier` | ≥ 1.00, com duas casas decimais. Guardado internamente como inteiro ×100 (ex.: 1.57 → 157) |
| `ServerSeed` | 32 bytes aleatórios (hex). Nunca exposto antes do crash |
| `SeedHash` | `sha256(serverSeed)` em hex. Publicado no início da rodada |

### 6.2 Agregado `Round`

Estados e transições:

```
BETTING ──start()──▶ RUNNING ──crash()──▶ CRASHED
```

| Campo | Descrição |
|---|---|
| `id` | UUID |
| `status` | `BETTING`, `RUNNING` ou `CRASHED` |
| `serverSeed` | Secreto até o crash |
| `seedHash` | Público desde a criação |
| `crashPoint` | `Multiplier`, calculado a partir da seed na criação |
| `bettingEndsAt` | Fim da janela de apostas |
| `startedAt` | Definido em `start()` |
| `crashAt` | `startedAt + timeToCrash(crashPoint)` |
| `crashedAt` | Definido em `crash()` |

Invariantes:
- Só sai de `BETTING` para `RUNNING`, e de `RUNNING` para `CRASHED`. Qualquer outra transição lança `InvalidRoundTransitionError`.
- `serverSeed` só é exposto quando `status === CRASHED`.
- `multiplierAt(now)` só é definido em `RUNNING` e nunca passa de `crashPoint`.

### 6.3 Agregado `Bet`

| Campo | Descrição |
|---|---|
| `id` | UUID |
| `roundId`, `playerId` | Uma aposta por jogador por rodada |
| `amount` | `Money` > 0 |
| `status` | `PENDING`, `CASHED_OUT` ou `LOST` |
| `cashoutMultiplier` | Definido no cash out |
| `payout` | `amount × cashoutMultiplier`, arredondado para baixo |

Invariantes:
- Só pode ser criada se a rodada estiver em `BETTING` e `now < bettingEndsAt`.
- Valor mínimo de 1,00 crédito e máximo de 1.000,00.
- Cash out só se a rodada estiver em `RUNNING`, a aposta em `PENDING` e `now < crashAt`.
- O multiplicador do cash out é calculado **pelo servidor** com `multiplierAt(now)`. O cliente nunca informa o multiplicador.
- Quando a rodada termina, todas as apostas `PENDING` viram `LOST`.

### 6.4 Agregado `Wallet`

- Um por jogador. Saldo inicial: **1.000,00 créditos** (100000 centavos).
- `debit(amount)` lança `InsufficientBalanceError` se o saldo ficar negativo.
- Toda movimentação gera um `LedgerEntry` (`BET_PLACED`, `CASHOUT`, `INITIAL_GRANT`).
- Invariante: o saldo é sempre igual à soma do extrato. Isso vira um teste.

### 6.5 Eventos de domínio

`RoundCreated`, `RoundStarted`, `RoundCrashed`, `BetPlaced`, `BetCashedOut`, `BetsSettled`.

Na infraestrutura, o gateway WS escuta esses eventos e faz o broadcast correspondente (seção 8.2).

---

## 7. Fórmulas (em `packages/shared`, exceto a geração do crash point)

### 7.1 Multiplicador em função do tempo

```
r = 0.00006                     // taxa de crescimento por ms
multiplierAt(elapsedMs) = floor(100 × e^(r × elapsedMs)) / 100
timeToCrash(crashPoint) = ln(crashPoint) / r       // em ms
```

Referências: 2,00x em ~11,6 s; 10,00x em ~38 s; 100,00x em ~77 s.

### 7.2 Crash point (provably fair, inspirado no modelo do Bustabit)

Fica **só no back-end** (`rounds/domain`).

```
hmac = HMAC_SHA256(key = serverSeed, message = roundId)
h    = inteiro dos primeiros 13 caracteres hex de hmac   // 52 bits
e    = 2^52

se h % 33 === 0:   crashPoint = 1.00          // crash instantâneo, ~3% de vantagem da casa
senão:             crashPoint = floor((100 × e − h) / (e − h)) / 100
```

Verificação pública (`GET /rounds/:id/verify`): devolve `serverSeed`, `seedHash` e `crashPoint`. O cliente confere que `sha256(serverSeed) === seedHash` e recalcula o crash point.

Testes obrigatórios: valores conhecidos fixos (seed + id → crash point esperado), distribuição aproximada em 100 mil amostras (cerca de 3% de crash em 1,00x, mediana perto de 1,9x) e resultado sempre ≥ 1,00.

---

## 8. Contratos

### 8.1 REST

Autenticação: header `Authorization: Bearer <token>` (exceto na criação do guest).
Ações que mexem com saldo exigem o header `Idempotency-Key: <uuid>`.

| Método e rota | Corpo | Resposta | Erros |
|---|---|---|---|
| `POST /players/guest` | `{ nickname }` (3 a 16 caracteres) | `{ playerId, nickname, token, balance }` | 400 |
| `GET /wallet` | — | `{ balance, entries[] }` (últimos 20 lançamentos) | 401 |
| `GET /rounds/current` | — | estado atual da rodada, apostas da rodada e `serverTime` | — |
| `GET /rounds/history?limit=20` | — | `[{ id, crashPoint, crashedAt }]` | — |
| `GET /rounds/:id/verify` | — | `{ serverSeed, seedHash, crashPoint }` | 404; 409 se a rodada ainda não crashou |
| `POST /bets` | `{ amount }` | `{ betId, roundId, amount, balance }` | 400, 401, 409 (`ROUND_NOT_ACCEPTING_BETS`, `BET_ALREADY_PLACED`), 422 (`INSUFFICIENT_BALANCE`) |
| `POST /bets/:id/cashout` | — | `{ betId, multiplier, payout, balance }` | 401, 404, 409 (`ROUND_NOT_RUNNING`, `BET_NOT_PENDING`, `TOO_LATE`) |

Valores monetários trafegam como **inteiros em centavos**. Multiplicadores trafegam como **inteiros ×100**. A formatação é responsabilidade do front.

Formato de erro: `{ code: string, message: string }`.

### 8.2 WebSocket (servidor → cliente)

Todos os eventos têm o formato `{ type, payload, serverTime }`, tipados em `packages/shared`.

| `type` | `payload` | Quando |
|---|---|---|
| `round:betting` | `{ roundId, seedHash, bettingEndsAt }` | Nova rodada aberta para apostas |
| `round:started` | `{ roundId, startedAt }` | Fim da janela de apostas |
| `round:tick` | `{ roundId, multiplier }` | A cada 100 ms durante `RUNNING` (só para sincronizar) |
| `round:crashed` | `{ roundId, crashPoint, serverSeed }` | No crash |
| `bet:placed` | `{ roundId, nickname, amount }` | Alguém apostou |
| `bet:cashed_out` | `{ roundId, nickname, multiplier, payout }` | Alguém fez cash out |

O cliente não envia ações pelo WS. O canal é só de leitura, e a conexão não exige autenticação.

---

## 9. Modelo de dados (PostgreSQL)

| Tabela | Colunas principais | Restrições |
|---|---|---|
| `players` | `id`, `nickname`, `token_hash`, `created_at` | `token_hash` único; o token é guardado como hash, nunca em texto puro |
| `wallets` | `player_id` (PK/FK), `balance`, `version` | `CHECK (balance >= 0)` |
| `ledger_entries` | `id`, `player_id`, `type`, `amount` (com sinal), `bet_id`, `created_at` | índice em `(player_id, created_at)` |
| `rounds` | `id`, `status`, `server_seed`, `seed_hash`, `crash_point`, `betting_ends_at`, `started_at`, `crash_at`, `crashed_at` | índice em `(status)` e `(crashed_at)` |
| `bets` | `id`, `round_id`, `player_id`, `amount`, `status`, `cashout_multiplier`, `payout`, `created_at` | `UNIQUE (round_id, player_id)` |
| `idempotency_keys` | `key`, `player_id`, `endpoint`, `response_status`, `response_body`, `created_at` | PK `(player_id, key)` |

Valores em centavos usam `bigint`; multiplicadores usam `integer` (×100).
Toda mudança de schema é feita por **migration** do MikroORM, nunca por `schema:update`.

---

## 10. Fluxos críticos e concorrência

### 10.1 Fazer aposta (`POST /bets`)

Em uma única transação:
1. Se a `Idempotency-Key` já existe para esse jogador, devolve a resposta salva.
2. Carrega a rodada atual e valida `BETTING` e `now < bettingEndsAt`.
3. Carrega a carteira com **lock pessimista** (`SELECT ... FOR UPDATE`).
4. Debita, grava o `LedgerEntry` e cria a `Bet`. O `UNIQUE (round_id, player_id)` é a última barreira contra aposta duplicada.
5. Salva a resposta na tabela de idempotência.

Depois do commit: emite `BetPlaced`, que vira o broadcast `bet:placed`.

### 10.2 Cash out (`POST /bets/:id/cashout`)

Em uma única transação:
1. Verifica a idempotência.
2. Carrega a aposta com lock e valida que pertence ao jogador e está `PENDING`.
3. Carrega a rodada e valida `RUNNING` e `now < crashAt`. **É essa comparação com `crashAt` que resolve a corrida com o game loop:** o momento do crash é fixo e conhecido de antemão, então não importa se o loop atrasou.
4. `multiplier = multiplierAt(now − startedAt)`; `payout = amount × multiplier`.
5. Credita na carteira (com lock) e grava o `LedgerEntry`.

### 10.3 Game loop (`GameLoopService`)

```
criar rodada (BETTING, 10 s) → start() → ticks a cada 100 ms → em crashAt: crash()
→ liquidar apostas PENDING como LOST → pausa de 3 s → nova rodada
```

- O loop agenda o crash para `crashAt` e não depende dos ticks para isso.
- **Recuperação no boot:** se existir rodada `RUNNING` com `crashAt` no passado, finaliza e liquida. Se existir rodada `BETTING` vencida, inicia. Depois, segue o ciclo normal.
- Os tempos (10 s de apostas, 100 ms entre ticks, 3 s de pausa) ficam em configuração.

---

## 11. Front-end

### 11.1 Responsabilidades

| Pasta | Faz | Não faz |
|---|---|---|
| `net/` | Conecta o WS, reconecta com backoff exponencial, chama a API REST, calcula o offset do relógio com base em `serverTime` | Lógica de UI |
| `store/` | Guarda rodada, saldo, aposta do jogador, lista de jogadores e histórico | Chamar a rede diretamente a partir dos componentes |
| `ui/` | Painel de aposta e cash out, carteira, lista de jogadores, histórico de multiplicadores | Desenhar o jogo |
| `game/` | `CrashScene`: curva, objeto que sobe, explosão, texto do multiplicador | Re-renderizar via React |

### 11.2 Regras

- O Pixi é criado em `useEffect` no componente `<GameCanvas />`, com `app.destroy()` no cleanup. A cena se inscreve na store com `store.subscribe` e atualiza os próprios objetos.
- A cada frame, o multiplicador exibido é `multiplierAt(serverNow − startedAt)`, onde `serverNow = Date.now() + clockOffset`. Os ticks do servidor só corrigem desvios.
- **Ao reconectar:** chama `GET /rounds/current` e reconstrói o estado antes de voltar a processar eventos.
- O botão de cash out fica desabilitado enquanto a requisição está em andamento. A `Idempotency-Key` é gerada uma vez por clique.
- Resolução lógica fixa de 1280×720, escalada para caber no container mantendo a proporção. A UI em React é responsiva até 360 px de largura.
- O tema visual é **original**: não copiar arte, marca ou personagens de jogos existentes.

### 11.3 Metas de performance (medir e registrar no README)

- 60 fps estáveis em um celular intermediário durante a rodada
- Carregamento inicial abaixo de 2 s em 4G simulado (Chrome DevTools)
- Nenhum objeto Pixi criado ou destruído por frame (reusar objetos)

---

## 12. Testes

| Nível | O quê | Ferramenta |
|---|---|---|
| Unitário (domínio) | VOs, transições de `Round`, regras de `Bet` e `Wallet`, fórmulas | Vitest |
| Unitário (shared) | `multiplierAt`, `timeToCrash` | Vitest |
| Integração (api) | Repositórios, transações, locks, idempotência, recuperação no boot | Vitest + Testcontainers + Postgres |
| E2E (api) | Fluxo completo: guest → aposta → cash out → crash, ouvindo o WS | Vitest + Supertest + cliente `ws` |
| Front | Store, cálculo de offset do relógio, lógica de reconexão (com WebSocket falso) | Vitest |

Testes de concorrência obrigatórios:
- Duas requisições de aposta simultâneas com a mesma `Idempotency-Key` → um débito só
- Duas apostas simultâneas com chaves diferentes na mesma rodada → uma é aceita e a outra recebe 409
- Cash out com `now` 1 ms antes e 1 ms depois de `crashAt` → aceito e `TOO_LATE`, respectivamente

---

## 13. Backlog por etapa

Estimativa total: ~39 h (MVP sem M6: ~30 h).

### M0 — Setup (3 h)
- [x] Monorepo pnpm com `apps/api`, `apps/web` e `packages/shared`
- [ ] TypeScript strict, ESLint e Prettier compartilhados
- [ ] Docker Compose com Postgres
- [ ] GitHub Actions: lint, typecheck e testes em cada push
- [x] Vitest configurado nos pacotes, com versões centralizadas no catalog do pnpm
- [ ] Testes rodando no CI
- [ ] `WsAdapter` do `@nestjs/platform-ws` registrado no bootstrap da api
- [ ] README inicial com como rodar

### M1 — Domínio com DDD, implementado com TDD (5 h)
- [ ] VOs: `Money`, `Multiplier`, `ServerSeed`, `SeedHash`
- [ ] `multiplierAt` e `timeToCrash` em `shared`
- [ ] Geração do crash point e testes de distribuição
- [ ] Agregado `Round` com máquina de estados
- [ ] Agregado `Bet` com regras de aposta e cash out
- [ ] Agregado `Wallet` com extrato
- [ ] Interfaces de repositório e `Clock`
- [ ] Eventos de domínio

### M2 — Persistência (5 h)
- [ ] Configuração do MikroORM
- [ ] Entidades e mapeamentos
- [ ] Migrations iniciais
- [ ] Repositórios implementando as interfaces do domínio
- [ ] Testes de integração com Testcontainers

### M3 — API e tempo real (6 h)
- [ ] Guest e autenticação por token
- [ ] Endpoints REST da seção 8.1
- [ ] Middleware de idempotência
- [ ] `GameLoopService` com recuperação no boot
- [ ] Gateway WS com os eventos da seção 8.2
- [ ] Testes de concorrência e E2E

### M4 — Base do front (5 h)
- [ ] Vite + React + TypeScript consumindo `shared`
- [ ] Clientes REST e WS (reconexão, ressincronização, offset do relógio)
- [ ] Store com Zustand
- [ ] UI: painel de aposta, carteira, lista de jogadores, histórico

### M5 — Cena PixiJS (6 h)
- [ ] `<GameCanvas />` com ciclo de vida correto
- [ ] Curva do multiplicador e objeto subindo
- [ ] Texto do multiplicador
- [ ] Animação do crash
- [ ] Escala responsiva

### M6 — Polimento (4 h)
- [ ] Partículas no crash e no cash out
- [ ] Easing nas transições
- [ ] Teste em celular real e ajustes

### M7 — Entrega (5 h)
- [ ] README: GIF de 10 s, arquitetura, decisões (link para esta seção 4), fluxos críticos, como rodar, limitações
- [ ] Diagramas: contexto e fluxo de uma rodada
- [ ] Medições de performance da seção 11.3, com antes e depois de pelo menos uma otimização
- [ ] Deploy do web e da api

### Definição de pronto (para toda etapa)
- [ ] Testes, lint e typecheck passando no CI
- [ ] Sem `any` sem justificativa
- [ ] Commits pequenos e descritivos
- [ ] Checklist da etapa marcado neste arquivo
- [ ] Qualquer decisão nova registrada na seção 4

---

## 14. Fora do escopo (por enquanto)

- **SNS/SQS:** publicar `RoundSettled` no SNS (via LocalStack) e consumir em uma fila SQS que alimenta histórico e estatísticas. Estimativa: +5 h.
- Auto cash out (sacar automaticamente num multiplicador escolhido)
- Login real com JWT, recuperação de conta
- Escala horizontal do game loop (exigiria eleição de líder ou lock distribuído)
- Chat entre jogadores
- Dinheiro real de qualquer tipo
