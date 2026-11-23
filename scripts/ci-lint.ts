#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { ciExecFile, resolveCiBinary } from "./ci-env.ts";
import { walkRepoFiles } from "./ci-fs.ts";
import { runCountSuppressionsCli } from "./count-suppressions.ts";
import { runLintSonarjsCli } from "./lint-sonarjs.ts";

const BashBin = resolveCiBinary("bash");
const BunBin = resolveCiBinary("bun");
const NodeBin = process.execPath;
const emptySkip = new Set<string>();

const toolPathPrefix = `${dirname(NodeBin)}:${dirname(BunBin)}`;

for (const file of walkRepoFiles(".", { extensions: [".sh"] })) {
  ciExecFile(BashBin, ["-n", file]);
}

const todoPattern = /\b(TODO|FIXME)\b/;
for (const file of walkRepoFiles("src", {
  extensions: [".ts"],
  skipDirNames: emptySkip,
})) {
  const content = readFileSync(file, "utf8");
  if (todoPattern.test(content)) {
    throw new Error(`Found TODO/FIXME comments in ${file}`);
  }
}

ciExecFile(BunBin, ["x", "oxlint", "-c", ".oxlintrc.json", "src", "scripts", "tests"], {
  pathPrefix: toolPathPrefix,
});

runLintSonarjsCli([]);

runCountSuppressionsCli(import.meta.url, []);

ciExecFile(BunBin, ["test", "scripts/gate-self.test.ts"], {
  pathPrefix: toolPathPrefix,
});