# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS dependencies
# better-sqlite3 compila o binding nativo para a arquitetura do container.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# Build: site estático do Vite (com manifesto) + checagem de tipos do servidor
FROM dependencies AS build
COPY tsconfig.json tsconfig.server.json vite.config.ts index.html login.html admin.html ./
COPY src ./src
COPY public ./public
COPY server ./server
RUN npm run build

FROM dependencies AS runtime-dependencies
RUN npm prune --omit=dev && npm cache clean --force

# Produção: servidor Node que exige login e serve o dist/
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=47653 \
    DATABASE_PATH=/app/data/xilo.sqlite \
    DIST_PATH=/app/dist
COPY --from=runtime-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
# a pasta inteira: os testes ficam de fora pelo .dockerignore
COPY --chown=node:node server ./server
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 47653
CMD ["node", "--import", "tsx", "server/index.ts"]
