export default {
  packageManager: "npm",
  testRunner: "command",
  commandRunner: {
    command: "bun test",
  },
  reporters: ["clear-text", "progress"],
  tsconfigFile: "tsconfig.json",
  mutate: ["src/**/*.ts", "!src/**/*.test.ts"],
  // PR runs mutate only changed src/ files; break is enforced on full src/ runs (main push).
  thresholds: { high: 90, low: 80, break: null },
};