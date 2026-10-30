# Imagem da api para o Railway (D103). Contexto: a raiz do repositório.
#   docker build -f apps/api/Dockerfile -t crash-api .

# Node do .nvmrc (o deploy-config.spec.ts confere); pnpm do packageManager.
FROM node:24.20.0-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Manifests antes do código: o install fica em cache enquanto o lockfile não muda.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @crash/api...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @crash/shared build && pnpm --filter @crash/api build
# node_modules só de produção, com o @crash/shared copiado (não linkado).
# --legacy: o pnpm 11 só faz deploy sem ele com injectWorkspacePackages, que
# trocaria os links do shared no dev por cópias (D65).
RUN pnpm --filter @crash/api deploy --prod --legacy /prod/api

FROM node:24.20.0-alpine
# tini como PID 1: o SIGTERM chega ao node e a saída continua 143 (D103).
RUN apk add --no-cache tini
ENV NODE_ENV=production
WORKDIR /app
# Só o que roda: o deploy também copia src/, test/ e as configs.
COPY --from=build --chown=node:node /prod/api/package.json ./
COPY --from=build --chown=node:node /prod/api/node_modules ./node_modules
COPY --from=build --chown=node:node /prod/api/dist ./dist
USER node
# O Railway define PORT; 3000 é o padrão do readAppConfig.
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
