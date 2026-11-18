export default {
  packageManager: "npm",
  testRunner: "command",
  commandRunner: {
    command: "bun test",
  },
  reporters: ["clear-text", "progress"],
  tsconfigFile: "tsconfig.json",
  mutate: ["src/**/*.ts", "!src/**/*.test.ts"],
  thresholds: { high: 90, low: 80, break: 80 },
};