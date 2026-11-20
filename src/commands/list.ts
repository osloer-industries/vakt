// src/commands/list.ts
import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import type { Command } from "commander";
import { AGENTS_DIR, loadMcpConfig } from "../lib/config";
import { isStdioServer } from "../lib/stdio-server";
import { secretsList, getBackend } from "../lib/secrets";
import { isSkillGlobal, readSkillMeta } from "../lib/skills";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

export function globalTag(scope: "global" | "local"): string {
  return scope === "global" ? green("[global]") : yellow("[local]");
}

function serverDescription(server: import("../lib/schemas").McpServer): string {
  if ("transport" in server && server.transport === "http") return cyan(server.url);
  if (isStdioServer(server)) return dim(`${server.command} ${(server.args ?? []).join(" ")}`);
  return dim("unknown");
}

function printServers(config: import("../lib/schemas").McpConfig): void {
  console.log(`\n${bold("── MCP Servers ──────────────────────────────────────")}`);
  const entries = Object.entries(config);
  if (entries.length === 0) {
    console.log(`  ${dim("No servers configured.")}`);
  } else {
    for (const [name, server] of entries) {
      const desc = serverDescription(server);
      const tag = globalTag(server.global === true ? "global" : "local");
      console.log(`  ${bold(name)}  ${tag}  ${desc}`);
    }
  }
}

function renderSkillRow(skillsDir: string, skill: string): void {
  const skillDir = join(skillsDir, skill);
  const meta = readSkillMeta(skillDir);
  const firstLine = meta.description?.split("\n")[0] ?? "";
  const desc = firstLine ? dim(firstLine) : "";
  const tag = globalTag(isSkillGlobal(skillDir) ? "global" : "local");
  const tools = meta.allowedTools
    ? dim(`[tools: ${meta.allowedTools.join(", ")}]`)
    : yellow("[unscoped]");
  console.log(`  ${bold(skill)}  ${tag}  ${tools}  ${desc}`);
}

function printSkills(skillsDir: string): void {
  console.log(`\n${bold("── Skills ───────────────────────────────────────────")}`);
  if (!existsSync(skillsDir)) {
    console.log(`  ${dim("No skills directory.")}`);
    return;
  }
  const skills = readdirSync(skillsDir);
  if (skills.length === 0) {
    console.log(`  ${dim("No skills installed.")}`);
    return;
  }
  for (const skill of skills) renderSkillRow(skillsDir, skill);
}

async function printSecrets(): Promise<void> {
  const backend = getBackend();
  console.log(`\n${bold("── Secrets ──────────────────────────────────────────")}  ${dim(`Backend: ${backend}`)}`);
  const keys = await secretsList();
  if (keys.length === 0) {
    console.log(`  ${dim("No secrets stored.")}`);
  } else {
    for (const k of keys) console.log(`  ${bold(k)}`);
  }
}

export function registerList(program: Command): void {
  program
    .command("list [filter]")
    .description("List configured servers, skills, and secrets (filter: all|servers|skills|secrets)")
    .action(async (filter: string = "all") => {
      const showServers = filter === "all" || filter === "servers";
      const showSkills  = filter === "all" || filter === "skills";
      const showSecrets = filter === "all" || filter === "secrets";
      console.log(dim("Config: ~/.agents/"));
      if (showServers) printServers(loadMcpConfig());
      if (showSkills)  printSkills(join(AGENTS_DIR, "skills"));
      if (showSecrets) await printSecrets();
      console.log();
    });
}
