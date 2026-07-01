# Stofloos self-hosted relay — Bun runtime, SQLite on a mounted volume.
# Build context is the repo root (this is a pnpm workspace):
#   docker build -t stofloos-relay -f infra/relay/Dockerfile .
FROM oven/bun:1.3.10 AS base
WORKDIR /app

# --- Install workspace dependencies (relay + the packages it imports) ---
# pnpm is the workspace package manager, and pnpm (plus dependency build scripts
# such as esbuild) needs Node. The Bun image ships neither Node nor npm, so
# resolve the workspace graph on a Node image and copy the resulting
# node_modules into the Bun runtime stage below.
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@10.24.0

# Copy the manifests needed to resolve the workspace graph, then install.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY patches ./patches
COPY infra/relay/package.json ./infra/relay/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/client-runtime/package.json ./packages/client-runtime/package.json
COPY packages/ssh/package.json ./packages/ssh/package.json
COPY packages/tailscale/package.json ./packages/tailscale/package.json
RUN pnpm install --frozen-lockfile --filter t3code-relay... || pnpm install --filter t3code-relay...

# --- Runtime image ---
FROM base AS runtime
ENV NODE_ENV=production \
    DATABASE_PATH=/data/relay.db \
    PORT=8787
# curl backs the container HEALTHCHECK defined below.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/infra/relay/node_modules ./infra/relay/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY packages ./packages
COPY infra/relay ./infra/relay

# SQLite lives on a mounted volume so data survives redeploys.
VOLUME ["/data"]
EXPOSE 8787
WORKDIR /app/infra/relay

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8787}/health" || exit 1

CMD ["bun", "src/server.ts"]
