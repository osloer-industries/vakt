#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { ciExecFile, resolveCiBinary } from "./ci-env.ts";
import { walkRepoFiles } from "./ci-fs.ts";

const BashBin = resolveCiBinary("bash");
const emptySkip = new Set<string>();

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