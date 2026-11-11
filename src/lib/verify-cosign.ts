import { spawnSync } from "node:child_process";
import { validatedOciReference } from "./safe-input";
import { requireExecutable, safeSpawnEnv } from "./safe-exec";

/** Run cosign verify with a freshly validated OCI reference only. */
export function runCosignVerify(untrustedIdentifier: string): ReturnType<typeof spawnSync<string>> {
  const ociRef = validatedOciReference(untrustedIdentifier);
  const cosignBin = requireExecutable("cosign");
  return spawnSync(cosignBin, ["verify", "--", ociRef], {
    encoding: "utf-8",
    env: safeSpawnEnv(),
  });
}
