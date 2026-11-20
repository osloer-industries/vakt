import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { assertSafePath } from "./safe-input";

const MACOS_SECURITY = "/usr/bin/security";
const LIST_KEYCHAINS = ["list-keychains"] as const;

/** True when the macOS security CLI can list keychains (binary present and keychain usable). */
export function macosKeychainResponds(): boolean {
  if (process.platform !== "darwin" || !existsSync(MACOS_SECURITY)) {
    return false;
  }
  assertSafePath(MACOS_SECURITY);
  try {
    const stdout = execFileSync(MACOS_SECURITY, LIST_KEYCHAINS, {
      encoding: "utf-8",
      timeout: 2000,
      env: { PATH: "/usr/bin:/bin" },
    });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}