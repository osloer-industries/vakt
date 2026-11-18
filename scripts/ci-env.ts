import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/** PATH pinned for CI child processes (Sonar rule typescript:S4036). */
export const CI_SAFE_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

export function ciExecFile(
  file: string,
  args: string[],
  options: Pick<ExecFileSyncOptions, "stdio" | "env" | "encoding"> = {
    stdio: "inherit",
  },
): string | undefined {
  const extraEnv = options.env ?? {};
  const env = { ...process.env, ...extraEnv, PATH: CI_SAFE_PATH };
  return execFileSync(file, args, { ...options, env }) as string | undefined;
}

const BIN_CANDIDATES: Record<string, string[]> = {
  bash: ["/bin/bash", "/usr/bin/bash"],
  python3: ["/usr/bin/python3", "/bin/python3"],
  chmod: ["/bin/chmod", "/usr/bin/chmod"],
  grep: ["/bin/grep", "/usr/bin/grep"],
  bun: [
    "/usr/local/bin/bun",
    `${homedir()}/.bun/bin/bun`,
    "/root/.bun/bin/bun",
  ],
};

export function resolveCiBinary(name: string): string {
  const candidates = BIN_CANDIDATES[name];
  if (candidates === undefined) {
    throw new Error(`No CI binary mapping for ${name}`);
  }
  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }
  throw new Error(`CI binary not found: ${name}`);
}