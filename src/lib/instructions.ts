import { existsSync, lstatSync, mkdirSync, realpathSync, symlinkSync, unlinkSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Provider } from "./schemas";
import { expandHome } from "./config";
import { currentPlatformKey } from "./type-guards";

export type InstructionsSyncAction = "linked" | "refreshed" | "skipped" | "blocked";

export function resolveProviderInstructionsPath(provider: Provider): string | null {
  const block = provider.instructions;
  if (!block) return null;
  const platform = currentPlatformKey();
  const raw = block.path[platform] ?? "";
  if (!raw) return null;
  return expandHome(raw);
}

function pathsEqual(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

function targetPointsAtSource(target: string, source: string): boolean {
  try {
    if (!lstatSync(target).isSymbolicLink()) return false;
    return pathsEqual(target, source);
  } catch {
    return false;
  }
}

/**
 * Ensure provider AGENTS.md is a symlink to ~/.agents/AGENTS.md (AGENTS.md standard).
 * Existing plain files are left untouched so policy-hook marker edits are not destroyed;
 * use dry-run output to nudge users to consolidate into ~/.agents/AGENTS.md first.
 */
export function ensureProviderAgentsMd(
  source: string,
  target: string,
  method: "symlink" | "copy",
  dryRun: boolean,
): InstructionsSyncAction {
  if (!existsSync(source)) return "skipped";

  if (dryRun) return existsSync(target) ? "skipped" : "linked";

  mkdirSync(dirname(target), { recursive: true });

  if (method === "copy") {
    const existed = existsSync(target);
    copyFileSync(source, target);
    return existed ? "refreshed" : "linked";
  }

  if (existsSync(target)) {
    if (targetPointsAtSource(target, source)) return "skipped";
    if (lstatSync(target).isSymbolicLink()) {
      unlinkSync(target);
      symlinkSync(source, target);
      return "refreshed";
    }
    // Regular file (often policy-hook output) — consolidate into ~/.agents/AGENTS.md first.
    return "blocked";
  }

  symlinkSync(source, target);
  return "linked";
}