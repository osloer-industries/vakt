#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { walkRepoFiles } from "./ci-fs.ts";

const hardcodedCredential =
  /(password|token|api_key|secret)\s*=\s*['"][^'"]{10,}['"]/;
const githubToken = /(ghp|gho|github_pat)_[a-zA-Z0-9]{36}/;

const emptySkip = new Set<string>();

for (const file of walkRepoFiles("src", {
  extensions: [".ts"],
  skipDirNames: emptySkip,
})) {
  const content = readFileSync(file, "utf8");
  if (hardcodedCredential.test(content)) {
    throw new Error(`Found hardcoded credentials in ${file}`);
  }
  if (githubToken.test(content)) {
    throw new Error(`Found hardcoded GitHub tokens in ${file}`);
  }
}

const worldWritable: string[] = [];
for (const file of walkRepoFiles(".")) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    continue;
  }
  if ((stat.mode & 0o002) !== 0) {
    worldWritable.push(file);
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