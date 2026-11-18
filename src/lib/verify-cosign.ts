import { execFileSync } from "node:child_process";
import { validatedOciReference } from "./safe-input-oci";
import { requireExecutable, safeSpawnEnv } from "./safe-exec";

export type CosignVerifyOutput = {
  status: number;
  stdout: string;
  stderr: string;
};

/** Run cosign verify; identifier is parsed into a rebuilt OCI ref before argv is built. */
export function runCosignVerify(untrustedIdentifier: string): CosignVerifyOutput {
  const ociRef = validatedOciReference(untrustedIdentifier);

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
