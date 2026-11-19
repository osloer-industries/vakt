# vakt agent reference

Detailed agent guidance moved out of [`AGENTS.md`](../../AGENTS.md) to satisfy the org AGENTS.md line budget. Keep this file updated when you change conventions, feature status, or CI notes.

## Language and toolchain

**vakt is TypeScript compiled and run with Bun** (not Node as the application runtime). No shell scripts in `src/` except `src/vakt.sh` (CLI shim) and `src/lib/secrets.sh` (legacy bash backend).

- All source in `src/` is `.ts`
- **Zod** parses all external JSON/TOML before use
- `commander` — CLI; `smol-toml` — Codex provider; `@modelcontextprotocol/sdk` — MCP proxy
- OpenTelemetry via `@opentelemetry/sdk-node` + `@opentelemetry/api`
- `@e2b/code-interpreter` — cloud runtime

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
bun run ci:build && bun run ci:lint && bun run ci:test && bun run ci:security
```

## Architecture

- `src/index.ts` — CLI entry (commander)
- `src/providers.json` — provider registry (`ProvidersSchema`)
- `src/vakt.sh` — `exec bun run src/index.ts "$@"`
- `src/commands/` — one file per command
- `src/daemon/` — background process manager and IPC
- `src/lib/` — shared libraries (pure functions)
- `tests/e2e/` — bats CLI tests
- `skills/` — bundled skills (`SKILL.md` + scripts)
- `install.sh` — installer

## Schemas: single source of truth

**`src/lib/schemas.ts` owns every type.** Import types from schemas; never define them inline in commands or libs.

Key schemas:

```typescript
AgentConfigSchema   // ~/.agents/config.json
McpConfigSchema     // ~/.agents/mcp-config.json
ProvidersSchema     // src/providers.json
PolicySchema        // ~/.agents/policy.json
StdioServerSchema | HttpServerSchema → McpServerSchema
```

**All external JSON/TOML:** `Schema.parse()` for system files; `Schema.safeParse()` + user-readable errors for user-owned config.

```typescript
const cfg = AgentConfigSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
const result = PolicySchema.safeParse(raw);
if (!result.success) {
  console.error(`Invalid policy.json: ${result.error.issues[0]?.message}`);
  process.exit(1);
}
```

## Code style

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`
- No `any`; use `unknown` + Zod
- Named exports; no default exports except `src/index.ts`
- Bun APIs (`Bun.file`, `Bun.spawn`, `Bun.write`) for async I/O
- User-facing CLI errors; no raw stack traces at CLI level
- `try/catch` only at command action boundaries

### Naming

| Thing | Convention | Example |
|-------|------------|---------|
| Files | kebab-case | `add-server.ts` |
| Functions / vars | camelCase | `resolveSecretRefs` |
| Classes / types | PascalCase | `PolicyEngine` |
| Zod schemas | PascalCase + `Schema` | `AgentConfigSchema` |

### Command registration

```typescript
export function registerMyCommand(program: Command): void {
  program
    .command("my-command <required-arg>")
    .description("One-line description")
    .option("--dry-run", "preview without applying")
    .action(async (arg, opts) => { /* validate → lib → output */ });
}
```

Register in `src/index.ts`. Use shared output helpers (`ok`, `warn`, `info`, `err`, color helpers) consistently.

## Testing

Every command needs **unit** (`bun test`) and **e2e** (`bats`) coverage: success, errors, edge cases, init → configure → run.

E2E setup must call `setup_test_env` first and `mock_secrets_backend` (`AGENTS_SECRETS_BACKEND=env`).

```bash
bun test tests/unit/
bats tests/e2e/
```

## Feature catalog

Update this table when adding or shipping commands.

### Implemented

