// @ts-check
/**
 * TypeScript 7 removes `parseConfigFileTextToJson`, which @stryker-mutator/core calls when
 * rewriting tsconfig paths in its sandbox. Point `tsconfigFile` at a missing file so the
 * preprocessor skips that step (vakt tsconfig has no extends/references to rewrite).
 * https://github.com/stryker-mutator/stryker-js/issues/6110
 */
import "@stryker-mutator/bun-runner";

/** @type {import("@stryker-mutator/core").PartialStrykerOptions} */
export default {
  packageManager: "npm",
  appendPlugins: ["@stryker-mutator/bun-runner"],
  plugins: ["@stryker-mutator/bun-runner"],
  testRunner: "bun",
  reporters: ["clear-text", "progress"],
  tsconfigFile: ".stryker-tsconfig-intentionally-missing.json",
  mutate: ["src/**/*.ts", "!src/**/*.test.ts"],
  coverageAnalysis: "perTest",
  ignoreStatic: true,
  concurrency: 4,
  bun: {
    timeout: 120_000,
  },
  // PR runs mutate only changed src/ files; break is enforced on full src/ runs (main push).
  thresholds: { high: 90, low: 80, break: null },
};