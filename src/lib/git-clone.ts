import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { AGENTS_DIR } from "./config";
import { assertSafeSkillName, resolveWritableFileUnderRoots, userPathRoots, validatedHttpsGitRemote } from "./safe-input";
import { SAFE_PATH } from "./safe-exec";

const TRUSTED_GIT_PATHS = [
  "/opt/homebrew/bin/git",
  "/usr/local/bin/git",
  "/usr/bin/git",
] as const;

function trustedGitBinary(): string {
  for (const candidate of TRUSTED_GIT_PATHS) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("git not found in trusted bin directories");
}

/** Clone a registry skill into the bounded agents skills directory. */
export function cloneRegistrySkill(httpsUrl: string, skillName: string, agentsDir: string = AGENTS_DIR): void {
  const remote = validatedHttpsGitRemote(httpsUrl);
  const safeName = assertSafeSkillName(skillName);
  const roots = userPathRoots(agentsDir);
  const boundedSkillsDir = dirname(
    resolveWritableFileUnderRoots(join(agentsDir, "skills", ".vakt-registry-marker"), roots),
  );
  const dest = join(boundedSkillsDir, safeName);
  execFileSync(trustedGitBinary(), ["clone", "--depth", "1", remote, dest], {
    encoding: "utf-8",
    stdio: "inherit",
    env: { PATH: SAFE_PATH },
  });
}