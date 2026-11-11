// src/commands/add-skill.ts
import { join, basename } from "node:path";
import { existsSync, symlinkSync, mkdirSync } from "node:fs";
import type { Command } from "commander";
import { AGENTS_DIR } from "../lib/config";
import { setSkillGlobal } from "../lib/skills";
import { promptBoolean } from "../lib/prompt";
import {
  assertGitRemoteUrl,
  assertSafeSkillName,
  resolveLocalDirectory,
  sanitizeForLog,
} from "../lib/safe-input";
import { requireExecutable, safeSpawnEnv } from "../lib/safe-exec";

const skillsDir = join(AGENTS_DIR, "skills");

export { setSkillGlobal } from "../lib/skills";

export function registerAddSkill(program: Command): void {
  const cmd = program
    .command("add-skill <path> [name]")
    .description("Add a local skill directory or clone from git")
    .option("--global", "Mark skill as global — will be synced to all providers")
    .action(async (skillPath: string, name?: string, opts?: { global?: boolean }) => {
      const isGit =
        skillPath.startsWith("https://") || skillPath.startsWith("git@");

      mkdirSync(skillsDir, { recursive: true });

      if (isGit) {
        try {
          assertGitRemoteUrl(skillPath);
        } catch (e) {
          console.error(e instanceof Error ? e.message : String(e));
          process.exit(1);
        }
        const repoName = name
          ? assertSafeSkillName(name)
          : assertSafeSkillName(basename(skillPath).replace(/\.git$/, ""));
        const dest = join(skillsDir, repoName);
        if (existsSync(dest)) { console.log(`Skill '${repoName}' already exists.`); return; }
        const makeGlobal = opts?.global === true
          ? true
          : await promptBoolean(`Sync '${repoName}' globally to all providers?`);
        const git = requireExecutable("git");
        const proc = Bun.spawn([git, "clone", skillPath, dest], {
          stdout: "inherit",
          stderr: "inherit",
          env: safeSpawnEnv(),
        });
        if ((await proc.exited) !== 0) { console.error("git clone failed"); process.exit(1); }
        setSkillGlobal(dest, makeGlobal);
        console.log(`Cloned skill: ${repoName}`);
      } else {
        let abs: string;
        try {
          abs = resolveLocalDirectory(skillPath);
        } catch (e) {
          console.error(e instanceof Error ? e.message : String(e));
          process.exit(1);
        }
        const skillName = name ? assertSafeSkillName(name) : assertSafeSkillName(basename(abs));
        const dest = join(skillsDir, skillName);
        if (existsSync(dest)) {
          console.log(`Skill '${skillName}' already linked.`);
          return;
        }
        const makeGlobal = opts?.global === true
          ? true
          : await promptBoolean(`Sync '${skillName}' globally to all providers?`);
        symlinkSync(abs, dest);
        setSkillGlobal(dest, makeGlobal);
        console.log(`Linked skill: ${sanitizeForLog(skillName)} → ${sanitizeForLog(abs)}`);
      }
      console.log("Run 'vakt sync' to push to providers.");
    });

  cmd.configureOutput({
    outputError(str, write) {
      write(str);
      write(`\nUsage: vakt add-skill <path> [name]\n`);
    },
  });
}
