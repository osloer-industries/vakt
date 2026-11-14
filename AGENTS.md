# Agent Development Guidelines for vakt

## Project Overview

`vakt` is an enterprise MCP server and skills manager that syncs approved servers and policies across all AI coding tools (Claude Code, Cursor, Windsurf, Gemini CLI, Codex, OpenCode). It provides central policy, secrets management, audit logging, a skills registry, and supply chain verification — with zero infrastructure overhead.

## Agent workflow (org-wide, keep identical across osloer-industries repos)

These rules apply to every agent (Cursor, Grok Bot, any other) working in this repo.

### Quality
- Never cut corners on quality or architecture. Fix root causes. No `continue-on-error`, `|| true`, skipped or deleted tests, lowered thresholds, ignore or suppress comments, `NOSONAR`, exclusions, new lint/Sonar rule exceptions or overrides, audit ignores, `--legacy-peer-deps`, or `--force`.
- SonarCloud issues are resolved only by fixing code, never by marking them false positive or won't-fix.
- Scripts are TypeScript on Node 24, never Python.
- `AGENTS.md` is the only agent instruction file; never add `CLAUDE.md` or tool-specific rule files.

### CI and workflows
- Pin GitHub Actions by full commit SHA with an accurate version comment. Org reusables from `osloer-industries/.github` are pinned `@<full sha> # v0.x.y` (a release tag, never `# main`).
- Every CI job feeds the single `ci-passed` aggregate job, including Workflow security, CodeQL and the SonarCloud zero-issues job. `ci-passed` is the only required status check.
- Only Dependabot patch/minor bumps and patch/minor release PRs auto-merge. Majors (or pre-1.0 breaking changes) never auto-merge; they wait for a human.
- Run the repo's linters, tests and pre-commit checks locally before pushing. The pre-commit hook is never skipped (`--no-verify` is not allowed).
- Push, then stop: do not wait on, watch or poll CI. Failures are handed back to you.

### Pull requests
- Keep PRs focused and reviewable, link the issues they close, and prefer simplification (less code, fewer dependencies, removed duplication).
- Resolve conflicts by merging the base branch in. Never rebase a pushed branch, never force-push, never bypass branch protection.
- A PR is ready for review only when all of these hold: it has no conflicts and is up to date with `main`; every check on the current head is green (pending is not ready); and it has no unresolved review threads, requested changes or open SonarCloud issues. Fix anything short of that yourself. Ask a human only when a real decision or ambiguity needs one.
- Never touch secrets, permissions, repo settings or rulesets without explicit human approval.

## Language: TypeScript + Bun

**vakt is written in TypeScript, compiled and run with Bun** (not Node as the application runtime). No shell scripts in `src/` except `src/vakt.sh` (CLI shim) and `src/lib/secrets.sh` (legacy bash backend).

- All source code in `src/` is `.ts`
- Bun is the runtime, test runner, and bundler
- **Zod is the schema/validation library — all external data must be parsed through a Zod schema before use**
- `commander` handles the CLI surface
- `smol-toml` for TOML parsing (Codex provider)
- `@modelcontextprotocol/sdk` for the MCP proxy
- `@opentelemetry/sdk-node` + `@opentelemetry/api` for OTel spans
- `@e2b/code-interpreter` for cloud runtime

### Required toolchain

| Tool | Purpose | Install |
|------|---------|---------|
| `bun` | Runtime, bundler, test runner | `curl -fsSL https://bun.sh/install \| bash` |
| `bats` | End-to-end CLI tests | `brew install bats-core` |

```bash
bun run dev                                           # run from source
bun build src/index.ts --compile --outfile dist/vakt  # single binary
bun test tests/unit/                                  # unit tests
bats tests/e2e/                                       # e2e tests
bun test tests/unit/ && bats tests/e2e/               # full suite
```

## Architecture

- `src/index.ts` — CLI entry point (commander), registers all commands
- `src/providers.json` — provider registry (data-driven, validated by ProvidersSchema)
- `src/vakt.sh` — thin shim: `exec bun run src/index.ts "$@"`
- `src/commands/` — one file per top-level command (add-server, add-skill, sync, list, …)
- `src/daemon/` — background process manager and IPC server
- `src/lib/` — shared libraries (pure functions, no CLI side effects)
- `tests/e2e/` — bats end-to-end tests (invoke the vakt CLI directly)
- `skills/` — bundled skills (bash scripts + SKILL.md)
- `install.sh` — install script

