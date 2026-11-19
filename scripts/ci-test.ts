#!/usr/bin/env node
import { dirname } from "node:path";
import { ciExecFile, resolveCiBinary } from "./ci-env.ts";

const BunBin = resolveCiBinary("bun");

ciExecFile(BunBin, ["test", "src/"], {
  pathPrefix: dirname(BunBin),
  env: { AGENTS_SECRETS_BACKEND: "env" },
});