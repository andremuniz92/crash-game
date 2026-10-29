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
- **O agente não faz commit nem push.** Ele prepara as mudanças; o André revisa o diff e commita no host.
- **TDD sempre no domínio:** teste que falha → código mínimo → refatoração.
- **Commits pequenos**, um assunto por commit, com mensagem no padrão Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`).
- **Nada de dependência nova sem justificar.** Antes de instalar um pacote, diga para que serve e qual a alternativa.
- **O agente roda isolado** (container Docker, "AI Jail"). Não há dado de produção neste projeto, e nenhum segredo vai para o repositório.
- **Banco de desenvolvimento:** o agente pode rodar `migration:up` e subir a API (com o game loop) contra ele sem pedir, porque esse banco é descartável e criar rodadas é o uso normal dele. Apagar ou editar dados diretamente nele (SQL, scripts, `TRUNCATE`) precisa da aprovação do André. Os testes usam o banco `crash_game_test` (D39, D40) e não entram nessa regra.
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
| Testes | Vitest em todo o monorepo (decorators resolvidos pelo Vite 8, sem SWC); integração com o Postgres do Docker Compose, num banco separado (`crash_game_test`), e com um service container no CI (D39) |
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
| D17 | Versões compartilhadas no **catalog do pnpm** | Uma única fonte para typescript, vitest e vite; evita versões diferentes entre pacotes |
| D18 | **AI Jail** em `.ai-jail/` (Docker Compose), sem segredos do host e com o mesmo UID do usuário. O store do pnpm fica dentro do projeto (`.pnpm-store/`, ignorado pelo git) e o jail entra na rede externa `crash-game` | Isolar a execução do agente; instalações e testes rodam no container. O store no mesmo filesystem do projeto permite hardlinks; a rede externa dá acesso ao Postgres sem expor a porta fora do loopback |
| D19 | **PostgreSQL 18** (`postgres:18-alpine`) no `docker-compose.yml` da raiz, na rede externa `crash-game` criada à mão (`docker network create crash-game`) | Major estável mais recente. A rede externa compartilhada deixa infra e jail subirem de forma independente, em qualquer ordem; o jail acessa `postgres:5432` e o host acessa `127.0.0.1:${POSTGRES_PORT}` (padrão 5433, para não conflitar com outro Postgres local) |
| D20 | **oxlint** como linter único (type-aware, via `oxlint-tsgolint`), no lugar do ESLint, com uma config na raiz (`.oxlintrc.json`) e o plugin React só em `apps/web`. `any` proibido (`no-explicit-any` como erro), liberado caso a caso com comentário de `oxlint-disable` justificado. **Prettier** na raiz, com aspas simples. O CI falha com qualquer warning (`--deny-warnings`) ou arquivo fora do formato | O oxlint já vem no template do NestJS 12, é muito mais rápido que o ESLint e cobre as regras com tipo que importam aqui (ex.: `no-floating-promises`, regras de hooks). Uma config só evita divergência entre pacotes |
| D21 | **Multiplicador como inteiro ×100 em todo lugar**, inclusive no `shared`: `multiplierAt(elapsedMs)` devolve o inteiro ×100 (tempo negativo vale 100), e `timeToCrash(crashPointX100)` devolve ms inteiros, arredondados para cima | Uma unidade só no contrato, no VO, no banco e nas fórmulas. Evita erro de ponto flutuante na volta para inteiro (`1.15 * 100 = 114.99999999999999`). Com ms inteiros, `crashAt` é exato e vale `multiplierAt(timeToCrash(c)) ≥ c > multiplierAt(timeToCrash(c) − 1)` |
| D22 | **Hash determinístico no domínio, aleatoriedade fora.** `rounds/domain` importa HMAC-SHA256 e SHA-256 de `node:crypto`; a geração da seed e dos ids fica atrás de portas na aplicação, e o domínio recebe `id` e `ServerSeed` prontos | Hash é função pura da biblioteca padrão, sem I/O, testável com valores fixos; uma porta não traria ganho. Aleatoriedade, como o tempo (`Clock`), tornaria o domínio não determinístico |
| D23 | **Codificação do provably fair:** a chave do HMAC e a entrada do SHA-256 são a `serverSeed` como **string hex (64 caracteres) em UTF-8**; a mensagem do HMAC é o `roundId` como UUID em minúsculas, com hífens | Sem ambiguidade para quem verifica de fora; dá para conferir com qualquer ferramenta comum de SHA-256 e HMAC |
| D24 | **Teto do crash point em 1.000.000,00x** (×100 = 100.000.000), aplicado como `min` na fórmula publicada (seção 7.2) | Sem teto, o valor ×100 chega a ~4,5 × 10¹⁷: passa de `Number.MAX_SAFE_INTEGER`, da coluna `integer` do Postgres e do produto seguro em `Money.multiply`. Com o teto, tudo cabe em inteiros seguros; chegar a 1.000.000x leva ~230 s |
| D25 | **Shared kernel** em `apps/api/src/shared/domain/` com `Money`, `Multiplier` e a interface `Clock` | São usados por mais de um contexto (`rounds`, `bets`, `wallet`); deixá-los dentro de um contexto obrigaria os outros a importar o domínio alheio |
| D26 | `BetsSettled` é **evento de domínio**; `RoundSettled` (seção 14) será o **evento de integração** publicado no SNS. Os nomes não são unificados | Evento de domínio é interno e pode mudar com o modelo; evento de integração é contrato público entre sistemas e tem o próprio formato |
| D27 | Fórmula do crash point com **divisão inteira exata** (`BigInt`), não em ponto flutuante | `100 × 2^52` passa de `2^53`: em `number` a conta perde bits e diverge da divisão exata em alguns casos (observado acima do teto). A divisão exata deixa a fórmula publicada sem ambiguidade para quem verifica |
| D28 | **Erros de domínio** herdam de `DomainError`, que carrega um `code` legível (ex.: `INVALID_MONEY`); uma subclasse por regra violada. A camada HTTP (M3) converte o `code` em status | O domínio não conhece HTTP, mas cada erro é identificável sem comparar mensagens |
| D29 | **Agregados recebem `now: number`**, não o `Clock`. A interface `Clock` fica em `shared/domain/`; a aplicação lê o relógio uma vez por operação e repassa o instante | Todas as regras de uma operação usam o mesmo instante. No cash out, `now < crashAt` e o multiplicador são calculados sobre o mesmo `now`; duas leituras do relógio poderiam discordar na fronteira do crash |
| D30 | **`crashPoint` e `crashAt` são secretos como a `serverSeed`** até o crash: sem getter público no `Round`, fora dos eventos `RoundCreated` e `RoundStarted` e fora do `GET /rounds/current`. As regras usam `acceptsCashOutAt(now)`; os valores só saem por `revealCrashPoint()` depois do crash | Quem sabe `crashAt` sabe o crash point (`crashAt − startedAt = timeToCrash(crashPoint)`) e poderia sacar 1 ms antes |
| D31 | **Eventos de domínio** são objetos simples, tipados como union discriminada por `type`. Os agregados herdam de `AggregateRoot` (`shared/domain/`), que acumula os eventos; `pullEvents()` devolve e esvazia a lista | Eventos serializáveis e fáceis de comparar em teste; a infraestrutura publica o que o agregado acumulou depois do commit |
| D32 | O `bets/domain` declara a interface **`RoundView`** (`id`, `status`, `acceptsBetsAt`, `acceptsCashOutAt`, `multiplierAt`), que o `Round` satisfaz por tipagem estrutural | O `bets` não importa o domínio do `rounds` (seção 5); o typecheck dos testes, que usam o `Round` real, garante a compatibilidade |
| D33 | **Uma aposta por jogador por rodada** e **posse da aposta** ficam fora do agregado: a aplicação consulta o repositório (`findByRoundAndPlayer`, `getByIdAndPlayerForUpdate`), e o `UNIQUE (round_id, player_id)` é a última barreira. Aposta de outro jogador responde 404 | Um `Bet` não conhece as outras apostas nem quem pergunta; 404 não revela que a aposta existe |
| D34 | **Erros do cash out:** rodada em `BETTING` → `ROUND_NOT_RUNNING`; rodada em `RUNNING` com `now ≥ crashAt` → `TOO_LATE`; rodada já em `CRASHED` → `TOO_LATE` | Para o jogador, cash out depois do crash é atraso; a resposta é a mesma dos dois lados da corrida com o game loop |
| D35 | **`BetsSettled`** é produzido pelo serviço de domínio `settleBets(round, bets)`, que exige a rodada em `CRASHED`, chama `lose()` nas apostas `PENDING` e devolve `BetsSettled { roundId, lostBetIds }` | Um agregado não emite evento sobre várias instâncias |
| D36 | Limites de aposta (`MIN_BET_CENTS = 100`, `MAX_BET_CENTS = 100_000`) no **`@crash/shared`** | O front valida o formulário com os mesmos valores; uma fonte só, como o `ONE_X` |
| D37 | **`LedgerEntry`** é objeto de valor sem `id` (`type`, `amount` com sinal, `betId`, `createdAt`); o `id` é identity do banco (M2). A invariante "saldo = soma do extrato" é testada no domínio, numa carteira em memória, e no M2 também no banco | Sem gerar id no domínio (D22); o banco já tem a fonte de verdade do extrato completo |
| D38 | **Repositórios** são interfaces assíncronas no domínio de cada contexto, sem implementação até o M2. O lock pessimista é explícito no contrato (`WalletRepository.getForUpdate` e `BetRepository.getByIdAndPlayerForUpdate`, D45). Snapshot e reconstrução dos agregados ficam para o M2; o histórico de rodadas é consulta da aplicação (M3) | O contrato diz o que a regra de concorrência (10.1, 10.2) precisa; os detalhes de mapeamento são da persistência |
| D39 | **Sem Testcontainers.** Os testes de integração usam o Postgres do `docker-compose.yml` num banco separado (`crash_game_test`); no CI, um service container do GitHub Actions com a mesma imagem (`postgres:18-alpine`) | O AI Jail não tem Docker, e montar o socket do host ou usar Docker-in-Docker privilegiado anularia o isolamento da D18. O Postgres do compose já está na rede `crash-game` |
| D40 | **Mecânica do banco de teste.** Um `globalSetup` do Vitest cria o `crash_game_test` se faltar (`orm.schema.ensureDatabase()`) e roda as migrations (`orm.migrator.up()`) uma vez por execução; recusa rodar se o nome do banco não terminar em `_test`. Cada teste começa com `TRUNCATE ... RESTART IDENTITY CASCADE` de todas as tabelas. Os testes de integração ficam num projeto Vitest próprio (`*.int-spec.ts`, `vitest.config.integration.ts`, script `test:int`) com **arquivos em sequência** (`fileParallelism: false`); os unitários continuam em paralelo e sem banco. No CI, um job `integration` com service container | Sem passo manual no jail nem no CI. O banco de teste passa pelas mesmas migrations de produção. Rollback por transação não serve aos testes de concorrência, que precisam de commits reais; e dois arquivos fazendo `TRUNCATE` ao mesmo tempo no mesmo banco gerariam falhas intermitentes |
| D41 | **Modelo de persistência separado do domínio.** Registros definidos com `defineEntity` do MikroORM 7, sem decorators; mapeadores convertem com `toSnapshot()` e `restore(snapshot)` dos agregados. O `Round.restore` recalcula o crash point (da seed e do id) e o `crashAt` e lança erro se o banco divergir. Os repositórios fazem escritas explícitas (`upsert`/`insert`) com o `EntityManager` recebido, sem depender do rastreamento de mudanças; a transação é aberta por quem chama (`em.transactional`) | O domínio continua sem imports do ORM e com os campos `#privados` da D30. A verificação no restore detecta linha corrompida ou adulterada. Com modelos separados, o rastreamento do unit of work só acrescentaria uma cópia |
| D42 | **Tipos no banco:** dinheiro em `bigint` lido no modo `'number'` do MikroORM e validado pelo `Money.fromCents` (inteiro seguro); multiplicadores em `integer`; datas em `timestamptz`, convertidas para ms nos mapeadores, com `forceUtcTimezone` | Com o teto da D24 os valores cabem em `number` com folga; se um dia não couberem, o `Money` lança erro em vez de perder precisão em silêncio |
| D43 | **Configuração por `DATABASE_URL`** (e `TEST_DATABASE_URL` nos testes), validada pela função pura `readDatabaseConfig(env)`. O `.env` da raiz é carregado pelo Node (`--env-file-if-exists`) nos scripts e pelo `loadEnv` do Vite no Vitest; em produção, as variáveis vêm da plataforma. Sem `@nestjs/config` | Railway e Render entregam `DATABASE_URL` pronta. Duas variáveis não justificam um módulo e o `dotenv`; reavaliar no M3 se a configuração crescer |
| D44 | **Ferramentas de migration:** `@mikro-orm/cli` com `tsx` como loader de TypeScript. O CI roda `migration:check` para garantir que nenhuma mudança de schema ficou sem migration. A API não aplica migrations sozinha no boot; há um script explícito | Migrations geradas a partir dos registros, sem SQL escrito à mão para o schema base; o `migration:check` impede divergência entre registros e migrations |
| D45 | **Ajustes do domínio para persistir:** o `Bet` guarda `placedAt`; o `BetRepository` carrega a aposta com lock (`getByIdAndPlayerForUpdate`, seção 10.2); o `Wallet` é reconstruído com saldo e `version`, sem o extrato completo, e separa os lançamentos novos (`pullNewEntries()`); `wallets.version` vira uma segunda barreira (`UPDATE ... WHERE version = ?`) além do lock pessimista. Todas as tabelas da seção 9 são criadas no M2; `players` e `idempotency_keys` só ganham repositórios no M3 | A tabela `bets` tem `created_at`; a 10.2 pede lock na aposta; carregar o extrato inteiro a cada operação não escala; a `version` protege contra um caso de uso que esqueça o lock |
| D46 | **Scripts de instalação bloqueados por padrão:** `allowBuilds` do pnpm 11 com `esbuild: false` (dependência do `tsx`). Novos pacotes com script de build entram como `false`, salvo justificativa registrada | Nenhum código de terceiro roda durante o install; o `tsx` funciona sem o script, porque o binário do esbuild vem pelo pacote opcional da plataforma |
| D47 | **`toSnapshot()` só é chamado pela persistência.** Um teste de arquitetura (`apps/api/test/architecture/snapshot-usage.spec.ts`, no `pnpm test`) varre `src/` e falha se a chamada aparecer fora de pastas `infrastructure/`, dos specs e dos arquivos de domínio que definem o método. Sem regra de lint | O snapshot expõe os segredos da rodada (D30); a convenção da D41 passa a ser verificada. Um agregado novo com snapshot entra na lista do teste |
| D48 | **FKs entre tabelas de contextos diferentes são aceitas** (`bets → rounds`, `ledger_entries → bets`, todas → `players`), e os registros de infraestrutura podem importar registros de outro contexto para declará-las. O isolamento entre contextos (seção 5) vale **no código**: um repositório só consulta e grava as tabelas do próprio contexto (consultas de leitura: D67) | É um monólito com banco único: a integridade referencial no banco é barata e protege o dinheiro. Separar bancos por contexto só faria sentido com serviços separados, fora do escopo |
| D49 | **Convenções do schema** (migration inicial do M2): ids em `uuid`; enums como `text` com `CHECK`; datas em `timestamptz(3)`; `ledger_entries.id` como `bigint generated by default as identity`; todas as FKs com `on update no action on delete no action`; índice único parcial `rounds_single_current_unique` (no máximo uma rodada não crashada); `CHECK` de faixa em `bets.amount > 0`, `bets.payout >= 0` e multiplicadores entre 100 e 100.000.000. Migrations geradas pelo MikroORM, revisadas e formatadas pelo Prettier; o `down()` da inicial é escrito à mão; snapshot com nome fixo (`.snapshot.json`), fora do Prettier porque o MikroORM o reescreve inteiro a cada geração | Dado financeiro não se apaga em cascata. O índice parcial é a barreira no banco para a D13. Identity é o padrão SQL recomendado no lugar de `serial`. O MikroORM não gera `down()` para a migration inicial |
| D50 | **Repositórios MikroORM** (`MikroOrm*Repository`, em `infrastructure/` de cada contexto) recebem o `EntityManager` da transação corrente no construtor; não abrem transação nem chamam `flush`. Escritas explícitas (`upsert`, `insert`, `insertMany`, `nativeUpdate`); leituras com `disableIdentityMap: true`. Métodos `...ForUpdate` exigem transação (o MikroORM lança `ValidationError` fora dela). `findByRound` ordena por `placedAt` e `id`; `findCurrent` busca `status <> CRASHED`. A injeção no Nest fica para o M3 | Leitura sempre do banco: uma cópia do identity map anularia o lock. Quem chama controla a fronteira da transação (D41) |
| D51 | **Mapeadores** são funções puras (`toRecord`/`toDomain`) por contexto, testadas sem banco no `pnpm test` | A conversão VO ↔ coluna e ms ↔ `Date` é lógica pura e merece teste rápido |
| D52 | **`BetAlreadyPlacedError`** (`BET_ALREADY_PLACED`, em `bets/domain`) é lançado pelo repositório ao reconhecer, pelo nome, a violação de `bets_round_id_player_id_unique` | A camada HTTP (M3) trata a última barreira da D33 pelo `code`, como os outros erros |
| D53 | **Versão da carteira:** `version 0` = nunca gravada → `INSERT` com `version = 1`; gravada → `UPDATE ... SET version = version + 1 WHERE version = <carregada>`, e zero linhas afetadas lança `WalletVersionConflictError` (`WALLET_VERSION_CONFLICT`). Os lançamentos de `pullNewEntries()` entram na mesma chamada. Uma gravação por carregamento. `getForUpdate` de jogador sem carteira lança `WalletNotFoundError` (`WALLET_NOT_FOUND`). Os dois erros ficam em `wallet/domain`, junto da interface | Implementa a segunda barreira da D45. Todo jogador tem carteira, então carteira ausente é bug, não `null` |
| D54 | **Testes de concorrência dos locks** usam duas transações reais e promessas de controle para forçar a ordem (T1 segura o lock até um sinal; T2 tenta o mesmo lock) e provam que T2 só termina depois do commit de T1 e enxerga o valor dele | Teste determinístico, sem depender de `sleep`; é a base dos testes de concorrência da seção 12 no M3 |
| D55 | **Casos de uso em TypeScript puro.** As classes de `application/` não importam NestJS nem MikroORM; os módulos do Nest as montam com `useFactory`. O `domain/` e o `application/` de um contexto só importam o próprio contexto e o `shared/`. Um teste de arquitetura verifica as duas regras. Todo caso de uso lê o `Clock` uma vez, no início do `execute` e antes da transação, e repassa o `now` (D29); segue "carregar, alterar, gravar uma vez" (D53). Ids e seeds vêm das portas `IdGenerator` e `SeedGenerator` (D22) | A aplicação continua testável sem framework; a regra de dependência da seção 5 passa a ser verificada, como a D47 |
| D56 | **`UnitOfWork`** (porta em `shared/application`): `run(work: (tx) => Promise<T>)`. A implementação abre `orm.em.transactional` e entrega ao `work` os `MikroOrm*Repository` criados com o `em` daquela transação (D50). Cada caso de uso tipa só as dependências que usa (`UnitOfWork<{ bets; rounds; wallet }>`). Entre contextos, a conversa é por portas declaradas na aplicação de quem chama e satisfeitas por tipagem estrutural (ex.: `WalletPort` em `bets/application`, implementada pelo `wallet/application`). O `MikroORM` é criado por um provider próprio, sem `@mikro-orm/nestjs`, e fechado no shutdown | Fronteira de transação explícita, sem AsyncLocalStorage: um repositório nunca cai no EM global sem querer. O tipo impede que um caso de uso alcance o repositório de outro contexto |
| D57 | **Ordem de locks: rodada → aposta → carteira.** Aposta: rodada `FOR SHARE`, carteira `FOR UPDATE`. Cash out: lê a aposta sem lock para achar a rodada, depois rodada `FOR SHARE`, aposta `FOR UPDATE` e carteira `FOR UPDATE`. `start()` e `crash()` com a liquidação carregam a rodada `FOR UPDATE`. O `RoundRepository` ganha `findCurrentForShare`, `findByIdForShare` e `getForUpdate` (exigem transação, como na D50) | Sem o lock na rodada, a liquidação pode gravar `LOST` por cima de um cash out em andamento, e uma aposta que esperou o lock da carteira pode entrar numa rodada já iniciada ou liquidada. Com ele, o loop espera as operações em andamento e quem chega depois vê o novo status. A ordem fixa evita deadlock |
| D58 | **Erros → HTTP** por um filtro global com uma tabela `code → status`: 400 (entrada inválida, `INVALID_BET_AMOUNT`, header de idempotência), 401 (`UNAUTHORIZED`), 404 (`BET_NOT_FOUND`, `ROUND_NOT_FOUND`), 409 (`ROUND_NOT_ACCEPTING_BETS`, `BET_ALREADY_PLACED`, `ROUND_NOT_RUNNING`, `BET_NOT_PENDING`, `TOO_LATE`, `SECRET_NOT_REVEALED`), 422 (`INSUFFICIENT_BALANCE`, `IDEMPOTENCY_KEY_REUSED`) e 500 explícito para bugs (`CORRUPTED_*`, `WALLET_NOT_FOUND`, `WALLET_VERSION_CONFLICT`, transições inválidas), com mensagem genérica e o erro no log. Os erros do próprio Nest saem como `{ code, message }`. Um teste falha se algum `code` de `src/` ficar fora da tabela ou se a tabela citar um código que não existe. Validação de entrada em funções puras, sem class-validator nem zod. Erros de formato dos VOs (`INVALID_MONEY`, `INVALID_SERVER_SEED`, `INVALID_ROUND_ID`...) são 500, então o HTTP valida tudo o que vem do cliente antes do domínio, inclusive os ids na URL: id malformado em `GET /rounds/:id/verify` e `POST /bets/:id/cashout` responde 400 `VALIDATION_ERROR`, com teste E2E | Todo erro novo precisa ser classificado; bug não vaza detalhe ao cliente. Os corpos são mínimos e não justificam dependência |
| D59 | **Guest e autenticação:** token de 32 bytes aleatórios em base64url, guardado como `sha256` hex em `token_hash`. O `AuthGuard` resolve o `Bearer` para `{ id, nickname }`; ausente ou inválido → 401 `UNAUTHORIZED`. Nickname aparado e restrito a `^[A-Za-z0-9_-]{3,16}$`, sem unicidade. Jogador e carteira (`Wallet.open`) nascem na mesma transação; o `players` (sem DDD) abre a carteira pelo `wallet/application` | O nickname é transmitido a todos pelo WS. Sem jogador sem carteira (D53) |
| D60 | **Idempotência na transação do caso de uso**, sem middleware do Nest. O HTTP valida o header (ausente → 400 `IDEMPOTENCY_KEY_REQUIRED`; não UUID → 400 `INVALID_IDEMPOTENCY_KEY`). Na transação, um `pg_advisory_xact_lock` por (jogador, chave) serializa as requisições com a mesma chave; a resposta salva é devolvida se `endpoint` (com o id real, ex.: `POST /bets/<id>/cashout`) e `request_hash` coincidirem, e qualquer diferença responde 422 `IDEMPOTENCY_KEY_REUSED`. `request_hash` é o SHA-256 hex do JSON canônico (chaves ordenadas) da entrada já validada, numa migration nova (`varchar(64) not null`; a tabela ainda não tem escritor). Só respostas de sucesso são salvas; erro faz rollback e pode ser repetido. Replay não publica eventos | Dinheiro: a mesma chave com outro valor não pode devolver a resposta de outra operação. O advisory lock dispensa linha "em andamento" no schema |
| D61 | **Game loop como `step()`:** lê o estado do banco e o `now`, executa a ação devida (criar, iniciar, crashar e liquidar) e devolve a espera até a próxima. A recuperação no boot (10.3) é o primeiro `step()`, não um caminho à parte. O crash é agendado por `Round.msUntilCrash(now)` (só em `RUNNING`); como `toSnapshot()`, a chamada só é permitida no game loop, verificada pelo teste da D47. Ticks saem da rodada em memória. Falha no `step()` vai para o log e tenta de novo em 1 s. O loop é ligado no `main.ts`, então os testes sobem a app sem ele e chamam `step()` com `FakeClock` e `SeedGenerator` fixo | Recuperação testada com banco real e `FakeClock`, sem timers. `msUntilCrash` revela `crashAt` a quem o chama (D30) |
| D62 | **Eventos para o WS:** porta `EventPublisher` com implementação em memória, sem `@nestjs/event-emitter`. Os casos de uso publicam os eventos de domínio depois do commit. O gateway (`/ws`, `WsAdapter`) traduz para a seção 8.2; o `nickname` vem de um cache em memória id → nickname, preenchido por consulta no primeiro uso. Heartbeat: ping a cada `WS_HEARTBEAT_MS`, quem não responder é derrubado (D15) | Evento de rollback nunca chega ao cliente. O nickname não muda, então o cache não invalida |
| D63 | **Leituras e contrato:** `GET /rounds/current` é montado a partir do agregado (sem getter de segredo) num DTO sem campos para os segredos; sem rodada aberta, devolve a última crashada, já revelada; com `Bearer` opcional, inclui `myBet`. Histórico e extrato são consultas diretas na infraestrutura; o histórico filtra `status = 'CRASHED'`. DTOs e eventos WS ficam no `@crash/shared`. Instantes trafegam em ms desde a epoch. `POST /bets` responde 201 e o cash out, 200. *(Revisada pela D71: as apostas de `GET /rounds/current` e os eventos de aposta levam `betId`; o `playerId` continua fora.)* | O tipo impede vazar segredo. O cliente que reconecta precisa do `betId` para sacar |
| D64 | **Configuração sem `@nestjs/config`** (reavaliação da D43): a função pura `readAppConfig(env)` lê e valida `PORT`, `DATABASE_URL`, `BETTING_MS`, `TICK_MS`, `PAUSE_MS` e `WS_HEARTBEAT_MS`, com padrões para os tempos, e é fornecida ao Nest por um token | Seis variáveis tipadas e testadas; o `@nestjs/config` traria `dotenv` e um `get<string>()` sem tipo, e a validação seria escrita do mesmo jeito |
| D65 | **`pnpm dev` da api:** `tsc --watch` e `node --watch --env-file-if-exists=../../.env dist/main.js` em paralelo (`pnpm run "/^dev:/"`); o `node --watch` também reinicia quando muda o `dist` do `@crash/shared`. O `tsBuildInfoFile` do `tsconfig.build.json` fica dentro da `dist`: apagar a `dist` apaga o estado incremental junto | O `nest start --watch` não vê mudanças no `shared`, e o M3 mexe nele o tempo todo. `tsx watch` não serve: o esbuild não gera `emitDecoratorMetadata`; com o `.tsbuildinfo` fora da `dist`, um clone sem `dist` (ou uma `dist` apagada) fazia o `tsc` incremental se dar por em dia sem gerar nada |
| D66 | **E2E** (`*.e2e-spec.ts`, `test:e2e`) usam o mesmo `globalSetup` e o mesmo `TRUNCATE` da integração, com arquivos em sequência, e rodam no job `integration` do CI. O cliente WS dos testes é o `WebSocket` global do Node, sem `ws` nem `@types/ws` | Mesmo banco de teste (D39, D40); nenhuma dependência nova |
| D67 | **Consultas de leitura podem cruzar contextos.** A restrição da D48 (cada contexto só consulta e grava as próprias tabelas) vale para os **repositórios**, que carregam agregados e gravam. As consultas de leitura da D63 (`*Queries` em `infrastructure/`) podem fazer join com tabelas de outros contextos, como `BetQueries.betsOf` com `players` para trazer o nickname, desde que não alterem nada e devolvam DTOs, nunca agregados | Leitura não muda estado, então não ameaça as invariantes que a separação dos contextos protege. O join evita uma consulta extra por tela só para buscar nicknames |
| D68 | **Detalhes do WebSocket:** (1) o `round:tick` leva `multiplierAt(now − startedAt)` do `@crash/shared`, calculado a partir do `startedAt` do evento e do `Clock`, **sem teto no crash point**; os ticks começam no `RoundStarted` e param no `RoundCrashed`. (2) O broadcast processa os eventos numa fila única, na ordem em que foram publicados, mesmo com a consulta assíncrona do nickname. (3) Mensagens enviadas pelo cliente são ignoradas (canal só de leitura, seção 8.2) | (1) O teto exigiria conhecer o crash point (D30); sem ele, o tick só depende do evento e do relógio. Um tick acima do crash point, se o loop atrasar o crash, não revela nada, porque cash out depois de `crashAt` já é `TOO_LATE`. (2) Sem a fila, um `bet:placed` esperando o nickname poderia sair depois do `round:started` seguinte. (3) O cliente não age pelo WS (D4) |
| D69 | **CORS restrito à origem do front.** `WEB_ORIGIN` é obrigatória no `readAppConfig`: ausente ou vazia, o boot falha. É validada como origem pura (`new URL(raw).origin === raw`, http ou https), recusando `*`, caminho, barra final, query, credenciais e lista; quando existe forma normalizada, a mensagem de erro a mostra (ex.: `HTTP://LOCALHOST:5173` → `http://localhost:5173`). `configureApp(app, config)` é usada pelo `main.ts` e pelo `createTestApp`. `enableCors` com `origin` em função (igualdade exata), `methods` GET e POST, `allowedHeaders` `Authorization`, `Content-Type` e `Idempotency-Key`, sem credentials. Só o boot do Nest lê `WEB_ORIGIN`: a CLI do MikroORM usa `readDatabaseConfig`, e os testes trocam o `APP_CONFIG` | Nunca `*`. A falha no boot explica o erro de deploy no log, em vez de um erro de CORS no navegador. Com `origin` em função, o pacote `cors` não escreve header nenhum para a origem recusada (com array, mandaria `Allow-Methods`). O E2E testa o mesmo código do boot. CORS protege o navegador; não é autenticação |
| D70 | **Origem do WebSocket.** `OriginCheckedWsAdapter` (estende o `WsAdapter`) injeta `verifyClient` no servidor `ws`: origem diferente da `WEB_ORIGIN`, ou ausente, recebe 403 no handshake. O cliente de teste manda `Origin` (o `WebSocket` do Node aceita `headers`) | O decorator `@WebSocketGateway` é estático e não lê a configuração. Recusar no handshake evita abrir a conexão. Protege só contra páginas de outra origem no navegador (CSWSH); um cliente fora do navegador falsifica o header (seção 14) |
| D71 | **`betId` público** em `bet:placed`, `bet:cashed_out` e nas apostas do `GET /rounds/current` (`RoundBetDto`); revisa a D63. O `playerId` continua fora dos eventos e do `RoundBetDto` | O nickname não é único (D59): sem id, o front não sabe qual aposta sacou nem deduplica o buffer da ressincronização (D76). O `betId` não dá poder a ninguém: o cash out exige `Bearer` e posse (D33) |
| D72 | **Regras do nickname no `@crash/shared`:** `NICKNAME_MIN_LENGTH` (3), `NICKNAME_MAX_LENGTH` (16), `NICKNAME_PATTERN` (montado a partir dos dois) e `parseNickname(raw): string \| null` (apara e valida; regex sem flag `g`). O `parseGuestBody` da api e o formulário do front usam a mesma função; o front usa as constantes no `maxLength` do input e na mensagem, e a api, na mensagem de erro | Uma fonte só, como os limites de aposta (D36). Sem `g`, o `test` não guarda `lastIndex` entre chamadas |
| D73 | **Configuração do front:** a função pura `readWebConfig(env)` lê `VITE_API_URL` do `.env` da raiz (`envDir`); a URL do WS é derivada (`http→ws`, `https→wss`, mais `/ws`); o padrão `http://localhost:3000` vale só em dev, e o build de produção falha sem a variável. Sem proxy do Vite | Uma variável só. Sem proxy, o dev é de origem cruzada como a produção (Netlify → Railway/Render), e o CORS da D69 é exercitado todo dia |
| D74 | **Relógio do cliente:** base local `performance.now()`, monotônica; `serverNow() = performance.now() + offset`. Cada mensagem do WS e cada resposta do `GET /rounds/current` gera a amostra `serverTime − recebidoEm`; o offset é o **máximo** das amostras dos últimos 10 s e, com a janela vazia, fica a última estimativa. A janela é zerada a cada ressincronização e recomeça pela amostra do snapshot; as amostras das mensagens do buffer entram depois dela. O `payload.multiplier` do tick não é usado | O `serverTime` é lido no envio (seção 8.2), então toda amostra é `offset real − latência de ida`, um limite inferior: a melhor é a de menor latência, e uma amostra atrasada não puxa a estimativa (a média puxaria). Viés: o multiplicador exibido fica atrás pela menor latência de ida, o lado conservador. O `Date.now()` salta com ajustes do relógio do sistema; o `performance.now()` não salta, mas pode parar na suspensão do aparelho, por isso a janela recomeça a cada ressincronização. O tick não tem teto (D68) |
| D75 | **Store:** uma instância do Zustand `createStore` (vanilla), lida pelo React com `useStore(store, seletor)` e pelo Pixi com `subscribe` (D10). Redutores puros e idempotentes (`applySnapshot`, `applyMessage`); apostas indexadas por `betId`; mensagem de outra rodada é ignorada, exceto `round:betting`. O multiplicador nunca entra na store: quem desenha calcula `multiplierAt(serverNow() − startedAt)` a cada frame e, em `CRASHED`, mostra o `crashPoint` exato. O `myBet` só muda pela resposta REST do jogador, pelo snapshot (que o back identifica por `playerId`) ou por mensagem com o mesmo `betId`, nunca pelo nickname. Store, clientes e conexão são criados no `main.tsx`, fora do React | 60 atualizações por segundo na store re-renderizariam o React. Redutores idempotentes permitem reaplicar eventos depois do snapshot. Fora do React, o StrictMode não abre dois WebSockets |
| D76 | **Conexão WS:** estados `connecting`, `syncing`, `live` e `waiting`. Um caminho só para a primeira conexão, a reconexão e a ressincronização depois de um 409 de estado: entra em `syncing`, chama `GET /rounds/current`, aplica o snapshot e reprocessa o buffer. Na `syncing`, as mensagens vão para um buffer; depois do snapshot, as de `serverTime < snapshot.serverTime` são descartadas, as outras aplicadas na ordem, e os ticks descartados. Cada conexão tem geração e `AbortController`: `dispose()` e fechamento abortam o GET, e um GET de geração antiga não aplica o snapshot. Timeout de 10 s no GET; falha → fecha e entra no backoff. Backoff full jitter, `random() × min(10 s, 500 ms × 2^tentativa)`, zerado depois de ressincronizar; o evento `online` reconecta na hora. Vigia de silêncio: 30 s sem mensagem (em `BETTING`, até `bettingEndsAt + 30 s`) fecha o socket; o prazo é conferido no disparo | Um caminho de recuperação, como a D61. O `serverTime` do GET é lido antes das consultas: evento publicado antes dele já está no snapshot, e sem o descarte um `round:betting` antigo faria a rodada regredir. O navegador não expõe ping/pong ao JS e pode não perceber conexão meio aberta; o maior silêncio legítimo com os padrões é 10 s. Conferir no disparo evita fechar cedo quando o navegador atrasa timers em aba de fundo. O jitter espalha as reconexões depois de uma queda da API |
| D77 | **Sessão do guest no `localStorage`** (`crash.session`: `{ playerId, nickname, token }`). Um 401 apaga a sessão, volta ao formulário de guest e refaz o `GET /rounds/current` sem `Bearer` uma vez só, sem laço | Recarregar a página mantém a sessão e o `myBet` (D63). `sessionStorage` criaria um guest por aba; cookie HttpOnly exigiria mudar a autenticação e seria cookie de terceiros entre o Netlify e a API. Custo: XSS lê o token, que não expira (seção 14) |
| D78 | **Cliente REST:** `fetch` injetado; erro com corpo vira `ApiError { status, code, message }` e falha de rede, `NetworkError`. Uma `Idempotency-Key` (`crypto.randomUUID()`) por clique; até 2 retentativas com a **mesma** chave em falha de rede, timeout de 10 s ou 502/503/504, nunca em 500 nem em 4xx. Os 409 de estado (`ROUND_NOT_ACCEPTING_BETS`, `BET_ALREADY_PLACED`, `ROUND_NOT_RUNNING`, `BET_NOT_PENDING`, `TOO_LATE`) disparam a ressincronização; o 422 não. Tabela `code → mensagem` em pt-BR, com mensagem genérica para o resto. O botão fica desabilitado durante a operação inteira, retentativas incluídas | É para isso que a D5 existe: pela D60, a requisição com a mesma chave espera o advisory lock e recebe o replay (E2E `K1`); não há 409 de "chave em uso". O 500 é bug (D58), e retentar não ajuda. Um 409 de estado diz que o estado local estava errado |
| D79 | **Valor digitado da aposta:** `parseCreditsInput` converte texto em centavos sem float; aceita `,` ou `.` como separador decimal, até 2 casas, sem separador de milhar (`"1.000"` e `"1,000"` são recusados), e valida com `MIN_BET_CENTS` e `MAX_BET_CENTS` (D36) | O teclado decimal de alguns celulares só tem `.`. Recusar 3 casas evita ler "mil" como 1,00; com o teto de 1.000,00, separador de milhar não faz falta |
| D80 | **Verificação no front:** o histórico abre os dados de `GET /rounds/:id/verify` (seed, hash e crash point) e confere `SHA-256(seed) === seedHash` com Web Crypto; o crash point não é recalculado no navegador, e o README ensina a conferir por fora | A conferência do hash é nativa e curta; portar a fórmula ficou fora do escopo (7.2) |
| D81 | **Estilo e tema:** CSS Modules com variáveis CSS (`tokens.css`) e fontes do sistema, sem dependência. Tema original da **pipa**: a pipa sobe com o vento, e o crash é a linha que se rompe; paleta de céu de fim de tarde (azul-escuro, âmbar, turquesa). No M4 entram paleta, tipografia e layout; a arte é do M5 | Zero de runtime e nenhuma requisição de fonte, pela meta de 2 s em 4G (11.3). O tema não copia jogos existentes (11.2) |
| D82 | **Testes do front:** Vitest com ambiente `node` por padrão e jsdom só nos testes de componente; `@testing-library/react`, `@testing-library/dom` e `@testing-library/user-event`, sem jest-dom; fakes próprios (`fakeFetch`, `FakeWebSocket`, `random` e `now` injetados), sem MSW; backoff e vigia com `vi.useFakeTimers` | A lógica testa rápido sem DOM. Injeção no lugar de interceptar a rede é o mesmo padrão das portas do back, sem dependência. Cada dependência nova é justificada no commit que a instala |
| D83 | **Pastas do `apps/web/src`:** `app/` (composition root, ações e sessão), `net/` (REST, conexão WS, backoff, relógio, erros), `store/`, `ui/`, `game/` (palco 1280×720 e, no M5, o Pixi), `format/` e `config.ts`. Só o `app/` liga `net/` e `store/`; a UI chama as ações do `app/` | As ações precisam de um dono que não seja a store nem os componentes (11.1) |
| D84 | **Sem E2E de navegador no M4.** O front é coberto por testes com fakes, pelos contratos tipados do `@crash/shared` e por roteiro manual. O Playwright é decidido no M6/M7, rodando no host e no CI | Os binários dos navegadores não cabem no AI Jail sem afrouxar a D18, e o E2E exigiria API, banco e front de pé |
| D85 | **O build de produção do web falha sem `VITE_API_URL`.** O `vite.config.ts` chama `assertBuildEnv(loadEnv(...), mode)` no `vite build`; em `production`, ela reusa o `readWebConfig` e lança sem a variável ou com origem inválida. O CI define `VITE_API_URL` no passo de build. Completa a D73, cujo texto já pedia a falha no build | Sem a checagem, o `readWebConfig` só rodava no navegador: o build passava e a página publicada quebrava ao abrir. Um erro de deploy deve aparecer no build, não para o jogador |
| D86 | **A verificação compara a seed com o hash publicado antes do crash.** A store guarda o `seedHash` de cada rodada vista ao vivo (até 21: as 20 do histórico e a atual), vindo do `round:betting` ou de um snapshot com a rodada em `BETTING` ou `RUNNING`. Snapshot com a rodada já em `CRASHED` e o `round:crashed` não contam, porque o hash chega junto com a seed. Para uma rodada não vista ao vivo, o painel compara com o hash da própria resposta do `verify` e avisa que isso não prova a fixação. O painel diz o que a conferência prova e aponta o comando HMAC do README para o crash point (D80) | Comparar com o hash da mesma resposta que traz a seed não prova nada: um servidor desonesto mandaria os dois combinados. A garantia do provably fair (D7) é a seed bater com o hash anunciado antes das apostas |
| D87 | **Coreografia da cena (tema da pipa, D81).** Pipa procedural em `Graphics` (losango, varetas, rabiola), fio da âncora (canto inferior esquerdo) até a pipa e rastro com a curva do multiplicador; sem assets externos. O céu é o gradiente CSS do palco, com o canvas transparente. Cores em constantes TS (`game/scene/palette.ts`, `0xRRGGBB`, com os nomes dos tokens), e um teste falha se alguma divergir do `tokens.css`. **Câmera:** eixos lineares (x = tempo decorrido, y = multiplicador), janela `xMax = max(8 s, elapsed / 0,8)` e `yMax = max(2,00x, 1 + (m − 1) / 0,75)`, que só cresce durante a rodada; a pipa fica dentro de 80% × 75% da área útil. **BETTING:** pipa pousada perto da âncora, balanço em função do `serverNow`, sem rastro (o tempo restante fica no contador em texto, D100). **RUNNING:** pipa em `project(elapsed, displayMultiplier)`, fio em curva e rastro desde `t = 0`. **CRASHED:** o fio se rompe e recolhe, a pipa gira, cai e some em 1,2 s, com o progresso `max(0, serverNow − crashedAt)`; a posição congela em `timeToCrash(crashPoint)` | Tema original (11.2). Com a animação em função do `crashedAt`, quem chega por snapshot depois do crash vê o quadro final, e a cena não guarda estado de tempo. Congelar no crash point cumpre o item do backlog de corrigir o multiplicador exibido (D68, D11). As cores em TS evitam ler variáveis CSS no mount, que o jsdom não resolve; o teste impede que as duas fontes divirjam |
| D88 | **Lógica pura separada do Pixi.** `game/scene/` é puro e roda no ambiente `node`: `camera`/`project` e `writeFrame(out, round, serverNow, { reducedMotion })`, que preenche um `FrameModel` reutilizável (fase, pose da pipa, fio, rastro num `Float32Array` de 48 pontos, paleta). `game/pixi/pixi-scene.ts` é o adaptador fino: cria a árvore uma vez, `draw(model)` só atribui propriedades e redesenha os `Graphics`, `destroy()` destrói tudo. O `GameCanvas` cuida do ciclo de vida, com renderer e carregador injetáveis. Os testes do adaptador usam objetos reais do Pixi sem renderer se funcionarem no Vitest em `node` (spike da F4); se não, uma fábrica fake. Pixels e WebGL ficam no roteiro manual | O jsdom não tem WebGL. Tudo o que é número fica testado sem DOM; o adaptador fica fino o bastante para que o roteiro manual cubra o resto |
| D89 | **Um relógio só.** `createFrameLoop` (`app/`), criado no `main.tsx` e entregue pelo `GameProvider`: um único `requestAnimationFrame`, que lê o `serverNow()` uma vez por frame e chama os assinantes com o mesmo valor; para quando não há assinantes; um assinante que lança vai para o log sem parar os outros. O `MultiplierText` assina o loop. O Pixi roda sem ticker: `autoDetectRenderer` + `Container` + `renderer.render(stage)` dentro do loop, em vez de `Application` | Texto e pipa concordam no mesmo frame; o texto anima antes de o Pixi carregar e depois de ele falhar; os testes seguem com o `fakeFrames`. Dois laços (rAF próprio e ticker) leriam o relógio em instantes diferentes |
| D90 | **Multiplicador em texto DOM sobre o canvas**, não em `Text` do Pixi. O `MultiplierText` continua `aria-hidden`, e o `RoundAnnouncer` continua sendo a única região `aria-live`. O canvas recebe `aria-hidden="true"`, `role="presentation"` e `pointer-events: none` | Funciona sem WebGL e com o chunk do Pixi ainda carregando, fica nítido em qualquer escala e não rasteriza textura de fonte a cada frame. A acessibilidade não muda em relação ao M4, e o canvas nunca captura cliques do painel |
| D91 | **Ciclo de vida da cena.** O `useEffect` chama `mountScene(host, deps)`, que devolve um `dispose()` síncrono. O init assíncrono roda com uma flag `disposed`: se o `dispose()` vier antes, o renderer é destruído assim que o init resolver, e o canvas nunca entra no DOM. O `dispose()` cancela as assinaturas do frame loop, da store, do `matchMedia` e dos eventos de contexto, e chama `destroy({ removeView: true }, { children: true, texture: true, textureSource: true, context: true })`. A store é lida por `subscribe` (D10): a assinatura guarda a rodada mais recente, que o frame usa | No Pixi 8, `destroy()` antes do init resolver lança erro (o `renderer` ainda não existe). O StrictMode de dev monta duas vezes: por um instante existem dois contextos WebGL, o que é aceito |
| D92 | **Renderer e falhas.** `preference: ['webgl', 'canvas']`, sem WebGPU. Init rejeitado ou chunk da cena que falhou na rede: sem canvas, com o texto e o painel funcionando e o erro no `console.warn`, sem mensagem na tela. `webglcontextlost` para de desenhar e esconde o canvas; `webglcontextrestored` volta a desenhar | O Pixi 8 tem renderer Canvas 2D com `Graphics`, que cobre quem não tem WebGL. O WebGPU é menos maduro em celular e seria mais um chunk. O jogo continua inteiro sem a cena, então não há o que avisar |
| D93 | **Resolução, antialias, aba oculta e movimento reduzido.** `resolution = clamp(fitScale × min(devicePixelRatio, 2), 0,25, 2)`: backing de no máximo 2560×1440. O canvas mantém o CSS em 1280×720 (`autoDensity: false`), o `GameStage` publica a escala, e escala 0 não redimensiona. Resize anterior ao init é guardado e aplicado quando o renderer existir. O `antialias` é decidido uma vez, no init, pelo DPR daquele momento (ligado só com `min(DPR, 2) < 2`). Sem handler de `visibilitychange`. Com `prefers-reduced-motion`: sem balanço e sem a queda (quadro final direto); a pipa continua subindo | O palco é escalado por `transform`: com `resolution = DPR`, um celular com DPR 3 desenharia 3840×2160 para mostrar ~1080 px físicos, e um monitor grande com DPR 2 passaria de 5K. O antialias é opção de criação do contexto e não muda depois. O rAF já para em aba oculta, e o frame é função do `serverNow`, então não há salto na volta. A subida da pipa é a informação do jogo, não decoração |
| D94 | **Cena por import dinâmico.** O `GameCanvas` carrega o adaptador e o `pixi.js` com `import()`; o primeiro render (painel, texto, histórico) não espera. O carregamento é medido por FCP/LCP e pelas marcas `app:first-render` (texto visível e jogável) e `scene:first-frame`; a meta de < 2 s em 4G (11.3) vale para o `app:first-render` | O Pixi é maior que o bundle inteiro do M4 (79 kB gzip). No chunk principal, ele atrasaria a primeira tela jogável por algo que é só visual |
| D95 | **Nenhum objeto Pixi por frame.** `Container` e `Graphics` nascem na montagem; elemento oculto fica com `visible = false` em vez de sair da árvore. Fio e rastro usam `Graphics.clear()` e redesenho com os pontos do buffer pré-alocado. `FrameModel` e buffer são reutilizados (teste de identidade) | Cumpre a 11.3. O `clear()` reconstrói a geometria, mas não cria objetos; se o profiling mostrar pausas de GC, a alternativa é `MeshRope` com pontos mutáveis |
| D96 | **`Idempotency-Key` sem `crypto.randomUUID`.** `app/idempotency-key.ts` monta um UUID v4 (RFC 9562) com 16 bytes de `crypto.getRandomValues`. Um teste de varredura impede `randomUUID` em `apps/web/src` fora dos testes. Revisa a D78 só na origem da chave | O `randomUUID` só existe em contexto seguro; o `getRandomValues` existe também em HTTP. Assim dá para apostar abrindo o front pelo IP da rede local (D98). A api aceita qualquer UUID canônico |
| D97 | **Medição (11.3).** Carregamento: Lighthouse mobile do Chrome (Slow 4G + CPU 4×) e DevTools Network "Fast 4G", sobre `vite build` + `vite preview`, com a API de pé e cache desligado; mediana de 5 execuções. fps: medidor próprio ligado por `?fps`, num chunk à parte carregado só com o parâmetro, que funciona no build de produção; usa os timestamps do frame loop e mostra média, "1% low" e frames acima de 50 ms. Duas medições: rodada curta (~10 s) e longa (> 60 s). Antes e depois de duas otimizações: import dinâmico (D94) e resolução pela escala do palco (D93), com a versão simples commitada antes de cada uma | Mede-se o build de produção, não o dev. O Firefox não tem CPU throttling nem Lighthouse, então a medição de 4G usa o Chrome. O medidor próprio funciona em Android e iOS, sem depender de profiler remoto. Com a versão simples no histórico, o antes e depois fica verificável |
| D98 | **Front no celular pela rede local (opção A).** Para medir, troque temporariamente `WEB_ORIGIN` para `http://<IP>:5173` e `VITE_API_URL` para `http://<IP>:3000`, e sirva o build com `vite preview --host --port 5173 --strictPort` (com o dev do web parado). Ao terminar, volte para `localhost`. Pelo IP em HTTP não há `crypto.subtle`: a verificação aparece como indisponível (D80, D86), e o resto do jogo funciona (D96) | A D69 e a D70 ficam intactas, sem código novo, e a rede local dá latência estável. Lista de origens mudaria a D69, e túnel ou certificado local trariam ferramenta nova e latência de terceiros. O HTTPS de verdade chega com o deploy (M7). A 5173 já é publicada pelo jail |
| D99 | **`pixi.js` (8.22) só no `apps/web`**, fora do catalog (D17). Na instalação, nenhuma dependência transitiva roda script de build sem registro na D46 | Só o front usa. O catalog é para versões compartilhadas entre pacotes |
| D100 | **Contador de segundos restantes da janela de apostas, em texto DOM.** Mostra `ceil((bettingEndsAt − serverNow) / 1000)`; some fora de BETTING e com o prazo vencido (sem negativo nem "0"). Assina o frame loop (D89), sem rAF nem leitura de relógio próprios, e escreve no `textContent` só quando o segundo muda, sem re-render. É `aria-hidden`: a única região `aria-live` continua sendo o `RoundAnnouncer`. Sem barra proporcional no M5; a barra fica opcional para o M6, com a duração da janela no contrato do `round:betting` | O cliente não conhece o `BETTING_MS` (D64): uma barra proporcional exigiria fixar a duração no front, um acoplamento escondido, ou mudar o contrato. Os segundos restantes só dependem do prazo, que o cliente já tem. Hoje o jogador não vê quanto tempo falta para apostar |

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
│   │       │   ├── domain/          # Round, CrashPoint, ServerSeed, SeedHash, eventos, interface do repositório
│   │       │   ├── application/     # casos de uso: StartRound, CrashRound, GetCurrentRound, VerifyRound
│   │       │   └── infrastructure/  # entidades MikroORM, repositório, GameLoopService, gateway WS, controller
│   │       ├── bets/
│   │       │   ├── domain/          # Bet, regras de aposta e cash out
│   │       │   ├── application/     # PlaceBet, CashOut, SettleRound
│   │       │   └── infrastructure/
│   │       ├── wallet/
│   │       │   ├── domain/          # Wallet, LedgerEntry
│   │       │   ├── application/
│   │       │   └── infrastructure/
│   │       ├── players/             # guest + autenticação por token (sem DDD, é infraestrutura)
│   │       └── shared/
│   │           ├── domain/          # shared kernel (D25): Money, Multiplier, interface Clock
│   │           └── infrastructure/  # idempotência, filtros de erro, relógio do sistema
│   └── web/
│       └── src/
│           ├── app/                 # composition root, ações e sessão (D83)
│           ├── net/                 # conexão WS (reconexão, ressincronização), cliente REST, relógio
│           ├── store/               # Zustand
│           ├── ui/                  # componentes React
│           ├── game/                # palco 1280×720, frame da cena (scene/, puro) e adaptador PixiJS (pixi/)
│           └── format/              # créditos e multiplicador: formatação e leitura
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

