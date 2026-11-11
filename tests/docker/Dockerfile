FROM debian:bookworm-slim

ARG BUN_VERSION=1.3.10
ARG BUN_SHA256=f57bc0187e39623de716ba3a389fda5486b2d7be7131a980ba54dc7b733d2e08

# ── System dependencies ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg2 pass bats jq git unzip \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# ── Bun (verified download, no install-script pipe) ───────────────────────────
RUN curl -fsSL --proto '=https' --tlsv1.2 \
      "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip" \
      -o /tmp/bun.zip \
    && echo "${BUN_SHA256}  /tmp/bun.zip" | sha256sum -c - \
    && unzip -q /tmp/bun.zip -d /tmp \
    && install -m 0755 /tmp/bun-linux-x64/bun /usr/local/bin/bun \
    && rm -rf /tmp/bun.zip /tmp/bun-linux-x64

ENV PATH="/usr/local/bin:${PATH}"

WORKDIR /app

# ── Install main project dependencies (cached unless lockfiles change) ────────
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --ignore-scripts

# ── Install MCP server fixture (cached unless fixture lockfile changes) ───────
COPY tests/fixtures/mcp/package.json tests/fixtures/mcp/package-lock.json \
     tests/fixtures/mcp/
RUN cd tests/fixtures/mcp && npm ci --ignore-scripts

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