| Feature | Command | Key files |
|---------|---------|-----------|
| Initialization | `vakt init` | `commands/init.ts` |
| Sync to providers | `vakt sync [--dry-run] [--mcp-only] [--skills-only]` | `commands/sync.ts`, `lib/resolver.ts` |
| Add MCP server | `vakt add-server <name> <cmd> [args]` | `commands/add-server.ts`, `lib/registry.ts` |
| Add skill | `vakt add-skill <path>` | `commands/add-skill.ts` |
| Config | `vakt config [get\|set\|list]` | `commands/config.ts` |
| Secrets | `vakt secrets [set\|get\|delete\|list]` | `commands/secrets.ts`, `lib/secrets.ts` |
| List | `vakt list` | `commands/list.ts` |
| Import | `vakt import-from-everywhere` | `commands/import.ts` |
| Upgrade | `vakt upgrade` | `commands/upgrade.ts` |
| Registry search | `vakt search <query>` | `commands/search.ts`, `lib/registry.ts` |
| Audit log | `vakt audit [show\|export]` | `commands/audit.ts`, `lib/audit.ts` |
| OTel | automatic | `lib/otel.ts` |
| MCP proxy | `vakt proxy <name>` | `commands/proxy.ts`, `lib/policy.ts` |
| Daemon | `vakt daemon [start\|stop\|status]` | `commands/daemon.ts`, `daemon/` |
| Cloud runtime | `vakt runtime [list\|set]` | `commands/runtime.ts`, `lib/runtime.ts` |
| Binary | `dist/vakt` | `bun build --compile` |
| Remote pull | `vakt pull [--dry-run] [--policy-only]` | `commands/pull.ts`, `lib/remote.ts` |
| Policy merge | on `vakt pull` | `lib/policy.ts` |
| Lockdown | `vakt lockdown [--dry-run] [--generate-mdm]` | `commands/lockdown.ts` |
| Drift watch | `vakt watch [--revert] [--alert-only]` | `commands/watch.ts` |
| Enterprise secrets | `secret:vault:` / `secret:op:` / `secret:azure:` | `lib/secrets.ts` |
| Skills registry | `vakt registry skills [list\|search\|install]` | `commands/registry.ts` |
| Supply chain | verify OCI/npm | `lib/verify.ts` |
| Model router | `vakt route [--port] [--test]` | `commands/route.ts`, `lib/router.ts` |

### TODO

| Feature | Notes | Issue |
|---------|-------|-------|
| `autoSync` in `sync.ts` | `config.remote?.autoSync` → pull before sync | #110 |
| GitHub Pages | `docs/` site | #111 |
| Category routing | Intent above rule router | #104 (depends #101) |

## Secret references

Resolved at sync via `resolveSecretRefs()` in `src/lib/secrets.ts`:

| Reference | Backend |
|-----------|---------|
| `secret:KEY` | Local keychain / pass / env |
| `secret:vault:path` | HashiCorp Vault CLI |
| `secret:op:vault/item/field` | 1Password CLI |
| `secret:azure:vault/secret` | Azure CLI |

## Path templating

`expandPaths()` in `src/lib/config.ts` expands `{{paths.code}}`, `{{paths.documents}}`, `{{paths.vault}}` in `mcp-config.json`.

## Sync process

1. `loadAgentConfig()` → `loadMcpConfig()` → `loadProviders()`
2. Per enabled provider: `resolveAll()` (secrets + paths)
3. `formatForProvider()` → `writeJsonConfig()` or `toToml()`
4. `syncInstructionsToProviders()` — sync `AGENTS.md` to provider instruction paths (not `CLAUDE.md` / `GEMINI.md`)
5. `syncSkills()` — symlink skills into provider dirs
6. Claude (`syncMethod: "cli"`): `claude mcp remove` + `claude mcp add`

## Adding a command

1. `src/commands/<name>.ts` + register in `src/index.ts`
2. Unit tests in `tests/unit/`; e2e in `tests/e2e/<name>.bats`
3. Update feature catalog above and `src/vakt.sh` usage text

## Adding a provider

1. Entry in `src/providers.json` (validated by `ProvidersSchema`)
2. E2E sync tests; README provider table

## Security

- Never log secret values — mask as `***` in dry-run/errors
- Parse all config through Zod; user-readable parse errors
- Warn on unresolved secret refs at sync; do not hard-fail
- **`PolicyEngine`** in `lib/policy.ts` is the only policy enforcement point

## Release

`semantic-release` on merge to `main` (`feat:` minor, `fix:` patch, chore/docs/refactor no bump). Binary: `bun build src/index.ts --compile --outfile dist/vakt`.

## CI (repo-specific)

Org-wide rules live in the **Agent workflow** block in `AGENTS.md`. Workflows under `.github/workflows/`:

| Workflow | Role |
|----------|------|
| `ci.yml` | Org reusables + Bun quality jobs + docker/cross-platform e2e + Sonar aggregate `sonarcloud` |
| `dependency-review.yml` | Org reusable |
| `pr-title.yml` | Semantic PR titles |
| `release.yml` | semantic-release + Homebrew formula |

Pin `osloer-industries/.github` reusables by full SHA with `# v0.x.y`. Dependabot groups `osloer-reusables`. No local actionlint/zizmor/CodeQL init forks.

## SonarCloud

Project key **`tn819_agentctl`** (legacy `agentctl` name). Do not rename — badge links and history depend on it.

## Debugging

```bash
AGENTS_DEBUG=1 bun run src/index.ts sync   # verbose
bun run src/index.ts sync                  # stack traces from source
```