A interface `Clock` (`now(): number` em ms) fica em `shared/domain/`. A camada de aplicação lê o relógio **uma vez por operação** e repassa o instante aos agregados como `now: number` (D29). Nos testes, use o `FakeClock` de `shared/testing/`. Nunca chame `Date.now()` dentro do domínio.

---

## 6. Domínio

### 6.1 Value objects

| VO | Regras |
|---|---|
| `Money` | Inteiro em centavos, ≥ 0. Operações `add`, `subtract` (lança erro se ficar negativo) e `multiply(multiplier)` com arredondamento **para baixo** |
| `Multiplier` | Entre 1.00 e 1.000.000,00 (teto da D24), com duas casas decimais. Guardado internamente como inteiro ×100 (ex.: 1.57 → 157) |
| `ServerSeed` | 32 bytes aleatórios, representados como string hex de 64 caracteres. Nunca exposto antes do crash. O domínio só a reconstrói (`fromHex`); a geração aleatória fica na aplicação (D22) |
| `SeedHash` | `sha256(serverSeed)` em hex, calculado sobre a string hex em UTF-8 (D23). Publicado no início da rodada |

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
- `serverSeed`, `crashPoint` e `crashAt` só são expostos quando `status === CRASHED` (D30). Antes disso, nenhum getter, evento ou resposta HTTP os revela; as regras que dependem deles são métodos do próprio `Round` (`acceptsBetsAt(now)`, `acceptsCashOutAt(now)`).
- `start(now)` exige `now ≥ bettingEndsAt` (senão `BettingWindowOpenError`); `crash(now)` exige `now ≥ crashAt` (senão `CrashBeforeCrashAtError`). Na recuperação no boot, `now` pode estar bem depois do prazo: `startedAt` e `crashedAt` recebem esse `now`.
- `multiplierAt(now)` só é definido em `RUNNING` e nunca passa de `crashPoint`: vale `min(multiplierAt(now − startedAt), crashPoint)`. O `min` é necessário porque, acima de ~100x, o multiplicador sobe vários centésimos por milissegundo.

