# syntax=docker/dockerfile:1.6
# Project Workspace — production Docker image
# Publishes to ghcr.io/outsourc-e/hermes-workspace
#
# Build locally:
#   docker build -t hermes-workspace .
# Run:
#   docker run -p 3000:3000 -e HERMES_API_URL=http://host.docker.internal:8642 hermes-workspace
# Or pull pre-built:
#   docker pull ghcr.io/outsourc-e/hermes-workspace:latest
#
# ─── build stage ─────────────────────────────────────────────────────────
FROM node:22-slim AS build
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install deps (cache-friendly: copy only manifests first)
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY workspace-daemon/package.json workspace-daemon/
RUN pnpm install --frozen-lockfile

# Copy sources and build
COPY . .
RUN pnpm build

# ─── runtime stage ────────────────────────────────────────────────────────
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r workspace && useradd -r -g workspace -u 10010 workspace

WORKDIR /app

# Copy build artefacts + runtime deps
COPY --from=build --chown=workspace:workspace /app/dist ./dist
COPY --from=build --chown=workspace:workspace /app/node_modules ./node_modules
COPY --from=build --chown=workspace:workspace /app/package.json ./package.json
COPY --from=build --chown=workspace:workspace /app/skills ./skills

USER workspace
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    HERMES_API_URL=http://hermes-agent:8642

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--max-old-space-size=2048", "dist/server/server.js"]
