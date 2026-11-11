import { basename, join } from "node:path";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { AGENTS_DIR } from "./config";
import { setSkillGlobal } from "./skills";
import { promptBoolean } from "./prompt";
import {
  assertGitRemoteUrl,
  assertSafeSkillName,
  userPathRoots,
  resolveLocalDirectory,
  sanitizeForLog,
} from "./safe-input";
import { requireExecutable, safeSpawnEnv } from "./safe-exec";

const skillsDir = join(AGENTS_DIR, "skills");

export async function installSkillFromGit(
  skillPath: string,
  name: string | undefined,
  makeGlobalFlag: boolean | undefined,
): Promise<void> {
  assertGitRemoteUrl(skillPath);
  mkdirSync(skillsDir, { recursive: true });
  const repoName = name
    ? assertSafeSkillName(name)
    : assertSafeSkillName(basename(skillPath).replace(/\.git$/, ""));
  const dest = join(skillsDir, repoName);
  if (existsSync(dest)) {
    console.log(`Skill '${repoName}' already exists.`);
    return;
  }
  const makeGlobal = makeGlobalFlag === true
    ? true
    : await promptBoolean(`Sync '${repoName}' globally to all providers?`);
  const git = requireExecutable("git");
  const proc = Bun.spawn([git, "clone", skillPath, dest], {
    stdout: "inherit",
    stderr: "inherit",
    env: safeSpawnEnv(),
  });
  if ((await proc.exited) !== 0) {
    console.error("git clone failed");
    process.exit(1);
  }
  setSkillGlobal(dest, makeGlobal);
  console.log(`Cloned skill: ${repoName}`);
}

export async function installSkillFromLocal(
  skillPath: string,
  name: string | undefined,
  makeGlobalFlag: boolean | undefined,
): Promise<void> {
  mkdirSync(skillsDir, { recursive: true });
  const roots = userPathRoots(AGENTS_DIR);
  const abs = resolveLocalDirectory(skillPath, roots);
  const skillName = name ? assertSafeSkillName(name) : assertSafeSkillName(basename(abs));
  const dest = join(skillsDir, skillName);
  if (existsSync(dest)) {
    console.log(`Skill '${skillName}' already linked.`);
    return;
  }
  const makeGlobal = makeGlobalFlag === true
    ? true
    : await promptBoolean(`Sync '${skillName}' globally to all providers?`);
  symlinkSync(abs, dest);
  setSkillGlobal(dest, makeGlobal);
  console.log(`Linked skill: ${sanitizeForLog(skillName)} → ${sanitizeForLog(abs)}`);
}