### 6.3 Agregado `Bet`

| Campo | Descrição |
|---|---|
| `id` | UUID |
| `roundId`, `playerId` | Uma aposta por jogador por rodada |
| `amount` | `Money` > 0 |
| `status` | `PENDING`, `CASHED_OUT` ou `LOST` |
| `cashoutMultiplier` | Definido no cash out |
| `payout` | `amount × cashoutMultiplier`, arredondado para baixo |
| `placedAt` | Instante da aposta (`now` do `place`, D45) |

Invariantes:
- Só pode ser criada se a rodada estiver em `BETTING` e `now < bettingEndsAt`.
- Valor mínimo de 1,00 crédito e máximo de 1.000,00 (`MIN_BET_CENTS` e `MAX_BET_CENTS` do `@crash/shared`, D36).
- Cash out só se a aposta estiver em `PENDING` (senão `BET_NOT_PENDING`), a rodada em `RUNNING` (em `BETTING`: `ROUND_NOT_RUNNING`) e `now < crashAt` (senão, ou se a rodada já crashou, `TOO_LATE`; D34).
- Uma aposta por jogador por rodada e posse da aposta são verificadas pela aplicação e pelo banco, não pelo agregado (D33). O agregado consulta a rodada pela interface `RoundView` (D32).
- O multiplicador do cash out é calculado **pelo servidor** com `multiplierAt(now)`. O cliente nunca informa o multiplicador.
- Quando a rodada termina, todas as apostas `PENDING` viram `LOST`, pelo serviço de domínio `settleBets(round, bets)`, que devolve `BetsSettled` (D35).

