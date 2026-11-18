// @ts-check
import "@stryker-mutator/bun-runner";

/** @type {import("@stryker-mutator/core").PartialStrykerOptions} */
export default {
  packageManager: "npm",
  appendPlugins: ["@stryker-mutator/bun-runner"],
  plugins: ["@stryker-mutator/bun-runner"],
  testRunner: "bun",
  reporters: ["clear-text", "progress"],
  tsconfigFile: "tsconfig.json",
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