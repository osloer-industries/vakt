import { existsSync } from "node:fs";
import { assertSafePath } from "./safe-input";

const LIST_KEYCHAINS_SUBCOMMAND = "list-keychains";

/** Fixed argv for `security list-keychains` (no user-controlled segments). */
export function trustedSecurityListKeychainsArgv(): readonly [typeof LIST_KEYCHAINS_SUBCOMMAND] {
  return [LIST_KEYCHAINS_SUBCOMMAND];
}

/** Resolved trusted path to macOS `/usr/bin/security` for probing keychain availability. */
export function trustedMacosSecurityBinaryForProbe(): "/usr/bin/security" {
  const bin = "/usr/bin/security";
  if (!existsSync(bin)) {
    throw new Error("macOS security binary not found");
  }
  assertSafePath(bin);
  return bin;
}

/** Homebrew-installed `security` when present (Apple Silicon defaults). */
export function trustedHomebrewSecurityBinaryForProbe(): "/opt/homebrew/bin/security" {
  const bin = "/opt/homebrew/bin/security";
  if (!existsSync(bin)) {
    throw new Error("Homebrew security binary not found");
  }
  assertSafePath(bin);
  return bin;
}