### 6.4 Agregado `Wallet`

- Um por jogador. Saldo inicial: **1.000,00 créditos** (100000 centavos).
- `debit(amount)` lança `InsufficientBalanceError` se o saldo ficar negativo.
- Toda movimentação gera um `LedgerEntry` (`BET_PLACED`, `CASHOUT`, `INITIAL_GRANT`), com valor em centavos com sinal (débito negativo), `betId` quando houver e `createdAt`. O `LedgerEntry` não tem `id` no domínio; o banco gera (D37).
- Invariante: o saldo é sempre igual à soma do extrato. Isso vira um teste no domínio (carteira aberta em memória) e no banco (`SUM(amount) = balance`).
- Reconstruída do banco com saldo e `version`, sem o extrato completo; os lançamentos novos saem por `pullNewEntries()` para o repositório gravar (D45).

### 6.5 Eventos de domínio

`RoundCreated`, `RoundStarted`, `RoundCrashed`, `BetPlaced`, `BetCashedOut`, `BetsSettled`.

Payloads dos eventos da rodada (D31): `RoundCreated { roundId, seedHash, bettingEndsAt }`, `RoundStarted { roundId, startedAt }` e `RoundCrashed { roundId, crashPoint, serverSeed, crashedAt }`. Nenhum evento anterior ao crash carrega `crashPoint`, `crashAt` ou `serverSeed` (D30).

