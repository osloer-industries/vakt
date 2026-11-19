import { lstatSync, readdirSync, statSync, type Stats } from "node:fs";
import { join } from "node:path";

/** Directories excluded from repo-owned CI scans (vendor/build artifacts). */
export const CI_SKIP_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
]);

export type WalkRepoFilesOptions = {
  readonly extensions?: readonly string[];
  readonly skipDirNames?: ReadonlySet<string>;
  readonly useLstat?: boolean;
};

function safeStat(path: string, useLstat: boolean): Stats | null {
  try {
    return useLstat ? lstatSync(path) : statSync(path);
  } catch {
    return null;
  }
}

function fileMatchesExtensions(
  entryName: string,
  extensions: readonly string[] | undefined,
): boolean {
  if (extensions === undefined) {
    return true;
  }
  return extensions.some((ext) => entryName.endsWith(ext));
}

type WalkContext = {
  skipDirNames: ReadonlySet<string>;
  useLstat: boolean;
  extensions: readonly string[] | undefined;
  results: string[];
  stack: string[];
};

function walkOneDirectory(ctx: WalkContext, dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = safeStat(full, ctx.useLstat);
    if (stat === null) {
      continue;
    }
    if (stat.isDirectory()) {
      if (!ctx.skipDirNames.has(entry)) {
        ctx.stack.push(full);
      }
      continue;
    }
    if (fileMatchesExtensions(entry, ctx.extensions)) {
      ctx.results.push(full);
    }
  }
}

/** Depth-first walk returning repo-owned files (optional extension filter). */
export function walkRepoFiles(root: string, options?: WalkRepoFilesOptions): string[] {
  const ctx: WalkContext = {
    skipDirNames: options?.skipDirNames ?? CI_SKIP_DIR_NAMES,
    useLstat: options?.useLstat ?? true,
    extensions: options?.extensions,
    results: [],
    stack: [root],
  };
  while (ctx.stack.length > 0) {
    const dir = ctx.stack.pop();
    if (dir !== undefined) {
      walkOneDirectory(ctx, dir);
    }
  }
  return ctx.results;
}