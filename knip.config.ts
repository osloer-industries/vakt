import type { KnipConfig } from "knip";

const config: KnipConfig = {
  // entry inferred from package.json bin field (src/index.ts)
  // scripts/*.ts are standalone bun run scripts
  // test files are entry points for bun test
  entry: ["scripts/*.ts", "src/**/*.test.ts", "src/lib/test-assert.ts"],
  project: ["src/**/*.ts", "scripts/**/*.ts"],
  ignoreBinaries: [
    "bats",   // system test runner, not a package
    "npm",    // installs packages/eslint-sonarjs before SonarJS shift-left lint
    "knip",   // called in scripts, provided by devDependency knip
    "oxlint", // called in scripts, provided by devDependency oxlint
  ],
  // GitHub Actions plugin fails to parse multiline YAML strings in release.yml
  "github-actions": false,

  // Exports used only within the same file (internal helpers that happen to be exported)
  ignoreExportsUsedInFile: true,
  ignoreDependencies: [
    // referenced in .releaserc / release config, not imported
    "@semantic-release/exec",
    "@semantic-release/github",
    "conventional-changelog-conventionalcommits",
    "oxlint",
    "oxlint-tsgolint",
  ],
};

export default config;