Na infraestrutura, o gateway WS escuta esses eventos e faz o broadcast correspondente (seção 8.2).

Estes são eventos de **domínio**, internos à API. O `RoundSettled` da seção 14 é um evento de **integração**, publicado para outros sistemas, e não substitui o `BetsSettled` (D26).

---

## 7. Fórmulas (em `packages/shared`, exceto a geração do crash point)

### 7.1 Multiplicador em função do tempo

Multiplicadores são inteiros ×100 (D21).

```
r = 0.00006                                               // taxa de crescimento por ms
multiplierAt(elapsedMs)       = floor(100 × e^(r × max(elapsedMs, 0)))     // ×100
timeToCrash(crashPointX100)   = ceil(ln(crashPointX100 / 100) / r)          // ms inteiros
```

Referências: 2,00x em ~11,6 s; 10,00x em ~38 s; 100,00x em ~77 s; 1.000.000,00x (teto) em ~230 s.

### 7.2 Crash point (provably fair, inspirado no modelo do Bustabit)

Fica **só no back-end** (`rounds/domain`).

Codificação (D23): `serverSeed` é a string hex de 64 caracteres, usada em UTF-8; `roundId` é o UUID em minúsculas, com hífens. O resultado é o crash point ×100 (D21). Toda a aritmética de `h` é inteira e exata (`BigInt`, D27); `div` é a divisão inteira, que arredonda para baixo.

