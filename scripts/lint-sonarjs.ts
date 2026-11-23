#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ciExecFile } from "./ci-env.ts";

function isDirectExecution(moduleUrl: string, argvEntry: string | undefined): boolean {
  if (argvEntry === undefined) {
    return false;
  }
  return resolve(fileURLToPath(moduleUrl)) === resolve(argvEntry);
}

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "../packages/eslint-sonarjs");
const installMarker = join(pkgDir, "node_modules", "eslint", "package.json");

export function ensureEslintSonarjsDependencies(): void {
  if (!existsSync(installMarker)) {
    ciExecFile("npm", ["ci", "--ignore-scripts"], { cwd: pkgDir });
  }
}

export function runLintSonarjsCli(args: readonly string[]): void {
  ensureEslintSonarjsDependencies();
  ciExecFile(process.execPath, [join(pkgDir, "run.mjs"), ...args]);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  runLintSonarjsCli(process.argv.slice(2));
}