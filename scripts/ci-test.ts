#!/usr/bin/env node
import { ciExecFile, resolveCiBinary } from "./ci-env.ts";

const BunBin = resolveCiBinary("bun");

ciExecFile(BunBin, ["test", "src/"], {
  env: { AGENTS_SECRETS_BACKEND: "env" },
});