```
seedHash = SHA256(serverSeed)                            // hex
hmac     = HMAC_SHA256(key = serverSeed, message = roundId)
h        = inteiro dos primeiros 13 caracteres hex de hmac   // 52 bits
e        = 2^52

se h % 33 === 0:   crashPointX100 = 100                  // crash instantâneo (~3% das rodadas)
senão:             crashPointX100 = (100 × e − h) div (e − h)   // divisão inteira exata (D27)
crashPointX100 = min(crashPointX100, 100_000_000)        // teto de 1.000.000,00x (D24)
```

Números de referência (simulação de 200 mil rodadas): ~3% de crash instantâneo pelo `h % 33`; ~4% do total termina em 1,00x, porque a própria fórmula dá 1,00x quando `h / e < 0,01`; mediana ~1,92x; retorno esperado ~0,96 para qualquer alvo de cash out, ou seja, **~4% de vantagem da casa**.

Verificação pública (`GET /rounds/:id/verify`): devolve `serverSeed`, `seedHash` e `crashPoint`. Quem verifica (qualquer pessoa, por fora do app) confere que `sha256(serverSeed) === seedHash` e recalcula o crash point. A verificação dentro do app web exigiria portar a fórmula para o `shared` com Web Crypto e fica fora do escopo.

Testes obrigatórios: valores conhecidos fixos (seed + id → crash point esperado), distribuição aproximada em 100 mil amostras (~3% de crash instantâneo, ~4% do total em 1,00x, mediana perto de 1,9x), resultado sempre entre 100 e 100.000.000, e o teto aplicado.

