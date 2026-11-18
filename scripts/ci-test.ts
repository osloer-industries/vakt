#!/usr/bin/env node
import { execSync } from "node:child_process";

execSync("bun test src/", {
  stdio: "inherit",
  env: { ...process.env, AGENTS_SECRETS_BACKEND: "env" },
});