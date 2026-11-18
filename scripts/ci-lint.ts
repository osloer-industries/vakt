#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ciExecFile, resolveCiBinary } from "./ci-env.ts";

const BashBin = resolveCiBinary("bash");

function walkShFiles(root: string): string[] {
  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) {
      continue;
    }
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".git") {
          continue;
        }
        stack.push(full);
      } else if (entry.endsWith(".sh")) {
        results.push(full);
      }
    }
  }
  return results;
}

function walkTsFiles(root: string): string[] {
  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) {
      continue;
    }
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
      } else if (entry.endsWith(".ts")) {
        results.push(full);
      }
    }
  }
  return results;
}

for (const file of walkShFiles(".")) {
  ciExecFile(BashBin, ["-n", file]);
}

const todoPattern = /\b(TODO|FIXME)\b/;
for (const file of walkTsFiles("src")) {
  const content = readFileSync(file, "utf8");
  if (todoPattern.test(content)) {
    throw new Error(`Found TODO/FIXME comments in ${file}`);
  }
}