Limitação conhecida: com uma seed por rodada e sem client seed nem cadeia de hashes, o servidor poderia escolher a seed antes de publicar o hash (seção 14).

---

## 8. Contratos

### 8.1 REST

Autenticação: header `Authorization: Bearer <token>` (exceto na criação do guest).
Ações que mexem com saldo exigem o header `Idempotency-Key: <uuid>`.

| Método e rota | Corpo | Resposta | Erros |
|---|---|---|---|
| `POST /players/guest` | `{ nickname }` (3 a 16 caracteres) | `{ playerId, nickname, token, balance }` | 400 |
| `GET /wallet` | — | `{ balance, entries[] }` (últimos 20 lançamentos) | 401 |
| `GET /rounds/current` | — (`Bearer` opcional) | estado atual da rodada (ou a última crashada, se nenhuma estiver aberta), apostas da rodada (com `betId`, sem `playerId`; D71), `myBet` se houver `Bearer`, e `serverTime`; nunca inclui `crashPoint`, `crashAt` nem `serverSeed` antes do crash (D30, D63) | 401 se o `Bearer` vier inválido |
| `GET /rounds/history?limit=20` | — | `[{ id, crashPoint, crashedAt }]` | — |
| `GET /rounds/:id/verify` | — | `{ serverSeed, seedHash, crashPoint }` | 404; 409 se a rodada ainda não crashou |
| `POST /bets` | `{ amount }` | `{ betId, roundId, amount, balance }` | 400, 401, 409 (`ROUND_NOT_ACCEPTING_BETS`, `BET_ALREADY_PLACED`), 422 (`INSUFFICIENT_BALANCE`, `IDEMPOTENCY_KEY_REUSED`) |
| `POST /bets/:id/cashout` | — | `{ betId, multiplier, payout, balance }` | 400, 401, 404, 409 (`ROUND_NOT_RUNNING`, `BET_NOT_PENDING`, `TOO_LATE`), 422 (`IDEMPOTENCY_KEY_REUSED`) |

Valores monetários trafegam como **inteiros em centavos**. Multiplicadores trafegam como **inteiros ×100**. Instantes trafegam em **ms desde a epoch** (D63). A formatação é responsabilidade do front. O mapeamento de `code` para status está na D58.

Formato de erro: `{ code: string, message: string }`.

### 8.2 WebSocket (servidor → cliente)

Todos os eventos têm o formato `{ type, payload, serverTime }`, tipados em `packages/shared`.

| `type` | `payload` | Quando |
|---|---|---|
| `round:betting` | `{ roundId, seedHash, bettingEndsAt }` | Nova rodada aberta para apostas |
| `round:started` | `{ roundId, startedAt }` | Fim da janela de apostas |
| `round:tick` | `{ roundId, multiplier }` | A cada 100 ms durante `RUNNING` (só para sincronizar) |
| `round:crashed` | `{ roundId, crashPoint, serverSeed }` | No crash |
| `bet:placed` | `{ roundId, betId, nickname, amount }` | Alguém apostou |
| `bet:cashed_out` | `{ roundId, betId, nickname, multiplier, payout }` | Alguém fez cash out |

O cliente não envia ações pelo WS. O canal é só de leitura, e a conexão não exige autenticação.

---

## 9. Modelo de dados (PostgreSQL)

| Tabela | Colunas principais | Restrições |
|---|---|---|
| `players` | `id`, `nickname`, `token_hash`, `created_at` | `token_hash` único; o token é guardado como hash, nunca em texto puro |
| `wallets` | `player_id` (PK/FK), `balance`, `version` | `CHECK (balance >= 0)`; `version` como segunda barreira além do lock pessimista (D45) |
| `ledger_entries` | `id` (identity, gerado pelo banco; D37), `player_id`, `type`, `amount` (com sinal), `bet_id`, `created_at` | índice em `(player_id, created_at)` |
| `rounds` | `id`, `status`, `server_seed`, `seed_hash`, `crash_point`, `betting_ends_at`, `started_at`, `crash_at`, `crashed_at` | índice em `(status)` e `(crashed_at)` |
| `bets` | `id`, `round_id`, `player_id`, `amount`, `status`, `cashout_multiplier`, `payout`, `created_at` | `UNIQUE (round_id, player_id)` |
| `idempotency_keys` | `key`, `player_id`, `endpoint`, `request_hash`, `response_status`, `response_body`, `created_at` | PK `(player_id, key)`; `request_hash` é o SHA-256 da entrada validada (D60) |

Valores em centavos usam `bigint`; multiplicadores usam `integer` (×100).
Toda mudança de schema é feita por **migration** do MikroORM, nunca por `schema:update`.

---

## 10. Fluxos críticos e concorrência

### 10.1 Fazer aposta (`POST /bets`)

O `now` é lido uma vez, antes da transação (D55). Locks na ordem rodada → aposta → carteira (D57).

Em uma única transação:
1. Advisory lock por (jogador, chave). Se a `Idempotency-Key` já existe para esse jogador, devolve a resposta salva; com outro endpoint ou outro corpo, 422 `IDEMPOTENCY_KEY_REUSED` (D60).
2. Carrega a rodada atual com `FOR SHARE` e valida `BETTING` e `now < bettingEndsAt`.
3. Carrega a carteira com **lock pessimista** (`SELECT ... FOR UPDATE`).
4. Debita, grava o `LedgerEntry` e cria a `Bet`. O `UNIQUE (round_id, player_id)` é a última barreira contra aposta duplicada.
5. Salva a resposta na tabela de idempotência.

Depois do commit: emite `BetPlaced`, que vira o broadcast `bet:placed`.

### 10.2 Cash out (`POST /bets/:id/cashout`)

Em uma única transação:
1. Verifica a idempotência, como na 10.1.
2. Lê a aposta do jogador sem lock só para achar a rodada (aposta de outro jogador responde 404, D33) e carrega a rodada com `FOR SHARE` (D57).
3. Carrega a aposta com lock (`getByIdAndPlayerForUpdate`) e valida que está `PENDING`; valida a rodada em `RUNNING` e `now < crashAt` (rodada já crashada também é `TOO_LATE`, D34). **É essa comparação com `crashAt` que resolve a corrida com o game loop:** o momento do crash é fixo e conhecido de antemão, então não importa se o loop atrasou.
4. `multiplier = multiplierAt(now − startedAt)`; `payout = amount × multiplier`.
5. Credita na carteira (com lock) e grava o `LedgerEntry`.

### 10.3 Game loop (`GameLoopService`)

```
criar rodada (BETTING, 10 s) → start() → ticks a cada 100 ms → em crashAt: crash()
→ liquidar apostas PENDING como LOST → pausa de 3 s → nova rodada
```

- O loop agenda o crash para `crashAt` e não depende dos ticks para isso.
- **Recuperação no boot:** se existir rodada `RUNNING` com `crashAt` no passado, finaliza e liquida. Se existir rodada `BETTING` vencida, inicia. Depois, segue o ciclo normal. É o primeiro `step()` do loop, sem caminho à parte (D61).
- `start()` e `crash()` com a liquidação carregam a rodada com `FOR UPDATE` e esperam as apostas e os cash outs em andamento (D57).
- Os tempos (10 s de apostas, 100 ms entre ticks, 3 s de pausa) ficam em configuração.

---

## 11. Front-end

### 11.1 Responsabilidades

| Pasta | Faz | Não faz |
|---|---|---|
| `app/` | Cria store, clientes e conexão uma vez, fora do React; expõe as ações (criar guest, apostar, sacar, carregar carteira) e guarda a sessão (D77, D83) | Desenhar ou guardar estado de jogo fora da store |
| `net/` | Conecta o WS, reconecta com backoff exponencial, chama a API REST, calcula o offset do relógio com base em `serverTime` | Lógica de UI |
| `store/` | Guarda rodada, saldo, aposta do jogador, lista de jogadores e histórico | Chamar a rede diretamente a partir dos componentes |
| `ui/` | Painel de aposta e cash out, carteira, lista de jogadores, histórico de multiplicadores | Desenhar o jogo |
| `game/` | Cena: curva, pipa que sobe, crash (lógica pura em `scene/`, adaptador Pixi em `pixi/`, D88); texto do multiplicador em DOM sobre o canvas (D90) | Re-renderizar via React |

### 11.2 Regras

- O Pixi é criado em `useEffect` no componente `<GameCanvas />`, com `destroy()` completo do renderer no cleanup, mesmo se o init assíncrono ainda não resolveu (D91). A cena se inscreve na store com `store.subscribe` e atualiza os próprios objetos a cada frame do loop único (D89).
- A cada frame, o multiplicador exibido é `multiplierAt(serverNow − startedAt)`, onde `serverNow = performance.now() + clockOffset` (D74). Os ticks do servidor só corrigem desvios.
- **Ao reconectar:** chama `GET /rounds/current` e reconstrói o estado antes de voltar a processar eventos.
- O botão de cash out fica desabilitado enquanto a requisição está em andamento. A `Idempotency-Key` é gerada uma vez por clique; as retentativas automáticas reutilizam a mesma (D78).
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
| Integração (api) | Repositórios, transações, locks, idempotência, recuperação no boot | Vitest + Postgres 18 (banco `crash_game_test` do compose; service container no CI, D39) |
| E2E (api) | Fluxo completo: guest → aposta → cash out → crash, ouvindo o WS | Vitest + Supertest + cliente `ws` |
| Front | Store, cálculo de offset do relógio, lógica de reconexão (com WebSocket falso), componentes | Vitest; jsdom e Testing Library só nos componentes (D82) |