## Schemas: Single Source of Truth

**`src/lib/schemas.ts` owns every type.** Never define types inline in commands or libs — always import from schemas.

Key schemas:

```typescript
AgentConfigSchema   // ~/.agents/config.json — paths, providers, secretsBackend, otel, runtime
McpConfigSchema     // ~/.agents/mcp-config.json — record of McpServer entries
ProvidersSchema     // src/providers.json — the 6-provider registry
PolicySchema        // ~/.agents/policy.json — allow/deny/ask rules per server/tool

StdioServerSchema   // { command, args?, env?, cwd? }
HttpServerSchema    // { transport: "http", url, headers? }
McpServerSchema     // z.union([StdioServerSchema, HttpServerSchema])

PolicySchema        // { version, default, registryPolicy, servers? }
```

**All external JSON/TOML must be parsed via `Schema.parse()` or `Schema.safeParse()` before use.**
- `Schema.parse()` for internal/system files (throw on bad data)
- `Schema.safeParse()` + user-readable error for user-owned config files

```typescript
// Good — validates at the boundary
const cfg = AgentConfigSchema.parse(JSON.parse(readFileSync(path, "utf-8")));

// Good — user-facing error
const result = PolicySchema.safeParse(raw);
if (!result.success) {
  console.error(`Invalid policy.json: ${result.error.issues[0]?.message}`);
  process.exit(1);
}
```

## Code Style

### TypeScript conventions

- Strict mode: `strict: true`, `noUncheckedIndexedAccess: true` — no exceptions
- No `any`. Use `unknown` + Zod for truly dynamic shapes
- Named exports everywhere. No default exports except `src/index.ts`
- Async I/O: use Bun APIs (`Bun.file`, `Bun.spawn`, `Bun.write`) consistently
- Error messages are user-facing; never expose raw stack traces at CLI output level
- `try/catch` only at command action boundaries — let errors propagate inside lib functions

### Naming

| Thing | Convention | Example |
|-------|------------|---------|
| Files | kebab-case | `add-server.ts` |
| Functions / vars | camelCase | `resolveSecretRefs` |
| Classes / Types | PascalCase | `PolicyEngine`, `McpConfig` |
| Zod schemas | PascalCase + Schema suffix | `AgentConfigSchema` |
| Inferred types | declared immediately after schema | `type AgentConfig = z.infer<typeof AgentConfigSchema>` |

### Command registration pattern

```typescript
// src/commands/my-command.ts
import type { Command } from "commander";

export function registerMyCommand(program: Command): void {
  program
    .command("my-command <required-arg>")
    .description("One-line description")
    .option("--dry-run", "preview without applying")
    .action(async (arg, opts) => {
      // validate → call lib functions → print output
    });
}
```

Register in `src/index.ts`:
```typescript
import { registerMyCommand } from "./commands/my-command";
registerMyCommand(program);
```

### Output helpers (use these consistently)

```typescript
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red    = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;

const ok   = (s: string) => console.log(`  ${green("✓")}  ${s}`);
const warn = (s: string) => console.log(`  ${yellow("⚠")}  ${s}`);
const info = (s: string) => console.log(`  ${cyan("→")}  ${s}`);
const err  = (s: string) => console.log(`  ${red("✗")}  ${s}`);
```

## Testing Requirements

### MANDATORY: Every command needs both unit and e2e tests

```bash
bun test tests/unit/   # fast, no filesystem, no secrets backend calls
bats tests/e2e/        # full CLI surface, sandboxed $HOME
```

### Unit test structure

```typescript
// tests/unit/my-lib.test.ts
import { describe, it, expect } from "bun:test";
import { myFunction } from "../../src/lib/my-lib";

describe("myFunction", () => {
  it("returns expected value", () => {
    expect(myFunction("input")).toBe("output");
  });
  it("throws ZodError on invalid input", () => {
    expect(() => myFunction("bad")).toThrow();
  });
});
```

