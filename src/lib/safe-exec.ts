import { existsSync } from "node:fs";
import { join } from "node:path";
import { assertSafePath } from "./safe-input";
import { envRecord } from "./type-guards";

/** Fixed PATH for subprocess lookup — never trust process.env.PATH for spawning. */
export const SAFE_PATH = "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin";

const TRUSTED_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] as const;

/**
 * Resolve a bare executable name by scanning trusted bin directories (no shell / which).
 */
function lookupExecutableInTrustedDirs(cmd: string): string | null {
  if (!/^[\w.-]+$/.test(cmd)) return null;
  for (const dir of TRUSTED_BIN_DIRS) {
    const candidate = join(dir, cmd);
    if (existsSync(candidate)) {
      assertSafePath(candidate);
      return candidate;
    }
  }
  return null;
}

/**
 * Resolve an executable name to an absolute path using trusted directories only.
 * Returns null if not found or the name is unsafe.
 */
export function resolveExecutable(cmd: string): string | null {
  if (cmd.includes("/") || cmd.includes("\\")) {
    if (process.platform === "win32") {
      if (!/^[a-zA-Z]:\\/.test(cmd)) return null;
    } else {
      assertSafePath(cmd);
    }
    return cmd;
  }
  return lookupExecutableInTrustedDirs(cmd);
}

/** Environment for child processes that must not inherit a writable PATH. */
export function safeSpawnEnv(extra?: Record<string, string>): Record<string, string> {
  return {
    ...envRecord(),
    ...extra,
    PATH: SAFE_PATH,
  };
}

export function requireExecutable(cmd: string): string {
  const resolved = resolveExecutable(cmd);
  if (!resolved) {
    throw new Error(`${cmd} not found in PATH`);
  }
  return resolved;
}