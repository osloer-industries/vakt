import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";

/** PATH pinned for CI child processes (Sonar rule typescript:S4036). */
export const CI_SAFE_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

export type CiExecFileOptions = Pick<
  ExecFileSyncOptions,
  "stdio" | "env" | "encoding"
> & {
  /** Extra directories prepended to the pinned PATH (e.g. dir containing `bun`). */
  pathPrefix?: string;
};

export function ciExecFile(
  file: string,
  args: string[],
  options: CiExecFileOptions = {
    stdio: "inherit",
  },
): string | undefined {
  const { pathPrefix, env: extraEnv = {}, ...execOptions } = options;
  const pathParts = [pathPrefix, CI_SAFE_PATH].filter(
    (part): part is string => part !== undefined && part.length > 0,
  );
  const env = { ...process.env, ...extraEnv, PATH: pathParts.join(":") };
  return execFileSync(file, args, {
    ...execOptions,
    env,
  }) as string | undefined;
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