### E2E test structure

```bash
#!/usr/bin/env bats
load '../test_helper'

setup() {
  setup_test_env        # sandboxes $HOME to a temp dir
  mock_secrets_backend  # sets AGENTS_SECRETS_BACKEND=env, no keychain
  vakt init
}
teardown() { teardown_test_env; }

@test "command succeeds" {
  run vakt some-command
  [ "$status" -eq 0 ]
  [[ "$output" == *"expected text"* ]]
}
```

**`setup_test_env` must always be called first.** It sets `$HOME` and `$AGENTS_DIR` to a temporary sandbox so tests never touch the real `~/.agents/`, `~/.cursor/`, etc.

**`mock_secrets_backend` must be called in setup.** It sets `AGENTS_SECRETS_BACKEND=env` to avoid any macOS Keychain dialogs during tests. Never remove this.

### Coverage requirements per command

- ✅ Success path (happy path)
- ✅ Error handling (invalid inputs, missing args, bad state)
- ✅ Edge cases (no init yet, empty config, special characters)
- ✅ Integration (init → configure → run)

## Feature Status

### Implemented ✅

| Feature | Command | Key files |
|---------|---------|-----------|
| Initialization | `vakt init` | `commands/init.ts` |
| Sync to 6 providers | `vakt sync [--dry-run] [--mcp-only] [--skills-only]` | `commands/sync.ts`, `lib/resolver.ts` |
| Add MCP server (+ registry) | `vakt add-server <name> <cmd> [args]` | `commands/add-server.ts`, `lib/registry.ts` |
| Add skill | `vakt add-skill <path>` | `commands/add-skill.ts` |
| Config get/set | `vakt config [get\|set\|list]` | `commands/config.ts` |
| Secrets (keychain/pass/env) | `vakt secrets [set\|get\|delete\|list]` | `commands/secrets.ts`, `lib/secrets.ts` |
| List servers/skills | `vakt list` | `commands/list.ts` |
| Import from all providers | `vakt import-from-everywhere` | `commands/import.ts` |
| Upgrade vakt binary | `vakt upgrade` | `commands/upgrade.ts` |
| MCP registry search | `vakt search <query>` | `commands/search.ts`, `lib/registry.ts` |
| SQLite audit log | `vakt audit [show\|export]` | `commands/audit.ts`, `lib/audit.ts` |
| OpenTelemetry spans | automatic | `lib/otel.ts` |
| MCP stdio proxy + policy | `vakt proxy <name>` | `commands/proxy.ts`, `lib/policy.ts` |
| Daemon + IPC | `vakt daemon [start\|stop\|status]` | `commands/daemon.ts`, `daemon/` |
| E2B cloud runtime | `vakt runtime [list\|set]` | `commands/runtime.ts`, `lib/runtime.ts` |
| Single compiled binary | `dist/vakt` | `bun build --compile` |
| Remote config pull | `vakt pull [--dry-run] [--policy-only]` | `commands/pull.ts`, `lib/remote.ts` |
| Central policy merge | automatic on `vakt pull` | `lib/policy.ts` — `loadMergedPolicy`, `mergePolicies` |
| Lockdown mode | `vakt lockdown [--dry-run] [--generate-mdm]` | `commands/lockdown.ts` |
| Drift watcher | `vakt watch [--revert] [--alert-only]` | `commands/watch.ts` |
| Enterprise secrets | `secret:vault:` / `secret:op:` / `secret:azure:` refs | `lib/secrets.ts` — `vaultGet`, `opGet`, `azureGet` |
| Skills registry | `vakt registry skills [list\|search\|install]` | `commands/registry.ts` |
| Supply chain verify | `lib/verify.ts` | `lib/verify.ts` — `verifyOci`, `verifyNpm` |
| Model router | `vakt route [--port] [--test]` | `commands/route.ts`, `lib/router.ts` |

### TODO

| Feature | Notes | Issue |
|---------|-------|-------|
| `autoSync` in `sync.ts` | Check `config.remote?.autoSync` at top of sync, call pull first | #110 (P2 - strategic foundation) |
| GitHub Pages site | `docs/` — landing page, docs, enterprise guide | #111 (P3 - longer arc) |
| Category-based routing | Intent classification layer above rule-based router | #104 (P3, depends on #101) |

