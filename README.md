```
 ██╗   ██╗ █████╗ ██╗  ██╗████████╗
 ██║   ██║██╔══██╗██║ ██╔╝╚══██╔══╝
 ██║   ██║███████║█████╔╝    ██║
 ╚██╗ ██╔╝██╔══██║██╔═██╗    ██║
  ╚████╔╝ ██║  ██║██║  ██╗   ██║
   ╚═══╝  ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝
```

> One config. All your AI coding tools. Zero credentials on disk.

[![CI](https://github.com/tn819/vakt/actions/workflows/ci.yml/badge.svg)](https://github.com/tn819/vakt/actions/workflows/ci.yml)
[![Tests](https://github.com/tn819/vakt/actions/workflows/test.yml/badge.svg)](https://github.com/tn819/vakt/actions/workflows/test.yml)
[![CodeQL](https://github.com/tn819/vakt/actions/workflows/codeql.yml/badge.svg)](https://github.com/tn819/vakt/actions/workflows/codeql.yml)
[![Reliability](https://sonarcloud.io/api/project_badges/measure?project=tn819_agentctl&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=tn819_agentctl)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=tn819_agentctl&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=tn819_agentctl)
[![Release](https://img.shields.io/github/v/release/tn819/vakt?label=release&color=22c55e)](https://github.com/tn819/vakt/releases)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/runtime-Bun-fbf0df?logo=bun&logoColor=black)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

```
 configure once
  ┌─────────────────┐
  │   ~/.agents/    │
  │   mcp-config    │──► Claude Code   ~/.claude.json
  │   policy.json   │──► Cursor        ~/.cursor/mcp.json
  │   secrets       │──► Gemini CLI    ~/.gemini/settings.json
  │   skills/       │──► Codex         ~/.codex/config.toml
  └─────────────────┘──► OpenCode      ~/.config/opencode/opencode.json
                    └──► Windsurf      ~/.codeium/windsurf/mcp_config.json
```

Your AI coding tools write API keys into plaintext JSON files. Those files sync to iCloud, end up in dotfiles repos, and get copy-pasted every time a new tool ships. There is no policy layer, no audit trail, and no single source of truth.

**vakt** fixes this. One `~/.agents/` directory holds your entire MCP setup with no credential values inside. Secrets resolve from your OS keychain at sync time. `vakt sync` writes correct config to every installed tool instantly. A policy engine enforces what each MCP server is allowed to do before any tool call goes through.

Configure once. Sync everywhere. Rotate a key in one place. Audit everything.

---

## Install

**macOS / Linux via Homebrew (recommended):**
```bash
brew tap tn819/vakt https://github.com/tn819/vakt
brew install vakt
```

**One-line installer:**
```bash
# Install (download a single binary from GitHub releases)
curl -fsSL https://github.com/tn819/vakt/releases/latest/download/vakt -o /usr/local/bin/vakt
chmod +x /usr/local/bin/vakt

# Or run from source
git clone https://github.com/tn819/vakt
cd vakt && bun install
export PATH="$PATH:$(pwd)/src"

vakt init                             # scaffold ~/.agents/
vakt import-from-everywhere           # pull in your existing provider configs
vakt secrets set GITHUB_TOKEN ghp_... # store in keychain, not in a file
vakt sync                             # write to every installed CLI
```

---

### How vakt compares

| Capability | **vakt** | Smithery | mcp-get | Manual |
|---|:---:|:---:|:---:|:---:|
| Multi-provider sync (6 tools) | ✓ | — | — | — |
| Keychain-backed secrets | ✓ | — | — | — |
| Runtime policy enforcement | ✓ | — | — | — |
| Audit log (SQLite + SIEM export) | ✓ | — | — | — |
| OTel distributed tracing | ✓ | — | — | — |
| Official registry verification | ✓ | ✓ | ✓ | — |
| Cloud sandbox routing (E2B) | ✓ | — | — | — |
| Model router (local/remote LLM) | ✓ | — | — | — |
| Skills portability | ✓ | — | — | — |

### Integrations

**AI tools:** Claude Code · Cursor · Gemini CLI · Codex · OpenCode · Windsurf · Mistral Vibe

**Secrets:** macOS Keychain · pass/GPG · env file (CI)

**Observability:** Grafana Tempo · Jaeger · Honeycomb · Datadog APM · New Relic · SigNoz · Axiom

**SIEM / compliance evidence:** Elastic SIEM · Splunk · Microsoft Sentinel · audit export satisfies SOC 2 CC6.8/CC7.2 and ISO 27001 A.12.4

**Runtime DLP:** [crust](https://github.com/BakeLens/crust) (MCP traffic scanning, 34 built-in patterns)

**Sandboxes:** E2B (built-in) · Daytona · microsandbox · Kata Containers

---

## Contents

- [What vakt unlocks end-to-end](#what-vakt-unlocks-end-to-end)
- [Three principles](#three-principles)
- [Why this exists](#why-this-exists)
- [Security in depth](#-security-in-depth)
- [Standardization in depth](#-standardization-in-depth)
- [Policy engine](#-policy-engine)
- [MCP Registry](#-mcp-registry)
- [Model Router](#-model-router)
- [Interoperability in depth](#-interoperability-in-depth)
- [Commands](#commands)
- [Supported providers](#supported-providers)
- [Directory structure](#directory-structure)
- [Skills](#skills)
- [Testing](#testing)

---

## What vakt unlocks end-to-end

vakt is a complete runtime layer for agentic CLIs encompassing the whole ecosystem from credentials, MCP, auditability, and skills — not just a config manager. Here is the full deployment picture:

```
                      ┌─────────────────────────────────────────────┐
  Agent               │                  vakt                       │
  (Claude/Cursor/…) ──┤                                             │
                      │  policy.json  ──► proxy  ──► MCP server     │
                      │  audit.db     ◄──         ◄──               │
                      │  OTel spans   ──────────────────────────►   │
                      │               runtime: local | cloud sandbox │
                      └─────────────────────────────────────────────┘
```

### 1 — Ship your full config anywhere

`~/.agents/` contains no secrets — only named references (`secret:GITHUB_TOKEN`). The entire directory is safe to commit, push to a dotfiles repo, or copy to a remote machine. One `vakt sync` and every installed tool has the complete setup.

```bash
# On a new machine or a CI runner
git clone your-dotfiles
cd your-dotfiles && vakt sync
# → all providers configured, zero credential exposure
```

### 2 — Run MCP servers in isolated cloud sandboxes

vakt integrates the [E2B](https://e2b.dev) runtime so any MCP server can be moved off your local machine into an isolated cloud sandbox — same config, same policy, same audit trail.

```bash
vakt config set runtime.e2b.api_key secret:E2B_API_KEY
vakt runtime set github e2b       # route this server to the cloud
vakt runtime set filesystem local  # keep this one local
vakt runtime list                  # view all assignments
```

The community maintains a broader catalogue of sandbox technologies at [awesome-sandbox](https://github.com/restyler/awesome-sandbox). Key options relevant to MCP server isolation:

| Sandbox | Technology | SaaS | Self-host | Notes |
|---------|-----------|------|-----------|-------|
| [E2B](https://e2b.dev) | Firecracker microVMs | ✓ | ✓ | Built for AI agent workloads; already integrated |
| [Daytona](https://daytona.io) | Containers | ✓ | ✓ | <200ms startup; dev-environment focused |
| [microsandbox](https://github.com/microsandbox/microsandbox) | libkrun microVMs | — | ✓ | Lightweight self-hosted alternative |
| [Kata Containers](https://katacontainers.io) | MicroVMs on Kubernetes | — | ✓ | VM-level isolation, container UX |
| [Fly.io](https://fly.io) | Firecracker | ✓ | — | Persistent storage + global networking |
| [gVisor](https://gvisor.dev) | Syscall interception | via Cloud Run | ✓ | Google's approach; used in GKE Sandbox |

#### Coding agent sandbox setup

Each provider has a playbook covering prerequisites, implementation guide, and e2e tests. The one-liner setups below store credentials in your keychain and make the config shareable with any collaborator or CI runner.

**Docker** (local — no credentials needed, start here) · [playbook](docs/playbooks/sandbox-docker.md) · [e2e tests](tests/e2e/agent-docker.bats)
```bash
vakt config set runtime.docker.image node:20-slim
vakt runtime set my-coder docker
```

**E2B** (Firecracker microVMs) · [playbook](docs/playbooks/sandbox-e2b.md) · [e2e tests](tests/e2e/agent-e2b.bats)
```bash
vakt secrets set E2B_API_KEY e2b_...            # stored in keychain
vakt config set runtime.e2b.api_key secret:E2B_API_KEY
vakt runtime set my-coder e2b
```

**Daytona** (containers, <200ms) · [playbook](docs/playbooks/sandbox-daytona.md) · [e2e tests](tests/e2e/agent-daytona.bats)
```bash
vakt secrets set DAYTONA_API_KEY dt_...
vakt config set runtime.daytona.api_url https://app.daytona.io/api
vakt config set runtime.daytona.api_key secret:DAYTONA_API_KEY
vakt runtime set my-coder daytona
```

**microsandbox** (self-hosted libkrun) · [playbook](docs/playbooks/sandbox-microsandbox.md) · [e2e tests](tests/e2e/agent-microsandbox.bats)
```bash
msb daemon start                                # no API key needed
vakt config set runtime.microsandbox.api_url http://localhost:7681
vakt runtime set my-coder microsandbox
```

**Kata Containers** (MicroVMs on Kubernetes) · [playbook](docs/playbooks/sandbox-kata-containers.md) · [e2e tests](tests/e2e/agent-kata.bats)
```bash
vakt config set runtime.kata.kubeconfig ~/.kube/config
vakt config set runtime.kata.namespace vakt-agents
vakt config set runtime.kata.runtime_class kata-qemu
vakt runtime set my-coder kata
```

**Fly.io** (Firecracker + global edge) · [playbook](docs/playbooks/sandbox-fly-io.md) · [e2e tests](tests/e2e/agent-fly.bats)
```bash
vakt secrets set FLY_API_TOKEN $(fly auth token)
vakt config set runtime.fly.api_token secret:FLY_API_TOKEN
vakt config set runtime.fly.app vakt-agent-sandbox
vakt runtime set my-coder fly
```

**gVisor** (syscall interception) · [playbook](docs/playbooks/sandbox-gvisor.md) · [e2e tests](tests/e2e/agent-gvisor.bats)
```bash
# Cloud Run variant
vakt secrets set GCP_SA_KEY "$(cat service-account.json | base64)"
vakt config set runtime.gvisor.backend cloud-run
vakt config set runtime.gvisor.project my-gcp-project
vakt runtime set my-coder gvisor

# Local runsc variant (Linux)
vakt config set runtime.gvisor.backend docker
vakt config set runtime.gvisor.runtime_class runsc
vakt runtime set my-coder gvisor
```

**Coder.com** (persistent workspaces — repo + toolchain pre-installed by Terraform template) · [playbook](docs/playbooks/sandbox-coder.md) · [e2e tests](tests/e2e/agent-coder.bats)
```bash
vakt secrets set CODER_TOKEN "$(coder tokens create vakt --lifetime 8760h)"
vakt secrets set CODER_URL   https://coder.example.com
vakt config set runtime.coder.url      secret:CODER_URL
vakt config set runtime.coder.token    secret:CODER_TOKEN
vakt config set runtime.coder.org      default
vakt config set runtime.coder.template my-agent-template
vakt runtime set my-coder coder
```

Config is always shareable — secrets stay in your keychain, never in `~/.agents/`:
```bash
# Teammate onboarding: they run their own vakt secrets set, then:
vakt sync   # → all providers configured with their own credentials
```

### 3 — Enforce tool policy at runtime

`vakt sync --with-proxy` rewrites every provider config so all MCP traffic flows through vakt first. `policy.json` is evaluated on every `tools/call` before it reaches the server — with no changes to the server or the client.

```bash
vakt sync --with-proxy
# → provider configs now read: { "command": "vakt", "args": ["proxy", "github"] }
# → policy.json evaluated on every tool call, fail-closed by default
```

### 4 — Full audit trail

Every tool call is recorded in `~/.agents/audit.db` (SQLite, zero dependencies) with server name, tool name, policy result, session ID, provider, and timing. Query it any time:

```bash
vakt audit show --server github --last 24h
vakt audit export --since 2025-01-01 | jq '[.[] | select(.policy_result == "deny")]'
```

Pipe the export into any SIEM or log platform for compliance evidence. For teams requiring formal compliance:
- **SOC 2 Type II** — tool call logs satisfy CC6.8 (logical access) and CC7.2 (monitoring)
- **ISO 27001 / A.12.4** — audit logging and monitoring controls
- [**Elastic SIEM**](https://www.elastic.co/security/siem) — ingest `audit export` JSON via Filebeat
- [**Splunk**](https://www.splunk.com) — ship via HEC or Splunk Connect for JSON
- [**Microsoft Sentinel**](https://azure.microsoft.com/en-us/products/microsoft-sentinel) — custom connector from audit export

### 5 — Distributed tracing with OpenTelemetry

vakt emits an OTLP trace span for every tool call (server name, tool name, policy result, session ID, latency). Point it at any OTLP-compatible backend:

```bash
vakt config set otel.endpoint http://localhost:4317   # any OTLP gRPC endpoint
vakt config set otel.enabled true
```

| Backend | Type | Endpoint format |
|---------|------|----------------|
| [Grafana Tempo](https://grafana.com/oss/tempo/) + [Grafana Cloud](https://grafana.com/products/cloud/) | OSS / SaaS | `https://tempo-prod-*.grafana.net:443` |
| [Jaeger](https://www.jaegertracing.io) | OSS | `http://localhost:4317` (OTLP gRPC) |
| [Honeycomb](https://www.honeycomb.io) | SaaS | `https://api.honeycomb.io:443` |
| [Datadog APM](https://www.datadoghq.com/product/apm/) | SaaS | `https://trace.agent.datadoghq.com` |
| [New Relic](https://newrelic.com/platform/opentelemetry) | SaaS | `https://otlp.nr-data.net:4317` |
| [SigNoz](https://signoz.io) | OSS / SaaS | `http://localhost:4317` |
| [OpenObserve](https://openobserve.ai) | OSS / SaaS | `http://localhost:5081/api/default` |
| [Axiom](https://axiom.co) | SaaS | `https://api.axiom.co` |

Traces are emitted lazily — the OTel SDK is never loaded if no endpoint is configured.

---

## Three principles

### 🔐 Security — credentials belong in a keychain, not a JSON file

Most AI tools write your API keys directly into dotfiles like `~/.cursor/mcp.json`. Those files get swept into iCloud, Dropbox, dotfile repos, and screenshots. **vakt treats this as unacceptable by design.**

`~/.agents/mcp-config.json` contains only named references — `secret:GITHUB_TOKEN` — never the values. Secrets are resolved from your OS keychain at sync time and exist in memory only. You can commit, share, or `cat` your entire `~/.agents/` directory with zero risk.

### 📐 Standardization — one schema, one source of truth

Every provider uses a different shape for the same data. Cursor wants `mcpServers`. OpenCode wants `mcp` with combined `command` arrays. Codex wants TOML. Gemini wants `mcpServers` but with different HTTP field names.

vakt defines a single canonical schema and translates to each provider's format at sync time. Adding a new provider is a JSON entry in `providers.json` — no code changes. The translation layer is data-driven and fully inspectable.

### 🔗 Interoperability — the work you put in travels with you

Skills, server definitions, and preferences live in `~/.agents/` in open formats — not locked inside any vendor's directory. `vakt sync` populates every installed tool instantly. `vakt import-from-everywhere` consolidates anything you've already built. Your setup is fully portable across CLIs, machines, and teammates.

---

## Why this exists

| Problem | How vakt solves it |
|---|---|
| Built a great MCP server — only works in one tool | `vakt sync` instantly deploys it to every installed CLI |
| Spent hours perfecting a skill — not portable | Symlinked from `~/.agents/skills/` into every provider |
| New AI tool ships — start over from scratch | One sync command, full context, zero setup |
| MCP config scattered and duplicated across 6 tools | Single `~/.agents/mcp-config.json` as source of truth |
| API keys in plaintext JSON files | Resolved from OS keychain at sync time, never persisted |
| Every tool uses a different config format | Canonical schema with per-provider translation layer |
| Config tied to a single machine | `~/.agents/` is safe to version-control and share — no secrets inside |
| Can't audit what credentials you've handed to AI tools | Every secret is a named reference — full visibility, zero exposure |
| No control over which tools MCP servers can invoke | Per-server tool policy with glob matching and fail-closed defaults |

---

## 🔐 Security in depth

Full threat model and responsible disclosure: [SECURITY.md](SECURITY.md)

### Guarantees

- **Zero plaintext secrets on disk.** `~/.agents/mcp-config.json` never contains credential values — only named references (`secret:MY_KEY`). Resolved values exist in memory only, for the duration of a sync.
- **OS keychain by default.** macOS Keychain on macOS, `pass` (GPG-encrypted) on Linux. No custom encryption — the same store your browser and SSH agent trust.
- **Provider configs are not the source of truth.** What vakt writes to `~/.cursor/mcp.json` etc. is the resolved output for that tool's process. It can be regenerated at any time. `~/.agents/` is the only thing you need to protect — and it contains no secrets.
- **No secrets in shell profiles.** `GITHUB_TOKEN=...` in `.bashrc` is a credential leak. vakt's keychain backend bypasses shell profiles entirely.
- **Auditable by design.** `cat ~/.agents/mcp-config.json` and share it freely. Every credential is a named reference you can audit without exposing anything.

### Threat model

| Threat | vakt's defence |
|--------|----------------|
| Dotfiles repo accidentally public | `mcp-config.json` is safe to commit — no secrets inside |
| iCloud / Dropbox syncing `~/.cursor/` | Credentials come from keychain at sync time, not stored long-term in provider dirs |
| Screenshot or screen share leaks config | Nothing sensitive in any file vakt owns |
| Compromised AI tool reads its own config | No credentials in `~/.agents/` — only opaque named references |
| Shoulder surfing during `vakt list` | List output never prints secret values |

### How secret references work

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "secret:GITHUB_TOKEN"
    }
  },
  "my-api": {
    "transport": "http",
    "url": "https://api.example.com/mcp",
    "headers": {
      "Authorization": "Bearer secret:MY_API_KEY"
    }
  }
}
```

At sync time, `secret:GITHUB_TOKEN` is resolved from your keychain and written into the provider config. **The reference string is what lives on disk, gets committed, and gets shared — never the value.**

**Backends:** macOS Keychain · `pass` / GPG (Linux) · base64 env file (CI / fallback)

### Runtime log security with crust

vakt secures the **configuration layer** — secrets never reach a config file. But MCP servers can still leak sensitive data at runtime: a tool response that echoes back an API key, a log line that includes a token, an agent that exfiltrates data through a seemingly innocuous output.

[**crust**](https://github.com/BakeLens/crust) covers the **runtime layer**. It wraps any MCP server as a stdio proxy, intercepting JSON-RPC traffic in both directions and scanning it against 34 built-in DLP patterns before it reaches the agent or gets written to logs.

| Layer | Tool | What it protects |
|-------|------|-----------------|
| Configuration | **vakt** | Secrets never written to config files or `~/.agents/` |
| Runtime / logs | **[crust](https://github.com/BakeLens/crust)** | Secrets and sensitive data scrubbed from MCP traffic and logs |

---

## 📐 Standardization in depth

The AI tool ecosystem has no agreed config standard. Each provider invented its own:

| Provider | Format | Server key | HTTP field | stdio shape |
|---|---|---|---|---|
| Cursor | JSON | `mcpServers` | `url` | `command` + `args` |
| OpenCode | JSON | `mcp` | `url` | combined `command` array |
| Gemini | JSON | `mcpServers` | `httpUrl` | `command` + `args` |
| Codex | TOML | `mcp_servers` | `url` | `command` + `args` |
| Windsurf | JSON | `mcpServers` | `serverUrl` | `command` + `args` |

vakt's canonical schema maps cleanly to all of these. Adding a new provider is a JSON entry in `providers.json` — no code changes.

Path variables in `mcp-config.json` are also standardized:

```json
{ "paths": { "code": "~/Projects", "vault": "~/Documents/vault" } }
```

```json
{ "command": "npx", "args": ["server-filesystem", "{{paths.code}}"] }
```

---

## 🔒 Policy engine

vakt enforces per-server tool policy at sync time and (via the daemon proxy) at runtime. Policy lives in `~/.agents/policy.json`:

```json
{
  "version": "1",
  "default": "deny",
  "registryPolicy": "warn-unverified",
  "servers": {
    "github": {
      "tools": {
        "allow": ["list_repos", "get_file", "create_issue"],
        "deny":  ["delete_repo"]
      }
    },
    "*": {
      "tools": { "deny": ["*exec*", "*shell*", "*eval*"] }
    }
  }
}
```

Rules use glob matching (`*` as wildcard). Priority: specific deny > wildcard deny > specific allow > wildcard allow > default. Fail-closed by default.

`registryPolicy` options:
- `allow-unverified` — sync any server (default)
- `warn-unverified` — warn on servers not in the MCP registry
- `registry-only` — block sync if any server is unverified

---

## 📦 MCP Registry

vakt integrates with the [official MCP registry](https://registry.modelcontextprotocol.io). Search and install servers by registry ID — secrets are pre-wired automatically:

```bash
vakt search github
#   io.github.modelcontextprotocol/server-github   The official GitHub MCP server
#   ...

vakt add-server gh io.github.modelcontextprotocol/server-github
# ✓ Added gh from registry
# Secrets needed:
#   vakt secrets set GITHUB_PERSONAL_ACCESS_TOKEN <value>
```

Registry-resolved servers store their `registry` and `version` fields in `mcp-config.json`, enabling policy enforcement and future upgrade detection.

---

## 🔄 Model Router

Route completion requests between local and frontier LLMs based on request characteristics. Save costs by sending routine completions to local models while reserving frontier APIs for complex requests.

```bash
vakt route                              # Start router on default port 4000
vakt route --port 4001                  # Custom port
vakt route --test --tokens 15000        # Test routing logic
```

Configure in `~/.agents/config.json`:

```json
{
  "modelRouter": {
    "port": 4000,
    "backends": {
      "local": { "url": "http://localhost:8000/v1", "maxCtx": 8192 },
      "mistral": { "url": "https://api.mistral.ai/v1", "apiKey": "secret:MISTRAL_KEY", "maxCtx": 131072 }
    },
    "rules": [
      { "if": { "promptTokens": { "gt": 16000 } }, "use": "mistral" },
      { "if": { "toolCount": { "gt": 5 } }, "use": "mistral" },
      { "if": { "hasCode": true }, "use": ["mistral", "local"] },
      { "use": "local" }
    ]
  }
}
```

Point your AI tool at `http://localhost:4000/v1` — vakt routes transparently.

---

## 🔗 Interoperability in depth

### Any tool, instantly

```bash
# Just installed Windsurf for the first time
vakt sync
# → ~/.codeium/windsurf/mcp_config.json written with all your servers
# → ~/.codeium/windsurf/skills/ symlinked to your skills
# Done. Full context, zero setup.
```

### Import from anywhere

```bash
vakt import-from-everywhere
# Reads: ~/.cursor/mcp.json, ~/.gemini/settings.json, ~/.mcp.json,
#        ~/.codex/config.toml, ~/.config/opencode/opencode.json ...
# Merges into ~/.agents/mcp-config.json (skips duplicates)
```

### Share with a teammate

```bash
# On your machine
cat ~/.agents/mcp-config.json  # safe to share — no secrets
git push

# On their machine
git pull
vakt secrets set GITHUB_TOKEN ghp_...  # they use their own keychain
vakt sync
# → identical MCP setup, their own credentials
```

---

## Commands

```
vakt init                        Scaffold ~/.agents/, import existing configs
vakt import-from-everywhere      Pull MCP servers and skills from all detected providers
vakt sync                        Write config to every installed provider
vakt sync --dry-run              Preview what would be written

vakt search <query>              Search the MCP registry
vakt add-server NAME REGISTRY-ID Add a server from the MCP registry
vakt add-server NAME CMD [ARGS]  Register a stdio MCP server directly
vakt add-server NAME --http URL  Register an HTTP MCP server
vakt add-skill ./path/to/skill   Link a local skill directory
vakt add-skill https://...       Clone and link a skill from git

vakt list                        Show servers, skills, and secrets
vakt list servers
vakt list skills
vakt list secrets

vakt secrets set KEY VALUE       Store a secret in your OS keychain
vakt secrets get KEY             Retrieve a secret
vakt secrets delete KEY          Remove a secret
vakt secrets list                List all stored secret keys (values never shown)

vakt config list                 Show current config
vakt config set paths.code ~/Projects
vakt config set otel.endpoint http://collector:4317

vakt audit show                  Show recent MCP tool call audit log
vakt audit show --server github  Filter by server name
vakt audit show --last 24h       Show last 24 hours (1h|24h|7d|4w)
vakt audit export                Export audit log as JSON
vakt audit export --since <iso>  Filter by date

vakt daemon start                Start the background daemon
vakt daemon stop                 Stop the daemon
vakt daemon status               Show daemon and server process status
```

---

## Supported providers

| Provider | Config written | Skills |
|---|---|---|
| **Claude Code** | `~/.claude.json` | `~/.claude/skills/` |
| **Cursor** | `~/.cursor/mcp.json` | `~/.cursor/skills/` |
| **Gemini CLI** | `~/.gemini/settings.json` | native (`~/.agents/skills/`) |
| **Codex** | `~/.codex/config.toml` | `~/.codex/skills/` |
| **OpenCode** | `~/.config/opencode/opencode.json` | `~/.config/opencode/skills/` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | `~/.codeium/windsurf/skills/` |
| **Mistral Vibe** | `~/.vibe/config.toml` | `~/.vibe/skills/` |

New provider? Add an entry to `providers.json`. No code changes required.

---

## Directory structure

```
~/.agents/
├── config.json          # paths, provider list, secrets backend, otel config
├── mcp-config.json      # MCP server definitions (safe to commit — no secrets)
├── policy.json          # tool allow/deny rules per server (optional)
├── audit.db             # SQLite audit log of tool calls and sync events
├── AGENTS.md            # shared agent preferences / persona
└── skills/
    ├── gh-cli/          # symlinked into every provider
    ├── sql-reviewer/
    └── ...
```

---

## Skills

Skills are `SKILL.md` files with YAML frontmatter — instructions that travel with the agent into any context. vakt symlinks `~/.agents/skills/` into every provider's skills directory.

```markdown
---
name: sql-reviewer
description: Review SQL queries for performance and safety issues
---

When reviewing SQL, always check for...
```

```bash
vakt add-skill https://github.com/vercel-labs/agent-skills react-best-practices
```

Browse: [skills.sh](https://skills.sh) · Spec: [agentskills.io](https://agentskills.io)

---

## Testing

```bash
bun test tests/unit/        # fast unit tests (~30ms)
bats --recursive tests/     # full e2e suite (~2min)
```

Tests run in a fully sandboxed `HOME` — nothing touches your real config files or keychain.

Contributors and agents: see [AGENTS.md](AGENTS.md) for org-wide workflow rules (local lint and pre-commit before push, PR readiness, CI expectations).

---

## License

MIT
