# syntax=docker/dockerfile:1
FROM debian:bookworm-slim

ARG BUN_VERSION=1.4.4
ARG BUN_SHA256=bf8ccbfb2b0b80159e0f9a6d15c55317add8077534dbc6130a3edb52fccb395c

# ── System dependencies ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg2 pass bats jq git unzip \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# ── Bun (verified download via ADD — no install-script pipe) ──────────────────
ADD --checksum=sha256:${BUN_SHA256} \
    https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip \
    /tmp/bun.zip
RUN unzip -q /tmp/bun.zip -d /tmp \
    && install -m 0755 /tmp/bun-linux-x64/bun /usr/local/bin/bun \
    && rm -rf /tmp/bun.zip /tmp/bun-linux-x64

ENV PATH="/usr/local/bin:${PATH}"

WORKDIR /app

# ── Install main project dependencies (cached unless lockfiles change) ────────
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --ignore-scripts

# ── Install MCP server fixture (cached unless fixture lockfile changes) ───────
COPY tests/fixtures/mcp/package.json tests/fixtures/mcp/package-lock.json /app/tests/fixtures/mcp/
WORKDIR /app/tests/fixtures/mcp
RUN npm ci --ignore-scripts
WORKDIR /app

# ── Application source (explicit paths — no repo-wide COPY) ───────────────────
COPY src ./src
COPY tests ./tests
COPY skills ./skills
COPY scripts ./scripts
COPY install.sh AGENTS.md ./

RUN useradd -m -u 10001 -s /usr/sbin/nologin vakt \
    && chown -R vakt:vakt /app

USER vakt

# ── Entrypoint ────────────────────────────────────────────────────────────────
ENTRYPOINT ["/app/tests/docker/entrypoint.sh"]
