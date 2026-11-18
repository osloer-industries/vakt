# GitHub Actions Workflows

This directory contains GitHub Actions workflows for vakt.

Org-wide gates (actionlint, zizmor, CodeQL init/analyze, dependency review) call reusable workflows from [`osloer-industries/.github`](https://github.com/osloer-industries/.github) at an immutable commit SHA with a `# v0.x.y` version comment. Bump those refs via Dependabot `ci(deps)` pull requests (group `osloer-reusables`). See `docs/consuming-workflows.md` in that repository.

**Pinned org reusables:** `348b254ef112f4f8e239a41e7adb3f3e2dac3944` (`# v0.1.6`).

## Workflows

### CI (`ci.yml`)

**Triggers:** Push to `main`, pull requests, weekly CodeQL schedule (Monday 03:17 UTC)

**Org reusables (v0.1.6):**

- `workflow-security` — actionlint + zizmor
- `codeql-javascript-typescript` — CodeQL for TypeScript (local config: `.github/codeql/codeql-config.yml`)
- `sonarqube-cloud-node` — `sonar-scan`; job **`sonarcloud`** polls CE task success (classic branch-protection context)
- `sonarcloud-zero-issues` — zero open issues gate (pull requests only; skipped on push via `ci-passed`)
- `ci-passed` — aggregate required check

**Repo-specific jobs:** `build`, `docker-e2e`, cross-platform e2e (`test-macos`, `test-linux`), `lint`, unit `test`, `security`.

### Dependency review (`dependency-review.yml`)

**Triggers:** Pull requests only

**Jobs:** org reusable `dependency-review.yml` (public repo: GitHub Dependency Review; job permissions include `security-events: write` for nested OSV wiring).

### Pull request title (`pr-title.yml`)

**Triggers:** Pull request open/edit/sync

**Jobs:** org reusable `semantic-pull-request.yml` (Conventional Commits titles).

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
- Release workflow additionally uses `RELEASE_PAT` where documented in `release.yml`

## Monitoring

View workflow runs in the repository **Actions** tab. The required merge gate is **`ci-passed`** (org ruleset); individual job names remain visible for triage.