## Secret Reference Syntax

Resolved at sync time by `resolveSecretRefs()` in `src/lib/secrets.ts`:

| Reference | Backend | Status |
|-----------|---------|--------|
| `secret:KEY` | Local (keychain / pass / env) | ✅ |
| `secret:vault:path/to/key` | HashiCorp Vault CLI (`vault kv get`) | ✅ |
| `secret:op:vault/item/field` | 1Password CLI (`op item get`) | ✅ |
| `secret:azure:vault-name/secret` | Azure CLI (`az keyvault secret show`) | ✅ |

## Path Templating

`expandPaths()` in `src/lib/config.ts` expands these in `mcp-config.json` args/URLs:

- `{{paths.code}}` → `config.paths.code`
- `{{paths.documents}}` → `config.paths.documents`
- `{{paths.vault}}` → `config.paths.vault`

## Sync Process

1. `loadAgentConfig()` → Zod-parsed `AgentConfig`
2. `loadMcpConfig()` → Zod-parsed `McpConfig`
3. `loadProviders()` → Zod-parsed `Providers` from `providers.json`
4. For each enabled provider: `resolveAll()` → inject secrets, expand `{{paths.*}}`
5. `formatForProvider()` → map to provider-specific field names
6. `writeJsonConfig()` (JSON) or `toToml()` (Codex TOML) → write to provider path
7. `syncSkills()` → symlink `~/.agents/skills/*/` into provider skills dir
8. Exception — Claude (`syncMethod: "cli"`): run `claude mcp remove` + `claude mcp add` instead of file write

## Adding a New Command

1. Create `src/commands/<name>.ts` with `export function register<Name>(program: Command)`
2. Register in `src/index.ts`
3. Write unit tests in `tests/unit/<name>.test.ts` (if lib logic involved)
4. Write e2e tests in `tests/e2e/<name>.bats`
5. Update feature status table above
6. Add to usage text in `src/vakt.sh`

## Adding a New Provider

1. Add entry to `src/providers.json` — `ProvidersSchema` validates it at startup, no code changes needed
2. Write e2e tests for provider sync behaviour
3. Update provider table in README.md

## Security Rules

- **NEVER** log or print secret values — mask with `***` in dry-run and error output
- **ALWAYS** parse config through its Zod schema — parse errors must produce user-readable messages
- **VALIDATE** secret references at sync time; warn if unresolved, do not hard fail
- **`PolicyEngine`** in `lib/policy.ts` is the single enforcement point — never inline policy checks in commands

## Release

Automated via `semantic-release` on merge to `main`:
- `feat:` → minor bump
- `fix:` → patch bump
- `chore:` / `docs:` / `refactor:` → no bump

Binary: `bun build src/index.ts --compile --outfile dist/vakt`

## CI and security gates (repo-specific)

Org-wide CI rules (Action pinning, `ci-passed`, Dependabot auto-merge, local pre-commit, push-then-stop) are in **Agent workflow** above.

Workflow files under `.github/workflows/` combine **org reusables** with repo-specific jobs:

| Workflow | Role |
|----------|------|
| `ci.yml` | `workflow-security` (org), Bun build/validate, SonarCloud, Docker e2e |
| `codeql.yml` | JavaScript/TypeScript CodeQL via org reusable (weekly schedule + PR/push) |
| `dependency-review.yml` | PR dependency review via org reusable |
| `test.yml` | Cross-platform bats e2e, lint, unit tests, secret/permission checks |
| `release.yml` | semantic-release on `main` |

Repo-specific logic stays in this repository (Bun, bats, Docker harness); do not re-add local actionlint, zizmor, or CodeQL init/analyze steps.

## SonarCloud

The SonarCloud project key is `tn819_agentctl` (legacy name — the repo was previously called `agentctl`).
Badge URLs and `sonar-project.properties` both use this key. Do not rename it; doing so breaks the badge links in README.md and resets quality history.

## Debugging

```bash
AGENTS_DEBUG=1 bun run src/index.ts sync   # verbose
bun run src/index.ts sync                  # full stack traces (source, not compiled)
```
