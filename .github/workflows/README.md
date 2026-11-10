# GitHub Actions Workflows

This directory contains GitHub Actions workflows for vakt.

Org-wide gates (actionlint, zizmor, CodeQL init/analyze, dependency review) call reusable workflows from [`osloer-industries/.github`](https://github.com/osloer-industries/.github) at an immutable commit SHA. Bump those refs via Dependabot `ci(deps)` pull requests. See `docs/consuming-workflows.md` in that repository.

**Pinned reusables SHA:** `d4865a4b2c70c8433188f5200beac104b1c7fe86` (`main` at merge of org workflow-security, CodeQL SARIF gate, and cross-repo validator fixes).

## Workflows

### 1. CI (`ci.yml`)

**Triggers:** Push to main, pull requests

**Jobs:**

- `workflow-security` — org reusable: actionlint + zizmor on `.github/` (strict default thresholds)
- `build` — TypeScript check, JSON/YAML/shell validation, skill layout, CLI/installer smoke
- `sonarcloud` — Bun unit coverage + SonarCloud upload
- `docker-e2e` — Docker Compose security harness (`tests/docker/`)

**Purpose:** Continuous integration and repo-specific quality gates on every PR and push.

### 1b. CodeQL (`codeql.yml`)

**Triggers:** Pull requests, push to `main`, weekly schedule (Monday 03:17 UTC)

**Jobs:**

- `analyze` — org reusable `codeql-javascript-typescript.yml` (public repo: default Code Scanning upload)

Local config: `.github/codeql/codeql-config.yml` limits analysis to `javascript-typescript` (workflow Actions are SHA-pinned and not analysed as Actions language).

### 1c. Dependency review (`dependency-review.yml`)

**Triggers:** Pull requests only

**Jobs:**

- `review` — org reusable `dependency-review.yml` (fails on `high` severity by default)

### 2. Tests (`test.yml`)

**Triggers:** Push to main/develop, Pull Requests to main/develop

**Jobs:**

- `test-macos` - Runs e2e on macOS **except** `tests/e2e/agent-docker.bats` (GitHub macOS runners have no Docker). Run `agent-docker.bats` locally with Docker Desktop or rely on `test-linux` / `ci.yml` `docker-e2e`.
- `test-linux` - Full e2e suite on Linux, including Docker sandbox tests and a kind cluster for Kata kubectl checks
- `lint` - Checks shell scripts, Python syntax, TODO comments
- `security-check` - Checks for hardcoded secrets, file permissions

**Purpose:** Comprehensive cross-platform testing.

### 3. Release (`release.yml`)

**Triggers:** Push tags matching `v*` (e.g., v1.0.0)

**Jobs:**

- `test` - Runs tests before release
- `release` - Creates GitHub release with:
  - Auto-generated changelog
  - Tarball download
  - Release notes
- `update-docs` - Updates version references in docs

**Purpose:** Automated releases with semantic versioning.

## Usage

### Running Tests Locally

```bash
# Install bats
brew install bats-core  # macOS
sudo apt install bats   # Linux

# Run all tests
bats tests/
```

### Creating a Release

```bash
# Update version in src/vakt.sh
vim src/vakt.sh  # Update version() function

# Commit changes
git add src/vakt.sh
git commit -m "chore: bump version to v0.1.0"

# Create and push tag
git tag v0.1.0
git push origin main
git push origin v0.1.0

# GitHub Actions will:
# 1. Run tests
# 2. Create release
# 3. Generate changelog
# 4. Upload tarball
```

### Required Secrets

No secrets required for basic workflows. All workflows use `GITHUB_TOKEN` which is automatically provided.

### Workflow Permissions

The release workflow requires:

```yaml
permissions:
  contents: write
```

This is set in the workflow file.

## Customization

### Adding Platform Tests

To add Windows support:

```yaml
test-windows:
  runs-on: windows-latest
  steps:
    - uses: actions/checkout@v4
    - name: Install bats
      run: choco install bats
    - name: Run tests
      run: bats tests/
```

### Adding Integration Tests

Create `tests/integration/` and add:

```yaml
integration:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Install dependencies
      run: |
        sudo apt-get install -y bats
    - name: Run integration tests
      run: bats tests/integration/
```

## Monitoring

View workflow runs:

- Go to Actions tab in GitHub
- Filter by workflow name
- Check individual job logs

## Troubleshooting

### Tests failing on CI but passing locally

- Check if all dependencies are installed
- Verify PATH setup in test commands
- Check for environment-specific issues

### Release workflow failing

- Ensure tag follows semantic versioning (v0.0.1, v0.1.0, v1.0.0)
- Check GITHUB_TOKEN permissions
- Verify changelog generation

### Security check false positives

- Review flagged patterns
- Update grep patterns in the `security` job in `test.yml`
