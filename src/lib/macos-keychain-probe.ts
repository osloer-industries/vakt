import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { assertSafePath } from "./safe-input";

const KEYCHAIN_PROBE_ENV = { PATH: "/usr/bin:/bin" } as const;

function listKeychainsStdout(): string {
  if (!existsSync("/usr/bin/security")) return "";
  assertSafePath("/usr/bin/security");
  const result = spawnSync("/usr/bin/security", ["list-keychains"], {
    encoding: "utf-8",
    timeout: 2000,
    env: KEYCHAIN_PROBE_ENV,
  });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

function listKeychainsStdoutHomebrew(): string {
  if (!existsSync("/opt/homebrew/bin/security")) return "";
  assertSafePath("/opt/homebrew/bin/security");
  const result = spawnSync("/opt/homebrew/bin/security", ["list-keychains"], {
    encoding: "utf-8",
    timeout: 2000,
    env: KEYCHAIN_PROBE_ENV,
  });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

/** True when a trusted macOS `security list-keychains` invocation succeeds with output. */
export function macosKeychainResponds(): boolean {
  if (process.platform !== "darwin") return false;
  const stdout = listKeychainsStdout() || listKeychainsStdoutHomebrew();
  return stdout.length > 0;
}