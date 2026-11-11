import { execFileSync } from "node:child_process";
import { assertOciReference } from "./safe-input";
import { requireExecutable, safeSpawnEnv } from "./safe-exec";

export type CosignVerifyOutput = {
  status: number;
  stdout: string;
  stderr: string;
};

/** Run cosign verify; identifier is validated twice before argv is built. */
export function runCosignVerify(untrustedIdentifier: string): CosignVerifyOutput {
  const firstPass = untrustedIdentifier.trim();
  assertOciReference(firstPass);
  const ociRef = firstPass;
  assertOciReference(ociRef);
  if (!/^[\w./:@-]+$/i.test(ociRef) || ociRef.length > 512) {
    throw new Error("Invalid OCI reference for cosign");
  }

  const cosignBin = requireExecutable("cosign");
  try {
    const stdout = execFileSync(cosignBin, ["verify", "--", ociRef], {
      encoding: "utf-8",
      env: safeSpawnEnv(),
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}