Banco de teste (D39, D40): `crash_game_test` no Postgres do compose, criado e migrado pelo `globalSetup`; `TRUNCATE` antes de cada teste. **Os arquivos de integração rodam em sequência** (`fileParallelism: false` no `vitest.config.integration.ts`), porque todos usam o mesmo banco; os unitários continuam em paralelo. Rodar com `pnpm --filter @crash/api test:int`.

Testes de concorrência obrigatórios:
- Duas requisições de aposta simultâneas com a mesma `Idempotency-Key` → um débito só
- Duas apostas simultâneas com chaves diferentes na mesma rodada → uma é aceita e a outra recebe 409
- Cash out com `now` 1 ms antes e 1 ms depois de `crashAt` → aceito e `TOO_LATE`, respectivamente

---

## 13. Backlog por etapa

Estimativa total: ~47–51 h (MVP sem M6: ~38–42 h).

### M0 — Setup (3 h)
- [x] Monorepo pnpm com `apps/api`, `apps/web` e `packages/shared`
- [x] TypeScript strict, oxlint e Prettier compartilhados
- [x] Docker Compose com Postgres
- [x] GitHub Actions: lint, typecheck e testes em cada push e pull request
- [x] Vitest configurado nos pacotes, com versões centralizadas no catalog do pnpm
- [x] Testes rodando no CI
- [x] `WsAdapter` do `@nestjs/platform-ws` registrado no bootstrap da api
- [x] README inicial com como rodar

### M1 — Domínio com DDD, implementado com TDD (5 h)
- [x] VOs: `Money`, `Multiplier`, `ServerSeed`, `SeedHash`
- [x] `multiplierAt` e `timeToCrash` em `shared`
- [x] Geração do crash point e testes de distribuição
- [x] Agregado `Round` com máquina de estados
- [x] Agregado `Bet` com regras de aposta e cash out
- [x] Agregado `Wallet` com extrato
- [x] Interfaces de repositório e `Clock`
- [x] Eventos de domínio

### M2 — Persistência (5 h)
- [x] Configuração do MikroORM
- [x] Entidades e mapeamentos
- [x] Migrations iniciais
- [x] Repositórios implementando as interfaces do domínio
- [x] Testes de integração com o Postgres de teste (D39)

### M3 — API e tempo real (6 h)
- [x] Guest e autenticação por token
- [x] Endpoints REST da seção 8.1; id malformado na URL (`verify`, `cashout`) responde 400 `VALIDATION_ERROR`, com teste E2E (D58)
- [x] Idempotência: validação do header no HTTP, registro na transação e migration do `request_hash`, com teste do 422 `IDEMPOTENCY_KEY_REUSED` para outro corpo (D60)
- [x] `GameLoopService` com recuperação no boot; `msUntilCrash` incluído no teste da D47, permitido só no game loop (D61)
- [x] Gateway WS com os eventos da seção 8.2
- [x] Testes de concorrência e E2E

### M4 — Base do front (9 a 11 h)
- [x] Vite + React + TypeScript consumindo `shared`
- [x] Clientes REST e WS (reconexão, ressincronização, offset do relógio)
- [x] Store com Zustand
- [x] UI: painel de aposta, carteira, lista de jogadores, histórico
- [x] Regras do nickname (`^[A-Za-z0-9_-]{3,16}$`, aparado) movidas da api para o `@crash/shared`, usadas pelo `parseGuestBody` e pelo formulário do front (como a D36)
- [x] CORS na API liberado só para a origem do front, lida da configuração (variável nova no `readAppConfig`), nunca `*`; a conexão do WebSocket aceita só essa mesma origem (D69, D70)
- [x] `betId` público em `bet:placed`, `bet:cashed_out` e no `RoundBetDto`, com teste de que o `playerId` não aparece (D71)

### M5 — Cena PixiJS (11 a 13 h)
- [x] Decidir como abrir o front num celular real para medir os 60 fps (D98: pelo IP da rede local, trocando `WEB_ORIGIN` e `VITE_API_URL`)
- [x] `Idempotency-Key` gerada com `crypto.getRandomValues`, com teste de que não depende do `crypto.randomUUID` (D96); roteiro do celular no README com `WEB_ORIGIN` e `VITE_API_URL` pelo IP (D98)
- [x] Frame loop único dirigindo o texto e a cena (D89)
- [x] Modelo puro da cena: câmera, curva do multiplicador, pipa subindo, animação do crash, movimento reduzido e paleta conferida com o `tokens.css` (D87, D88)
- [ ] Ao receber `round:crashed`, a cena congela no crash point exato: o tick (D68) e o cálculo local (D11) podem passar um pouco dele. O texto já faz isso desde o M4 (`displayMultiplier`); falta a pipa (D87)
- [x] Adaptador Pixi sem objeto criado por frame (D88, D95)
- [ ] `<GameCanvas />` com ciclo de vida correto, falhas de contexto e texto do multiplicador em DOM sobre o canvas (D90, D91, D92)
- [x] Contador de segundos restantes da janela de apostas (D100)
- [ ] Medidor de fps (`?fps`) e marcas de carregamento (D97)
- [ ] Medição "antes" (bundle, Lighthouse, fps no celular)
- [ ] Otimização 1: cena por import dinâmico (D94). Candidatas a medir junto, vindas do spike da F4: (a) `skipExtensionImports: true` com `import 'pixi.js/graphics'`, sem o `browserAll` (~15 kB gzip a menos; validar no navegador); (b) importar `WebGLRenderer` e `CanvasRenderer` direto, no lugar do `autoDetectRenderer`, porque o build puxa os três renderers estáticos, inclusive o WebGPU
- [ ] Otimização 2: escala responsiva com resolução pela escala do palco (D93)
- [ ] Medição "depois" e README (linha de base do bundle, números de desempenho, limitações)

### M6 — Polimento (4 h)
- [ ] Partículas no crash e no cash out
- [ ] Easing nas transições
- [ ] Teste em celular real e ajustes
- [ ] Candidata a refatoração: a validação de origem pura está duplicada em `apps/web/src/config.ts` (`VITE_API_URL`, D73) e em `apps/api/src/shared/infrastructure/config/app-config.ts` (`WEB_ORIGIN`, D69); mover a função para o `@crash/shared`, com os testes das duas pontas continuando verdes
- [ ] Opcional: barra proporcional da janela de apostas, com a duração no contrato do `round:betting` (muda a D63; D100)

### M7 — Entrega (4 h)
- [ ] README: GIF de 10 s, arquitetura, decisões (link para esta seção 4), fluxos críticos, como rodar, limitações
- [ ] Diagramas: contexto e fluxo de uma rodada
- [ ] Repetir as medições da seção 11.3 no deploy (as do M5 são na rede local)
- [ ] Api no Docker Compose (Dockerfile da api), como prevê a seção 3
- [ ] Deploy do web e da api (a api exige `WEB_ORIGIN` com a origem do web, D69; o build do web exige `VITE_API_URL`, D73)

### Definição de pronto (para toda etapa)
- [ ] Testes, lint e typecheck passando no CI
- [ ] Sem `any` sem justificativa
- [ ] Commits pequenos e descritivos
- [ ] Checklist da etapa marcado neste arquivo
- [ ] Qualquer decisão nova registrada na seção 4

---

## 14. Fora do escopo (por enquanto)

- **SNS/SQS:** publicar `RoundSettled` no SNS (via LocalStack) e consumir em uma fila SQS que alimenta histórico e estatísticas. Estimativa: +5 h. `RoundSettled` é um evento de integração, distinto do evento de domínio `BetsSettled` (D26).
- Auto cash out (sacar automaticamente num multiplicador escolhido)
- Login real com JWT, recuperação de conta
- **Sem limite de requisições no `POST /players/guest`:** qualquer pessoa cria quantos guests quiser, cada um com 1.000,00 créditos. Os créditos são fictícios, mas o endpoint permite inflar o banco. Limitação documentada também no README (Fase 5 do M3).
- **O token do guest nunca expira:** não há expiração, rotação nem revogação; quem tiver o token age pelo jogador para sempre. Limitação documentada também no README (Fase 5 do M3).
- **As chaves de idempotência não expiram:** a tabela `idempotency_keys` cresce sem limpeza. Uma rotina de expiração (por exemplo, 24 h) fica para depois. Limitação documentada também no README.
- **CORS e origem do WebSocket não são autenticação (D69, D70):** protegem o jogador no navegador contra páginas de outra origem; um cliente fora do navegador manda o `Origin` que quiser. O canal WS é público e só de leitura (seção 8.2).
- **Token do guest no `localStorage` (D77):** um XSS no front leria o token, que não expira. Mitigações: React escapa o texto, nada de `dangerouslySetInnerHTML`, nickname restrito pelo regex (D59) e CSP no deploy (M7). Vai para o README no fechamento do M4 (F9).
- **Vigia de silêncio do WS acoplado ao `PAUSE_MS` (D76):** o cliente não conhece a pausa entre rodadas; com `PAUSE_MS` acima de cerca de 25 s, o vigia reconectaria à toa (sem dano, porque a ressincronização reconstrói o estado).
- Escala horizontal do game loop (exigiria eleição de líder ou lock distribuído)
- Chat entre jogadores
- Dinheiro real de qualquer tipo
- **Provably fair resistente a escolha de seed:** hoje cada rodada tem a própria seed, gerada pelo servidor antes de publicar o hash. Sem client seed nem cadeia de hashes (como no Bustabit), o servidor poderia gerar várias seeds e escolher a que dá o crash point que quiser antes de publicar o `seedHash`. O hash só garante que a seed não muda depois de publicada. Limitação documentada também no README.
