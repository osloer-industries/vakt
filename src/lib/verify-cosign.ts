import { execFileSync } from "node:child_process";
import { validatedOciReference } from "./safe-input-oci";
import { requireExecutable, safeSpawnEnv } from "./safe-exec";
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

/** Run cosign verify; identifier is parsed into a rebuilt OCI ref before argv is built. */
export function runCosignVerify(untrustedIdentifier: string): CosignVerifyOutput {
  const safeRef = validatedOciReference(untrustedIdentifier);
  const cosignBin = requireExecutable("cosign");
  try {
    const stdout = execFileSync(cosignBin, ["verify", safeRef], {
      encoding: "utf-8",
      env: safeSpawnEnv(),
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    return cosignErrorOutput(e);
  }
}