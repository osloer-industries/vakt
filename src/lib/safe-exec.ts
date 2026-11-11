import { spawnSync } from "node:child_process";
import { assertSafePath } from "./safe-input";

/** Fixed PATH for subprocess lookup — never trust process.env.PATH for spawning. */
export const SAFE_PATH = "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin";

function whichBinary(): string {
  return process.platform === "win32"
    ? String.raw`C:\Windows\System32\where.exe`
    : "/usr/bin/which";
}

/**
 * Resolve an executable name to an absolute path using a fixed PATH.
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
  if (!/^[\w.-]+$/.test(cmd)) return null;

  const lookup = whichBinary();
  const r = spawnSync(lookup, [cmd], {
    encoding: "utf-8",
    env: { PATH: SAFE_PATH },
  });
  if (r.status !== 0) return null;
  const line = r.stdout.trim().split(/\r?\n/)[0]?.trim();
  if (!line) return null;
  if (process.platform !== "win32") {
    assertSafePath(line);
  }
  return line;
}

/** Environment for child processes that must not inherit a writable PATH. */
export function safeSpawnEnv(extra?: Record<string, string>): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
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
