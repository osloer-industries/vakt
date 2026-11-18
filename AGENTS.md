# Agent Development Guidelines for vakt

## Project Overview

`vakt` is an enterprise MCP server and skills manager that syncs approved servers and policies across AI coding
tools (Claude Code, Cursor, Windsurf, Gemini CLI, Codex, OpenCode). Central policy, secrets, audit logging, skills,
and supply-chain verification — zero extra infrastructure.

<!-- org-agent-workflow:start v0.1.4 -->

## Agent workflow (org-wide, keep identical across osloer-industries repos)

These rules apply to every agent (Cursor, Grok Bot, any other) working in this repo.

### Quality

- Never cut corners on quality or architecture. Fix root causes. No `continue-on-error`, `|| true`, skipped or
  deleted tests, lowered thresholds, ignore or suppress comments, `NOSONAR`, exclusions, new lint/Sonar rule
  exceptions or overrides, audit ignores, `--legacy-peer-deps`, or `--force`.
- SonarCloud issues are resolved only by fixing code, never by marking them false positive or won't-fix.
- Scripts are TypeScript, never Python; use the repo's runtime and package manager (`engines` / `packageManager`).
- `AGENTS.md` is the only agent instruction file; never add `CLAUDE.md` or tool-specific rule files.

### CI and workflows

- Pin GitHub Actions by full commit SHA with an accurate version comment. Org reusables from
  `osloer-industries/.github` are pinned `@<full sha> # v0.x.y` (a release tag, never `# main`).
- Every CI job feeds the single `ci-passed` aggregate job, including Workflow security, CodeQL and the SonarCloud
  zero-issues job. `ci-passed` is the only required status check.
- Only Dependabot patch/minor bumps and patch/minor release PRs auto-merge. Majors (or pre-1.0 breaking changes)
  never auto-merge; they wait for a human.
- Run the repo's linters, tests and pre-commit checks locally before pushing. The pre-commit hook is never skipped
  (`--no-verify` is not allowed).
- Never poll CI from the shell. If your environment delivers CI notifications for the PR head, wait for them and fix
  failures; otherwise push and stop.

### Pull requests

- Keep PRs focused and reviewable, link the issues they close, and prefer simplification (less code, fewer
  dependencies, removed duplication).
- Resolve conflicts by merging the base branch in. Never rebase a pushed branch, never force-push, never bypass
  branch protection.
- A PR is ready for review only when all of these hold: it has no conflicts and is up to date with `main`; every check
  on the current head is green (pending is not ready); and it has no unresolved review threads, requested changes or
  open SonarCloud issues. Fix anything short of that yourself. Ask a human only when a real decision or ambiguity
  needs one.
- Never touch secrets, permissions, repo settings or rulesets without explicit human approval.

<!-- org-agent-workflow:end -->

## Language: TypeScript + Bun

Bun is the runtime, test runner, and bundler. **Zod** validates all external JSON/TOML. See the
[agent reference](docs/agent/guidelines-reference.md) for toolchain, layout, and conventions.

```bash
bun run dev
bun test tests/unit/
bats tests/e2e/
bun run ci:build && bun run ci:lint && bun run ci:test && bun run ci:security
```

## Architecture (summary)

- `src/index.ts` — CLI; `src/commands/` — one file per command; `src/lib/` — shared logic; `src/daemon/` — IPC
- `src/providers.json` — six-provider registry; `src/lib/schemas.ts` — **all types and Zod schemas**
- `tests/e2e/` — bats; `skills/*/SKILL.md` — bundled skills

## Agent reference (detailed)

| Topic | Document |
| --- | --- |
| Schemas, code style, testing | [guidelines-reference](docs/agent/guidelines-reference.md) |
| Feature catalog & new commands | [feature-catalog](docs/agent/guidelines-reference.md#feature-catalog) |
| Secrets, sync, providers | [guidelines-reference](docs/agent/guidelines-reference.md) |
| CI, SonarCloud, release, debug | [ci-repo-specific](docs/agent/guidelines-reference.md#ci-repo-specific) |

## Non-negotiables

- Import every type from `src/lib/schemas.ts` — no inline schema types in commands or libs.
- Every command ships with unit tests (`bun test`) and e2e tests (`bats`); e2e setup uses `setup_test_env` and
  `mock_secrets_backend`.
- Enforce policy only via `PolicyEngine` in `src/lib/policy.ts` — never inline checks in commands.
- Never print or log secrets; mask as `***` in user-visible output.
- When you add or change a command, update the feature catalog in `docs/agent/guidelines-reference.md` and
  `src/vakt.sh`.

## SonarCloud

Project key `tn819_agentctl` (legacy name). Do not rename — see
[guidelines-reference](docs/agent/guidelines-reference.md#sonarcloud).