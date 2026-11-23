import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Matches eslint/oxlint disable directives and TypeScript comment suppressions. */
export const SUPPRESSION_PATTERN =
  /(?:eslint-disable(?:-line|-next-line)?|oxlint-disable(?:-line|-next-line)?|@ts-(?:ignore|expect-error|nocheck))/g;

const SCAN_ROOTS = ["src", "scripts"] as const;
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "coverage"]);
const SKIP_RELATIVE_FILES = new Set([
  "scripts/count-suppressions.ts",
  ".oxlintrc.json",
]);

export interface SuppressionBaseline {
  readonly version: 1;
  readonly total: number;
}

export function countSuppressionsInText(text: string): number {
  const matches = text.match(SUPPRESSION_PATTERN);
  return matches?.length ?? 0;
}

function listFiles(rootDir: string, directory: string, files: string[]): void {
  const absoluteDir = join(rootDir, directory);
  for (const entry of readdirSync(absoluteDir)) {
    const relativePath = join(directory, entry);
    const absolutePath = join(rootDir, relativePath);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry)) continue;
      listFiles(rootDir, relativePath, files);
      continue;
    }
    if (!/\.(ts|mjs|json|jsonc)$/u.test(entry)) continue;
    if (/\.(test|spec)\.(ts|mjs)$/u.test(entry)) continue;
    if (SKIP_RELATIVE_FILES.has(relativePath.replaceAll("\\", "/"))) continue;
    files.push(relativePath);
  }
}

export function countSuppressions(rootDir: string): number {
  let total = 0;
  for (const scanRoot of SCAN_ROOTS) {
    const scanPath = join(rootDir, scanRoot);
    try {
      statSync(scanPath);
    } catch {
      continue;
    }
    const files: string[] = [];
    listFiles(rootDir, scanRoot, files);
    for (const file of files) {
      const text = readFileSync(join(rootDir, file), "utf8");
      total += countSuppressionsInText(text);
    }
  }
  return total;
}

export function loadBaseline(baselinePath: string): SuppressionBaseline {
  const parsed: unknown = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid suppression baseline JSON");
  }
  const version = Reflect.get(parsed, "version");
  const total = Reflect.get(parsed, "total");
  if (version !== 1 || typeof total !== "number" || !Number.isInteger(total) || total < 0) {
    throw new Error("Invalid suppression baseline shape");
  }
  return { version: 1, total };
}

export function assertShrinkOnly(actual: number, baseline: SuppressionBaseline): void {
  if (actual > baseline.total) {
    throw new Error(
      `Suppression count ${actual} exceeds baseline ${baseline.total}. ` +
        "Remove new disable/ts-comment suppressions or lower the baseline intentionally in a dedicated PR.",
    );
  }
}

export function writeBaseline(baselinePath: string, total: number): void {
  const payload: SuppressionBaseline = { version: 1, total };
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function repoRootFromModuleUrl(moduleUrl: string): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "..");
}

export function runCountSuppressionsCli(moduleUrl: string, argv: readonly string[]): void {
  const rootDir = repoRootFromModuleUrl(moduleUrl);
  const baselinePath = join(rootDir, "scripts/suppression-baseline.json");
  const writeMode = argv.includes("--write-baseline");
  const total = countSuppressions(rootDir);

  if (writeMode) {
    writeBaseline(baselinePath, total);
    process.stdout.write(`Wrote suppression baseline: ${total}\n`);
    return;
  }

  const baseline = loadBaseline(baselinePath);
  assertShrinkOnly(total, baseline);
  process.stdout.write(`Suppression count ${total} (baseline ${baseline.total}, shrink-only OK)\n`);
}

function isDirectExecution(moduleUrl: string, argvEntry: string | undefined): boolean {
  if (argvEntry === undefined) return false;
  return moduleUrl === pathToFileURL(resolve(argvEntry)).href;
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  runCountSuppressionsCli(import.meta.url, process.argv.slice(2));
}