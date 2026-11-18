#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const hardcodedCredential =
  /(password|token|api_key|secret)\s*=\s*['"][^'"]{10,}['"]/;
const githubToken = /(ghp|gho|github_pat)_[a-zA-Z0-9]{36}/;

function walkTypeScriptFiles(root: string): string[] {
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

for (const file of walkTypeScriptFiles("src")) {
  const content = readFileSync(file, "utf8");
  if (hardcodedCredential.test(content)) {
    throw new Error(`Found hardcoded credentials in ${file}`);
  }
  if (githubToken.test(content)) {
    throw new Error(`Found hardcoded GitHub tokens in ${file}`);
  }
}

const worldWritable: string[] = [];
const stack = ["."];
while (stack.length > 0) {
  const dir = stack.pop();
  if (dir === undefined) {
    continue;
  }
  for (const entry of readdirSync(dir)) {
    if (entry === ".git") {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      stack.push(full);
    } else if ((stat.mode & 0o002) !== 0) {
      worldWritable.push(full);
    }
  }
}

if (worldWritable.length > 0) {
  process.stderr.write("Found world-writable files:\n");
  for (const file of worldWritable) {
    process.stderr.write(`${file}\n`);
  }
  process.exit(1);
}

process.stdout.write("✓ No world-writable files found\n");