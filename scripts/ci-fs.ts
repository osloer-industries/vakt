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

/** Depth-first walk returning repo-owned files (optional extension filter). */
export function walkRepoFiles(
  root: string,
  options: WalkRepoFilesOptions = {},
): string[] {
  const skipDirNames = options.skipDirNames ?? CI_SKIP_DIR_NAMES;
  const useLstat = options.useLstat ?? true;
  const { extensions } = options;
  const results: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) {
      continue;
    }
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      const stat = safeStat(full, useLstat);
      if (stat === null) {
        continue;
      }
      if (stat.isDirectory()) {
        if (skipDirNames.has(entry)) {
          continue;
        }
        stack.push(full);
      } else if (
        extensions === undefined ||
        extensions.some((ext) => entry.endsWith(ext))
      ) {
        results.push(full);
      }
    }
  }
  return results;
}