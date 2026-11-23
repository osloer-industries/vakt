import { execFileSync } from "node:child_process";
import {
  trustedHomebrewSecurityBinaryForProbe,
  trustedMacosSecurityBinaryForProbe,
  trustedSecurityListKeychainsArgv,
} from "./safe-input-security";

const KEYCHAIN_PROBE_ENV = { PATH: "/usr/bin:/bin" } as const;

function probeUsrSecurityListKeychains(): boolean {
  try {
    const stdout = execFileSync(trustedMacosSecurityBinaryForProbe(), trustedSecurityListKeychainsArgv(), {
      encoding: "utf-8",
      timeout: 2000,
      env: KEYCHAIN_PROBE_ENV,
    });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function probeHomebrewSecurityListKeychains(): boolean {
  try {
    const stdout = execFileSync(trustedHomebrewSecurityBinaryForProbe(), trustedSecurityListKeychainsArgv(), {
      encoding: "utf-8",
      timeout: 2000,
      env: KEYCHAIN_PROBE_ENV,
    });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function computeMacosKeychainAvailable(): boolean {
  if (process.platform !== "darwin") return false;
  if (probeUsrSecurityListKeychains()) return true;
  return probeHomebrewSecurityListKeychains();
}

/** Evaluated at module load — not on the `getBackend()` call path from CLI handlers. */
export const MACOS_KEYCHAIN_AVAILABLE = computeMacosKeychainAvailable();