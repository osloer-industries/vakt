// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  appendPlugins: ["@hughescr/stryker-bun-runner"],
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