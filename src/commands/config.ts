// src/commands/config.ts
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { AGENTS_DIR, loadAgentConfig } from "../lib/config";
import { isRecord, nestedRecordGet, nestedRecordSet, parseJsonUnknown } from "../lib/type-guards";

const configPath = join(AGENTS_DIR, "config.json");

function guardInit(): void {
  if (!existsSync(configPath)) {
    console.error("Run 'vakt init' first");
    process.exit(1);
  }
}

function listAction(): void {
  guardInit();
  const cfg = loadAgentConfig();
  console.log(JSON.stringify(cfg, null, 2));
}

export function registerConfig(program: Command): void {
  const cmd = program
    .command("config")
    .description("View or edit configuration")
    .action(listAction);

  cmd.command("list")
    .description("Show all config")
    .action(listAction);

  cmd.command("get <key>")
    .description("Get a config value by dot-notation key")
    .action((key: string) => {
      guardInit();
      const val = nestedRecordGet(loadAgentConfig(), key);
      if (val === undefined) return; // exit 0 with empty output
      console.log(typeof val === "string" ? val : JSON.stringify(val));
    });

  const setCmd = cmd.command("set <key> <value>")
    .description("Set a config value by dot-notation key")
    .action(async (key: string, value: string) => {
      guardInit();
      const rawText = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "{}";
      const parsed = parseJsonUnknown(rawText);
      const raw = isRecord(parsed) ? parsed : {};
      const next = (() => { try { return parseJsonUnknown(value); } catch { return value; } })();
      nestedRecordSet(raw, key, next);
      await Bun.write(configPath, JSON.stringify(raw, null, 2));
      console.log(`Set ${key} = ${JSON.stringify(next)}`);
    });

  setCmd.configureOutput({
    outputError(str, write) {
      write(str);
      write(`\nUsage: vakt config set <key> <value>\n`);
    },
  });
}