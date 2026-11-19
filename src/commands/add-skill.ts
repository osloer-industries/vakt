// src/commands/add-skill.ts
import type { Command } from "commander";
import { installSkillFromGit, installSkillFromLocal } from "../lib/add-skill-install";

export { setSkillGlobal } from "../lib/skills";

export function registerAddSkill(program: Command): void {
  const cmd = program
    .command("add-skill <path> [name]")
    .description("Add a local skill directory or clone from git")
    .option("--global", "Mark skill as global — will be synced to all providers")
    .action(async (skillPath: string, name?: string, opts?: { global?: boolean }) => {
      const isGit =
        skillPath.startsWith("https://") || skillPath.startsWith("git@");

      try {
        if (isGit) {
          await installSkillFromGit(skillPath, name, opts?.global);
        } else {
          await installSkillFromLocal(skillPath, name, opts?.global);
        }
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
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
