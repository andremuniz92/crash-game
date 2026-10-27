FROM node:24-bookworm-slim

ARG USER_UID=1000
ARG USER_GID=100

# Ferramentas que o Claude Code usa no dia a dia
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl ripgrep less procps \
 && rm -rf /var/lib/apt/lists/*

# pnpm na mesma versão do host
RUN npm install -g pnpm@11.24.0

# Alinha o usuário "node" da imagem com o seu usuário do host
RUN groupmod -o -g ${USER_GID} node \
 && usermod -o -u ${USER_UID} -g ${USER_GID} node

USER node
ENV PATH=/home/node/.local/bin:$PATH

# Instalador nativo oficial do Claude Code
RUN curl -fsSL https://claude.ai/install.sh | bash

WORKDIR /workspace
CMD ["sleep", "infinity"]