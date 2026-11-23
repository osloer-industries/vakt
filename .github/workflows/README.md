# GitHub Actions Workflows

This directory contains GitHub Actions workflows for vakt.

Org-wide gates (actionlint, zizmor, CodeQL init/analyze, dependency review) call reusable workflows from [`osloer-industries/.github`](https://github.com/osloer-industries/.github) at an immutable commit SHA with a `# v0.x.y` version comment. Bump those refs via Dependabot `ci(deps)` pull requests (group `osloer-reusables`). See `docs/consuming-workflows.md` in that repository.

**Pinned org reusables:** `a6ee91211fd9ba096ec141bacdb67985a82b6767` (`# v0.1.7`).

## Workflows

### CI (`ci.yml`)

**Triggers:** Push to `main`, pull requests, weekly CodeQL schedule (Monday 03:17 UTC)

**Org reusables (v0.1.7):**

- `workflow-security` — actionlint + zizmor
- `node-npm-quality` — Bun `ci:build`, `ci:lint`, `ci:test`, `ci:security`
- `mutation-changed` — Stryker on changed files (PR) / full run (push)
- `agents-md-lint` — `AGENTS.md` org workflow block parity
- `codeql-javascript-typescript` — CodeQL for TypeScript (local config: `.github/codeql/codeql-config.yml`)
- `sonarqube-cloud-node` — `sonar-analyze`
- `sonarcloud-zero-issues` — zero open issues gate (pull requests only; skipped on push via `ci-passed`)
- `ci-passed` — aggregate required check

**Repo-specific jobs:** `docker-e2e`, cross-platform e2e (`test-macos`, `test-linux`).

### Dependency review (`dependency-review.yml`)

**Triggers:** Pull requests only

**Jobs:** org reusable `dependency-review.yml` (public repo: GitHub Dependency Review; job permissions include `security-events: write` for nested OSV wiring).

### Pull request title (`pr-title.yml`)

**Triggers:** Pull request open/edit/sync (`pull_request`, not `pull_request_target`)

**Jobs:** org reusable `semantic-pull-request.yml` (Conventional Commits titles).

### Auto-merge (`auto-merge.yml`)

**Triggers:** Pull request open/sync/reopen/ready for review

**Jobs:** org reusable `auto-merge.yml` — Dependabot patch/minor only (majors blocked in org eligibility script). `allow-release-prs: false` because vakt uses semantic-release on `main`, not Release Please PRs.

### Release (`release.yml`)

**Triggers:** Push to `main`, manual `workflow_dispatch`

Custom **semantic-release** pipeline (multi-platform binaries, Homebrew formula PR). Not the org `release-please` reusable — vakt release semantics are documented in `AGENTS.md`.

## Usage

### Running Tests Locally

```bash
# Install bats
brew install bats-core  # macOS
sudo apt install bats   # Linux

# Run all tests
bats tests/
```

### Required Secrets

- `SONAR_TOKEN` — SonarCloud analysis and zero-issues gate
- `RELEASE_APP_PRIVATE_KEY` — org auto-merge (osloer-reviewer app); with repo variable `OSLOER_RELEASE_APP_ID`
- Release workflow additionally uses `RELEASE_PAT` where documented in `release.yml`

## Monitoring

View workflow runs in the repository **Actions** tab. The required merge gate is **`ci-passed`** (org ruleset); individual job names remain visible for triage.

## Check name changes (v0.1.7 centralization)

- Removed standalone `codeql.yml` (CodeQL runs only in `ci.yml`).
- Dropped stub aggregate jobs for build/lint/test/security/Sonar; org reusables now surface check names directly (`build`, `lint`, …).
- Sonar scan job id renamed `sonar-scan` → `sonar-analyze` (fleet convention). The former aggregated check **`sonarcloud`** is gone; rulesets should rely on **`ci-passed`** only.