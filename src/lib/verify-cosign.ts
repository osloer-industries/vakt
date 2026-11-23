import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { validatedOciReference } from "./safe-input-oci";
import { SAFE_PATH } from "./safe-exec";
import { assertSafePath } from "./safe-input";
import { isRecord, readNumber, readString } from "./type-guards";

export type CosignVerifyOutput = {
  status: number;
  stdout: string;
  stderr: string;
};

function cosignErrorOutput(e: unknown): CosignVerifyOutput {
  if (isRecord(e)) {
    const status = readNumber(e, "status") ?? 1;
    return {
      status,
      stdout: readString(e, "stdout") ?? "",
      stderr: readString(e, "stderr") ?? "",
    };
  }
  return { status: 1, stdout: "", stderr: String(e) };
}

const TRUSTED_COSIGN_PATHS = [
  "/opt/homebrew/bin/cosign",
  "/usr/local/bin/cosign",
  "/usr/bin/cosign",
] as const;

function cosignBinaryPath(): string {
  for (const candidate of TRUSTED_COSIGN_PATHS) {
    if (existsSync(candidate)) {
      assertSafePath(candidate);
      return candidate;
    }
  }
  throw new Error("cosign not found in trusted bin directories");
}

/** Run cosign verify; identifier is parsed into a rebuilt OCI ref before argv is built. */
export function runCosignVerify(untrustedIdentifier: string): CosignVerifyOutput {
  const safeRef = validatedOciReference(untrustedIdentifier);
  const cosignBin = cosignBinaryPath();
  try {
    const stdout = execFileSync(cosignBin, ["verify", "--", safeRef], {
      encoding: "utf-8",
      env: { PATH: SAFE_PATH },
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    return cosignErrorOutput(e);
  }
}