# Crash Game

[![CI](https://github.com/andremuniz92/crash-game/actions/workflows/ci.yml/badge.svg)](https://github.com/andremuniz92/crash-game/actions/workflows/ci.yml)

**Status:** M0 a M5 prontos: back-end, front em React e cena PixiJS medida em celular real. Deploy
em andamento (M7a).

Crash game multiplayer com rodada global, usando créditos fictícios. Projeto de portfólio.
As decisões de arquitetura estão no [CLAUDE.md](./CLAUDE.md#4-decisões-registradas-adrs-resumidos).

## Destaques

- **Cena PixiJS imperativa.** A lógica da cena é pura e testada sem WebGL; um frame loop único,
  sincronizado ao relógio do servidor, move o texto e a pipa; nenhum objeto Pixi é criado por frame,
  e o React não re-renderiza a cada frame.
  [D10, D88, D89](./CLAUDE.md#4-decisões-registradas-adrs-resumidos).
- **Desempenho medido, antes e depois.** JS inicial de 215 para 83 kB gzip com import dinâmico;
  jogável em 1,8 s em vez de 2,6 s (Lighthouse, Slow 4G + CPU 4×); 11 a 25× menos pixels por frame
  nos tamanhos de celular (modo responsivo, DPR 2 e 3); 60 fps num iPhone 11, antes e depois.
  [Desempenho](#desempenho-seção-113), [D94, D101](./CLAUDE.md#4-decisões-registradas-adrs-resumidos).
- **Resiliência.** Sem WebGL, a cena cai para Canvas 2D; sem renderer ou sem o chunk da cena, o jogo
  continua jogável pelo texto. O WebSocket reconecta e ressincroniza sozinho.
  [D76, D92](./CLAUDE.md#4-decisões-registradas-adrs-resumidos).
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
- **897 testes:** 759 unitários e de componente, 88 de integração com Postgres real e 50 E2E por
  HTTP e WebSocket, todos no CI. [D39, D40, D66, D82](./CLAUDE.md#4-decisões-registradas-adrs-resumidos).

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

| Variável            | Padrão  | O que é                                                                  |
| ------------------- | ------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`      | —       | Postgres da API (obrigatória)                                            |
| `TEST_DATABASE_URL` | —       | Postgres dos testes; o nome precisa terminar em `_test`                  |
| `WEB_ORIGIN`        | —       | Origem do front, a única aceita pelo CORS e pelo WebSocket (obrigatória) |
| `PORT`              | `3000`  | Porta HTTP e WebSocket                                                   |
| `BETTING_MS`        | `10000` | Janela de apostas de cada rodada                                         |
| `PAUSE_MS`          | `3000`  | Pausa entre o crash e a próxima rodada                                   |
| `TICK_MS`           | `100`   | Intervalo do `round:tick`                                                |
| `WS_HEARTBEAT_MS`   | `30000` | Intervalo do ping do WebSocket                                           |

Valores inválidos (não inteiros, zero ou negativos) impedem a API de subir, com o nome da variável
no erro. A `WEB_ORIGIN` precisa ser uma origem pura, como o navegador manda no header `Origin`
(`http://localhost:5173`, sem barra final nem caminho); se ela vier em outra forma, o erro mostra a
forma esperada. Abrir o front em `127.0.0.1:5173` é outra origem e será recusado.

### Front

O `pnpm dev` sobe o front em `http://localhost:5173`, ligado à API em `http://localhost:3000`. Abra
exatamente esse endereço: a API só aceita a origem da `WEB_ORIGIN` (D69, D70).

| Variável       | Padrão                           | O que é                                                   |
| -------------- | -------------------------------- | --------------------------------------------------------- |
| `VITE_API_URL` | `http://localhost:3000` (só dev) | Origem da API; o WebSocket fica na mesma origem, em `/ws` |

O `vite build` de produção (e o `pnpm build` da raiz) falha sem `VITE_API_URL` ou com uma origem
inválida, em vez de gerar uma página que só quebra ao abrir (D73, D85). O Vite lê o `.env` da raiz
e só expõe ao front as variáveis com prefixo `VITE_`.

A conferência do SHA-256 da seed usa o `crypto.subtle`, que só existe em contexto seguro (HTTPS ou
`localhost`). Fora dele, a verificação aparece como indisponível, e o resto do jogo funciona: as
`Idempotency-Key` saem do `crypto.getRandomValues`, que existe também em HTTP (D96).

**Testando num celular** (D98). O front abre pelo IP da rede local, mas essa é outra origem, e a API
recusa. Além disso, no celular `localhost` é o próprio celular, então o front também precisa saber
o IP da API. Não é preciso editar o `.env`: as variáveis passadas por `-e` no
`docker compose exec` valem mais que as do arquivo, tanto no Node (`--env-file-if-exists`) quanto
no Vite. Com o `pnpm dev` parado, a partir da raiz, no host:

```sh
IP=$(ip -4 route get 1.1.1.1 | awk '{for (i = 1; i <= NF; i++) if ($i == "src") print $(i + 1)}')
# Terminal 1: só a API, aceitando a origem do IP
docker compose -f .ai-jail/compose.yml exec -e WEB_ORIGIN=http://$IP:5173 claude \
  sh -c 'pnpm --filter @crash/shared build && pnpm --filter @crash/api dev'
# Terminal 2 (defina o IP de novo): build de produção apontando para o IP, e o preview
docker compose -f .ai-jail/compose.yml exec -e VITE_API_URL=http://$IP:3000 claude \
  pnpm --filter @crash/web build
docker compose -f .ai-jail/compose.yml exec claude \
  pnpm --filter @crash/web preview --host --port 5173 --strictPort
```

Abra `http://<IP>:5173` no celular. Para medir desempenho, use sempre esse build de produção, e
não o dev. Ao terminar, pare os dois terminais e refaça o build com
`VITE_API_URL=http://localhost:3000`, porque a `dist` fica com o IP embutido. Pelo IP, a
verificação fica indisponível (não há contexto seguro), e apostar e sacar funcionam. No Linux, as
portas publicadas pelo Docker passam por fora do ufw; no macOS e no Windows, o firewall pode pedir
para liberar as portas 3000 e 5173.

**Linha de base do bundle (fim do M4).** `vite build` com `VITE_API_URL` definida, antes da cena
PixiJS. As medições da seção 11.3 estão em [Desempenho](#desempenho-seção-113); o M7 só as repete
no deploy.

| Arquivo      | Tamanho   | gzip     |
| ------------ | --------- | -------- |
| JS           | 249,01 kB | 79,04 kB |
| CSS          | 7,35 kB   | 2,05 kB  |
| `index.html` | 0,51 kB   | 0,31 kB  |

### Desempenho (seção 11.3)

Medido na rede local (D97, D98); o M7 repete as medições no deploy. "Antes" é a versão simples,
com o Pixi no chunk principal e `resolution = devicePixelRatio`. Depois vieram duas otimizações,
e cada uma mexe numa coisa só: a 1 (D94) no carregamento, levando a cena para um chunk à parte, e a
2 (D93, D101) na resolução do renderer, pela escala do palco. Por isso o bundle tem uma linha por
otimização, e o carregamento e o fps foram medidos uma vez, com as duas juntas, em `593ccb2`
(a otimização 2 com a correção da F9b, que faz o renderer já iniciar na resolução do palco).

**Ambiente.** Host: Debian, Chromium 156.0.0.0, Lighthouse 13.5.0. Celular: iPhone 11, iOS
18.0.1, Safari 18.0.1, 60 Hz, DPR 2, retrato, bateria 95 → 92 % no "antes" e 62 → 61 % no
"depois", fora da tomada, Modo de Pouca Energia desligado, Wi-Fi 2,4 GHz. API e preview no AI Jail, build de
produção (`VITE_API_URL=http://localhost:3000` no host; o IP da rede local no celular, D98). Na
medição de fps, a API roda com `BETTING_MS=3000` e `PAUSE_MS=1000` em todas as versões, para
encurtar a espera pela rodada longa; isso não muda nada durante a `RUNNING`.

**Bundle** (`vite build`, gzip). "JS inicial" é o que a primeira carga baixa: o `index` e os
chunks do Pixi que ele pré-carrega por `modulepreload`. "Sob demanda" é o que só chega depois: a
cena e os chunks do Pixi pelo `import()` (a partir da Opt 1), `browserAll` e `init` no init do
renderer, e o medidor só com `?fps`.

| Versão      | Commit  | JS inicial | Chunks sob demanda                                  | CSS     | Total inicial |
| ----------- | ------- | ---------- | --------------------------------------------------- | ------- | ------------- |
| Fim do M4   | 50f9534 | 79,04 kB   | —                                                   | 2,05 kB | 81,40 kB      |
| Antes (M5)  | 43eecc9 | 214,97 kB  | renderer: 16,04 kB · fps: 1,16 kB                   | 2,14 kB | 217,54 kB     |
| Opt 1 (D94) | 575d5f1 | 82,49 kB   | cena: 132,87 kB · renderer: 16,04 kB · fps: 1,16 kB | 2,14 kB | 84,94 kB      |
| Opt 2 (D93) | 593ccb2 | 82,71 kB   | cena: 132,89 kB · renderer: 16,04 kB · fps: 1,16 kB | 2,15 kB | 85,17 kB      |

"Total inicial" soma JS inicial, CSS e `index.html`. No "Antes", o `index` sozinho tem 500,67 kB
(153,17 kB gzip), e o Vite avisa que passou de 500 kB. Com a Opt 1, o `index` cai para 257,27 kB
(82,49 kB gzip), o aviso some e o `index.html` deixa de pré-carregar chunks do Pixi; o total
baixado praticamente não muda, só sai da carga inicial.

<details>
<summary>Saída do <code>vite build</code></summary>

```text
Antes (43eecc9), vite v8.3.5, 800 módulos, built in 499ms:
dist/index.html                                  0.94 kB │ gzip:   0.43 kB
dist/assets/index-D15-m6Lf.css                   7.68 kB │ gzip:   2.14 kB
dist/assets/webworkerAll-Dunr03Na.js             0.05 kB │ gzip:   0.06 kB
dist/assets/getTextureBatchBindGroup-DYri6n2H.js 0.34 kB │ gzip:   0.26 kB
dist/assets/fps-meter-BvvbcZER.js                2.12 kB │ gzip:   1.16 kB
dist/assets/canvasUtils-D3aduNlw.js              6.01 kB │ gzip:   2.04 kB
dist/assets/getTexelRangeRects-lWBUM-md.js      11.31 kB │ gzip:   2.97 kB
dist/assets/init-GosjUjeC.js                    15.18 kB │ gzip:   4.76 kB
dist/assets/browserAll-CspphzQI.js              43.48 kB │ gzip:  11.28 kB
dist/assets/RenderTargetSystem-BA9QXhSt.js      77.97 kB │ gzip:  22.08 kB
dist/assets/CanvasPool-B6fibMua.js             112.99 kB │ gzip:  34.45 kB
dist/assets/index-De6SpbJm.js                  500.67 kB │ gzip: 153.17 kB
(aviso do Vite: chunks maiores que 500 kB depois da minificação)

Depois, Opt 1 + 2 (593ccb2), vite v8.3.5, 803 módulos, built in 671ms:
dist/index.html                                   0.51 kB │ gzip:  0.31 kB
dist/assets/index-Iha98J9K.css                    7.71 kB │ gzip:  2.15 kB
dist/assets/WebGLRenderer-Dp3dUzPX.js             0.05 kB │ gzip:  0.07 kB
dist/assets/CanvasRenderer-DnntYD8p.js            0.06 kB │ gzip:  0.08 kB
dist/assets/WebGPURenderer-Cs-cuGYZ.js            0.06 kB │ gzip:  0.08 kB
dist/assets/webworkerAll-oDZsC-CO.js              0.06 kB │ gzip:  0.07 kB
dist/assets/getTextureBatchBindGroup-BhTE4MlI.js  0.34 kB │ gzip:  0.27 kB
dist/assets/fps-meter-BvvbcZER.js                 2.12 kB │ gzip:  1.16 kB
dist/assets/canvasUtils-gs4QfX6E.js               6.01 kB │ gzip:  2.05 kB
dist/assets/getTexelRangeRects-Bwna4Rz1.js       11.31 kB │ gzip:  2.97 kB
dist/assets/init-BE3vo9f6.js                     15.18 kB │ gzip:  4.76 kB
dist/assets/browserAll-C_KRvq9o.js               43.48 kB │ gzip: 11.28 kB
dist/assets/RenderTargetSystem-ClKI7oTn.js       77.97 kB │ gzip: 22.08 kB
dist/assets/CanvasPool-CtcOX-Bi.js              112.28 kB │ gzip: 34.17 kB
dist/assets/scene-module-DV1Bxeqw.js            244.22 kB │ gzip: 71.35 kB
dist/assets/index-Dzsa0doN.js                   257.89 kB │ gzip: 82.71 kB
(sem o aviso de chunk acima de 500 kB)
```

</details>

**Carregamento** (mediana de 5, todas as execuções sem cache e sem sessão). A medição usa o
Chrome ou o Chromium, porque o Firefox não tem Lighthouse nem throttling de CPU. Lighthouse no modo
Navigation, Mobile (Moto G Power emulado), só Performance, com throttling aplicado pelo DevTools
(Slow 4G + CPU 4×) e "Clear storage". Network "Fast 4G" com "Disable cache", "Clear site data"
antes de cada carga e sem throttling de CPU. **Durante o Lighthouse, a aba Network precisa estar em
"No throttling":** o throttling dela se soma ao do Lighthouse, e uma primeira série com "Fast 4G"
esquecido ativo saiu com FCP de 0,8 s e foi descartada.

| Versão                      | Score | FCP   | LCP   | TBT    | `app:first-render` | `scene:first-frame` | Fast 4G: `app:first-render` | Fast 4G: `scene:first-frame` | Transferido |
| --------------------------- | ----- | ----- | ----- | ------ | ------------------ | ------------------- | --------------------------- | ---------------------------- | ----------- |
| Antes (43eecc9)             | 89    | 2,6 s | 2,6 s | 160 ms | 2615 ms            | 3470 ms             | 665 ms                      | 962 ms                       | 239 kB      |
| Depois, Opt 1 + 2 (593ccb2) | 94    | 1,8 s | 1,8 s | 170 ms | 1815 ms            | 4710 ms             | 482 ms                      | 1277 ms                      | 240 kB      |

**Leitura do "Antes".** Com Slow 4G e CPU 4×, o jogo só fica jogável (`app:first-render`) em
~2,6 s, acima da meta de 2 s da seção 11.3, e a cena aparece ~0,9 s depois. Com Fast 4G e sem
limitar a CPU, a meta é atingida (~0,67 s). O aviso de chunk acima de 500 kB e os 86 KiB de JS não
usado apontados pelo Lighthouse ("Reduce unused JavaScript", em todas as execuções) são o alvo da
otimização 1 (D94).

**Leitura do "Depois".** O jogo fica jogável mais cedo: com Slow 4G e CPU 4×, o `app:first-render`
cai de 2615 para 1815 ms (−0,8 s) e passa a cumprir a meta de 2 s da seção 11.3; o FCP cai de 2,6
para 1,8 s, e o score sobe de 89 para 94. Com Fast 4G, o `app:first-render` cai de 665 para 482 ms.

**A troca consciente da otimização 1.** A cena aparece mais tarde: o `scene:first-frame` sobe de
3470 para 4710 ms no Lighthouse (+1,24 s) e de 962 para 1277 ms no Fast 4G (+315 ms). Antes, o
`index` e os chunks do Pixi chegavam em paralelo, pelo `modulepreload`. Agora, o caminho até o
primeiro quadro tem duas idas e voltas a mais, em série, depois de o app montar: o `import()` da
cena pede o `scene-module` e os chunks do Pixi; o `autoDetectRenderer` do Pixi faz um `import()`
do `WebGLRenderer`, que com a cena num chunk próprio virou uma fachada de 0,07 kB que só
reexporta o código já baixado, mas custa uma requisição; e o init do renderer pede o `browserAll`
e o `init`. Com o throttling do Lighthouse, cada ida e volta custa ~0,56 s de latência, por isso a
diferença é bem maior que no Fast 4G. A troca é aceita: a meta de carregamento vale para a primeira
tela jogável (D94), e o texto e o painel não esperam a cena. A F9b tirou ~0,2 s do
`scene:first-frame` no Lighthouse (4946 ms em `653acd2` → 4710 ms em `593ccb2`), porque o
renderer deixou de iniciar em 1280×720 para ser redimensionado logo depois. As duas idas e voltas
a mais são o alvo de duas candidatas do M6 (CLAUDE.md, seção 13).

**Thread principal e TBT não entram como conclusão.** A thread principal varia entre execuções
(7,0 a 9,8 s no "depois"; 4,0 a 4,7 s no "antes"), por uma causa não isolada: uma execução que caiu
inteira em `BETTING` também passou de 9 s. O TBT acompanha (160 ms antes, 170 ms depois). As
conclusões ficam com FCP, `app:first-render`, `scene:first-frame`, bundle e backing.

**"Forced reflow" (novo no "depois").** Pela leitura do código, a provável origem é o
`CanvasObserver` do Pixi (vem com o `browserAll`), que lê `getBoundingClientRect` quando o canvas
entra no DOM e quando o `canvas.width` muda num resize do palco; não foi confirmado por trace. O
código do projeto não lê layout. O "Reduce unused JavaScript" (~86 KiB) continua, agora no chunk da
cena: o Pixi traz mais do que a cena usa.

<details>
<summary>Execuções do carregamento</summary>

Lighthouse, Antes. Em todas as execuções, "Reduce unused JavaScript" estimou 86 KiB de economia;
na execução 1, "Render-blocking requests" estimou ~150 ms.

| Execução | Score | FCP   | LCP   | TBT    | CLS   | SI    | `app:first-render` | `scene:first-frame` | JS exec | Main thread | Long tasks |
| -------- | ----- | ----- | ----- | ------ | ----- | ----- | ------------------ | ------------------- | ------- | ----------- | ---------- |
| 1        | 89    | 2,6 s | 2,6 s | 130 ms | 0,094 | 2,9 s | 2615,24 ms         | 3463,63 ms          | 2,0 s   | 4,0 s       | 4          |
| 2        | 83    | 2,6 s | 2,6 s | 340 ms | 0,094 | 2,8 s | 2683,66 ms         | 3669,70 ms          | 2,2 s   | 4,2 s       | 4          |
| 3        | 89    | 2,6 s | 2,6 s | 160 ms | 0,094 | 2,8 s | 2583,63 ms         | 3470,16 ms          | 2,3 s   | 4,7 s       | 3          |
| 4        | 88    | 2,6 s | 2,6 s | 180 ms | 0,094 | 2,9 s | 2627,05 ms         | 3537,50 ms          | 2,3 s   | 4,5 s       | 3          |
| 5        | 89    | 2,6 s | 2,6 s | 150 ms | 0,094 | 2,8 s | 2582,57 ms         | 3466,71 ms          | 1,8 s   | 4,0 s       | 2          |
| Mediana  | 89    | 2,6 s | 2,6 s | 160 ms | 0,094 | 2,8 s | 2615 ms            | 3470 ms             |         |             |            |

Network "Fast 4G", Antes, em ms (exceto Finish e Transferido). Cada carga transfere 239 kB, de
779 kB de recursos, em 14 requisições. O `index` e 5 chunks do Pixi (`CanvasPool`, `canvasUtils`,
`RenderTargetSystem`, `getTextureBatchBindGroup`, `getTexelRangeRects`) vêm na carga inicial, pelo
`modulepreload`; `browserAll` e `init` chegam depois, no init do renderer.

| Execução | first-paint | FCP | `app:first-render` | `scene:first-frame` | DOMContentLoaded | Load | Finish | Transferido |
| -------- | ----------- | --- | ------------------ | ------------------- | ---------------- | ---- | ------ | ----------- |
| 1        | 700         | 716 | 691                | 965                 | 665              | 665  | 1,18 s | 239 kB      |
| 2        | 664         | 680 | 665                | 962                 | 632              | 632  | 1,14 s | 239 kB      |
| 3        | 648         | 664 | 643                | 915                 | 616              | 616  | 1,13 s | 239 kB      |
| 4        | 660         | 676 | 669                | 967                 | 636              | 636  | 1,15 s | 239 kB      |
| 5        | 668         | 668 | 663                | 942                 | 623              | 623  | 1,14 s | 239 kB      |
| Mediana  | 664         | 676 | 665                | 962                 | 632              | 632  | 1,14 s | 239 kB      |

Lighthouse, Depois (593ccb2). Em todas as execuções, "Forced reflow" e "Reduce unused JavaScript"
(~86 KiB). A execução 3 caiu inteira em `BETTING` (filmstrip só com 1,00x).

| Execução | Score | FCP   | LCP   | TBT    | CLS   | SI    | `app:first-render` | `scene:first-frame` | JS exec | Main thread | Long tasks |
| -------- | ----- | ----- | ----- | ------ | ----- | ----- | ------------------ | ------------------- | ------- | ----------- | ---------- |
| 1        | 92    | 1,9 s | 1,9 s | 230 ms | 0,094 | 2,3 s | 1872,90 ms         | 4855,75 ms          | 3,7 s   | 9,1 s       | 2          |
| 2        | 94    | 1,8 s | 1,8 s | 160 ms | 0,095 | 2,2 s | 1800,49 ms         | 4709,78 ms          | 2,7 s   | 7,0 s       | 2          |
| 3        | 91    | 1,9 s | 1,9 s | 240 ms | 0,094 | 2,3 s | 1894,05 ms         | 4782,82 ms          | 3,9 s   | 9,8 s       | 2          |
| 4        | 94    | 1,8 s | 1,8 s | 170 ms | 0,094 | 2,2 s | 1800,13 ms         | 4637,33 ms          | 3,2 s   | 7,9 s       | 2          |
| 5        | 94    | 1,8 s | 1,8 s | 170 ms | 0,094 | 2,2 s | 1814,97 ms         | 4677,76 ms          | 3,2 s   | 7,9 s       | 2          |
| Mediana  | 94    | 1,8 s | 1,8 s | 170 ms | 0,094 | 2,2 s | 1815 ms            | 4710 ms             | 3,2 s   | 7,9 s       | 2          |

Network "Fast 4G", Depois (593ccb2), em ms (exceto Finish e Transferido). Cada carga transfere
240 kB, de 779 kB de recursos, em 16 requisições. O HTML só pede o `index` e o CSS; o
`scene-module` e os 5 chunks do Pixi chegam pelo `import()` (o preload do Vite), o
`scene-module` pede o `WebGLRenderer`, e depois vêm `browserAll` e `init`.

| Execução | first-paint | FCP | `app:first-render` | `scene:first-frame` | DOMContentLoaded | Load | Finish | Transferido |
| -------- | ----------- | --- | ------------------ | ------------------- | ---------------- | ---- | ------ | ----------- |
| 1        | 492         | 504 | 498                | 1281                | 475              | 475  | 1,19 s | 240 kB      |
| 2        | 484         | 492 | 480                | 1277                | 464              | 464  | 1,18 s | 240 kB      |
| 3        | 476         | 496 | 482                | 1261                | 463              | 463  | 1,18 s | 240 kB      |
| 4        | 492         | 496 | 489                | 1282                | 469              | 469  | 1,19 s | 240 kB      |
| 5        | 488         | 488 | 482                | 1259                | 463              | 463  | 1,18 s | 240 kB      |
| Mediana  | 488         | 496 | 482                | 1277                | 464              | 464  | 1,18 s | 240 kB      |

</details>

**fps no celular** (iPhone 11, `?fps`; média e lentos da rodada inteira, 1% low dos últimos 10 s;
lidos na linha da rodada do painel, por print de tela, sem gravação)

| Versão                      | Rodada | Duração | Média | 1% low | Lentos (> 50 ms) |
| --------------------------- | ------ | ------- | ----- | ------ | ---------------- |
| Antes (43eecc9)             | curta  | 17,7 s  | 60,0  | 55     | 0                |
| Antes (43eecc9)             | longa  | 71,2 s  | 59,9  | 53     | 0                |
| Depois, Opt 1 + 2 (593ccb2) | curta  | 13,3 s  | 60,0  | 51     | 0                |
| Depois, Opt 1 + 2 (593ccb2) | longa  | 83,2 s  | 59,5  | 55     | 2                |

**Leitura do "Antes".** O iPhone 11 já cumpre a meta de 60 fps da seção 11.3, inclusive na rodada
longa, com o rastro esticado. O 1% low de 33 na rodada de 2,9 s (abaixo) vem da janela de 10 s, que
pega a transição entre rodadas; com 0 frames lentos, é uma queda pontual.

**Leitura do "Depois".** O fps no iPhone 11 ficou igual ao "antes": 60 fps, inclusive numa rodada
de 83 s que chegou a 147x, agora com o backing do canvas ~11× menor (Opt 2, tabela abaixo). A meta
de 60 fps da seção 11.3 segue cumprida. Na rodada longa, a página foi aberta com a rodada em
andamento: a linha cobre só os frames depois do carregamento, e os 2 frames lentos provavelmente
vieram do carregamento da cena. A rodada intermediária, medida inteira com a página carregada, teve
0 lentos.

<details>
<summary>Rodadas medidas</summary>

Antes (43eecc9):

| Rodada        | Crash  | Duração | Média | Lentos (> 50 ms) | 1% low (últimos 10 s) |
| ------------- | ------ | ------- | ----- | ---------------- | --------------------- |
| curta         | 1,19x  | 2,9 s   | 60,0  | 0                | 33                    |
| curta         | 2,88x  | 17,7 s  | 60,0  | 0                | 55                    |
| intermediária | 8,42x  | 35,6 s  | 59,9  | 1                | 57                    |
| intermediária | 9,21x  | 37,1 s  | 59,8  | 1                | 48                    |
| intermediária | 9,92x  | 38,3 s  | 60,0  | 0                | 51                    |
| longa         | 71,60x | 71,2 s  | 59,9  | 0                | 53                    |

Depois, Opt 1 + 2 (593ccb2). Na longa, a página foi aberta durante a rodada: a duração é a da
rodada inteira, mas a média e os lentos contam só os frames depois do carregamento.

| Rodada        | Crash   | Duração | Média | Lentos (> 50 ms) | 1% low (últimos 10 s) |
| ------------- | ------- | ------- | ----- | ---------------- | --------------------- |
| curta         | 2,22x   | 13,3 s  | 60,0  | 0                | 51                    |
| intermediária | 14,64x  | 44,8 s  | 59,8  | 0                | 43                    |
| longa         | 147,01x | 83,2 s  | 59,5  | 2                | 55                    |

</details>

**Backing do canvas** (D101; `canvas.width × canvas.height` no modo responsivo do Firefox, com uma
rodada em andamento). Com a resolução pela escala do palco, o renderer desenha só os pixels físicos
que o palco ocupa, em vez de 1280×720 vezes o DPR.

| Versão             | 414×896, DPR 2                       | 412×915, DPR 3                       |
| ------------------ | ------------------------------------ | ------------------------------------ |
| Antes (`575d5f1`)  | 2560 × 1440 = 3.686.400 px           | 3840 × 2160 = 8.294.400 px           |
| Opt 2 (`653acd2`)¹ | 764 × 430 = 328.520 px (11,2× menos) | 760 × 428 = 325.280 px (25,5× menos) |

No desktop, o backing acompanha o zoom: 832×468 a 100% (DPR 1, com o palco limitado pelo layout a
~832 px CSS) e 1184×666 a 200% (DPR 2). Em DPR 2, o backing fica 1:1 com os pixels físicos; em DPR
3, fica abaixo deles, pelo teto de 2 no DPR (D93). ¹ Medido em `653acd2`; a correção da F9b
(`593ccb2`) não muda a resolução final, só a do init.

**Console do Firefox.** Três avisos aparecem e não são do projeto: "WebGL context was lost" vem do
`isWebGLSupported` do Pixi, que cria e descarta um contexto de teste; "texImage: Alpha-premult…" e
"lazy initialization" são avisos de desempenho do WebGL do Firefox.

### Scripts da raiz

| Script              | O que faz                                                 |
| ------------------- | --------------------------------------------------------- |
| `pnpm dev`          | Ambiente de desenvolvimento completo                      |
| `pnpm build`        | Build de todos os pacotes (o do web exige `VITE_API_URL`) |
| `pnpm typecheck`    | `tsc --noEmit` em todos os pacotes                        |
| `pnpm test`         | Vitest em todos os pacotes                                |
| `pnpm lint`         | oxlint (com tipos) no monorepo inteiro                    |
| `pnpm format`       | Prettier em tudo                                          |
| `pnpm format:check` | Confere a formatação sem alterar nada (usado no CI)       |

Cada pacote tem os mesmos scripts, restritos a ele (`pnpm --filter @crash/web lint`, por exemplo).

O CI (`.github/workflows/ci.yml`) roda, em cada push e pull request: install com
`--frozen-lockfile`, build do `shared`, format, lint, typecheck, testes e o build do web. Um segundo job roda os
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

Só do servidor para o cliente, sem autenticação. O handshake só é aceito com o header `Origin` igual à
`WEB_ORIGIN`; outra origem, ou nenhuma, recebe 403. Toda mensagem tem o formato
`{ type, payload, serverTime }`:

| `type`           | Quando                                    |
| ---------------- | ----------------------------------------- |
| `round:betting`  | Nova rodada aberta, com o `seedHash`      |
| `round:started`  | Fim da janela de apostas                  |
| `round:tick`     | A cada `TICK_MS` durante a rodada         |
| `round:crashed`  | No crash, com `crashPoint` e `serverSeed` |
| `bet:placed`     | Alguém apostou                            |
| `bet:cashed_out` | Alguém fez cash out                       |

As mensagens de aposta e as apostas do `GET /rounds/current` trazem o `betId`, para o front saber qual
aposta mudou mesmo com nicknames repetidos, e nunca o `playerId`. O `betId` não dá poder a ninguém:
o cash out exige o token do dono da aposta.

Antes do crash, nenhuma resposta REST nem mensagem do WebSocket carrega o crash point, o instante
do crash ou a seed. O `round:tick` serve só para sincronizar: o cliente calcula o multiplicador a
cada frame com a fórmula do `@crash/shared`. O servidor manda ping a cada `WS_HEARTBEAT_MS` e
derruba a conexão que não responder.

### Verificando uma rodada

Depois do crash, `GET /rounds/:id/verify` devolve a seed. Qualquer pessoa pode conferir duas coisas,
sem depender do front:

1. **A seed estava fixada antes da rodada:** o SHA-256 da seed (o texto hex de 64 caracteres, em
   UTF-8) é o `seedHash` publicado no `round:betting`.

   ```sh
   printf '%s' '<serverSeed>' | sha256sum
   ```

2. **O crash point sai da seed:** HMAC-SHA256 com a seed como chave e o id da rodada como mensagem
   (D23); os 13 primeiros caracteres hex viram `h`, e a fórmula da
   [seção 7.2](./CLAUDE.md#72-crash-point-provably-fair-inspirado-no-modelo-do-bustabit) dá o crash
   point.

   ```sh
   printf '%s' '<roundId>' | openssl dgst -sha256 -hmac '<serverSeed>'
   # ou o cálculo completo, com divisão inteira exata (D27) e o teto (D24):
   node -e 'const c=require("node:crypto");const[s,id]=process.argv.slice(1);const h=BigInt("0x"+c.createHmac("sha256",s).update(id).digest("hex").slice(0,13));const e=2n**52n;let x=h%33n===0n?100n:(100n*e-h)/(e-h);if(x>100000000n)x=100000000n;console.log((Number(x)/100).toFixed(2)+"x")' '<serverSeed>' '<roundId>'
   ```

O painel de verificação do front faz o passo 1 no navegador (Web Crypto), contra o hash que ele viu
publicado antes do crash (D86); o passo 2 não é recalculado no front (D80).

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
- **CORS e a origem do WebSocket não são autenticação** (D69, D70). Eles impedem que uma página de
  outra origem use a API pelo navegador do jogador, mas um cliente fora do navegador manda o
  `Origin` que quiser.
- **O token do guest fica no `localStorage`** (D77). Recarregar mantém a sessão, mas um XSS no
  front leria o token, que não expira. Mitigações: o React escapa o texto, não há
  `dangerouslySetInnerHTML` e o nickname é restrito (D59); uma CSP no deploy fica para o M7.
- **O vigia de silêncio do WebSocket depende do `PAUSE_MS`** (D76). O cliente não conhece a pausa
  entre rodadas: com `PAUSE_MS` acima de cerca de 25 s, ele reconectaria à toa (sem dano, porque a
  ressincronização reconstrói o estado).
- **A verificação no front só prova a fixação da seed para as rodadas que a página viu antes do
  crash** (D86). Para uma rodada que só apareceu pelo histórico, o painel avisa e compara com o hash
  informado na própria verificação.
- **Sem WebGL nem Canvas 2D, o jogo fica só com texto.** Se o renderer não inicia, ou se o chunk da
  cena falha na rede, a pipa não aparece; o multiplicador em texto, o painel e o histórico
  continuam funcionando (D92, D94).
- **A verificação fica indisponível pelo IP da rede local em HTTP** (D98). O `crypto.subtle` só
  existe em contexto seguro (HTTPS ou `localhost`); apostar e sacar continuam funcionando (D96).
- **A resolução do canvas só muda quando o tamanho do palco muda** (D93). Arrastar a janela para um
  monitor com outro DPR, sem mudar o tamanho CSS, mantém a resolução antiga até o próximo resize.
- **O antialias é decidido uma vez, quando o renderer inicia** (D93): desligado com DPR 2 ou mais,
  em que o backing já fica 1:1 com os pixels físicos.
- **Favicon só em SVG.** Chrome, Edge e Firefox usam o SVG; o Safari pode pedir `/favicon.ico` e
  mostrar um 404 no console.

## Versões

| Ferramenta              | Versão |
| ----------------------- | ------ |
| Node.js                 | 24     |
| pnpm                    | 11.24  |
| TypeScript              | 6.0    |
| NestJS                  | 12.2   |
| MikroORM                | 7.2    |
| React                   | 19.3   |
| Zustand                 | 5.0    |
| Vite                    | 8.3    |
| Vitest                  | 5.0    |
| jsdom                   | 30.1   |
| Testing Library (React) | 16.3   |
| PostgreSQL              | 18     |
| oxlint                  | 1.89   |
| Prettier                | 3.9    |
