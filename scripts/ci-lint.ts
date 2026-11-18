#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

for (const file of walkShFiles(".")) {
  execSync(`bash -n "${file}"`, { stdio: "inherit" });
}

let todoMatches = "";
try {
  todoMatches = execSync('grep -r "TODO\\|FIXME" src/ --include="*.ts"', {
    encoding: "utf8",
  });
} catch (error) {
  const err = error as { status?: number };
  if (err.status !== 1) {
    throw error;
  }
}
if (todoMatches.trim().length > 0) {
  throw new Error("Found TODO/FIXME comments in src/");
}