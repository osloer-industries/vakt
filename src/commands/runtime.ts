import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMcpConfig, loadAgentConfig, AGENTS_DIR } from "../lib/config";
import { getRuntimeForServer } from "../lib/runtime";
import { RUNTIME_BACKENDS } from "../lib/schemas";

export function registerRuntime(program: Command): void {
  const runtime = program.command("runtime").description("Manage server runtime backends (local or cloud)");

  runtime
    .command("list")
    .description("Show which runtime each server uses")
    .action(() => {
      const mc = loadMcpConfig();
      const ac = loadAgentConfig();
      console.log(`\n${"SERVER".padEnd(25)} RUNTIME`);
      console.log("─".repeat(35));
      for (const name of Object.keys(mc)) {
        console.log(`${name.padEnd(25)} ${getRuntimeForServer(name, ac)}`);
      }
    });

  runtime
    .command("set <server> <backend>")
    .description(`Set runtime for a server: ${RUNTIME_BACKENDS.join(" | ")}`)
    .action((server: string, backend: string) => {
      if (!(RUNTIME_BACKENDS as readonly string[]).includes(backend)) {
        console.error(`Backend must be one of: ${RUNTIME_BACKENDS.join(", ")}`);
        process.exit(1);
      }
      const ac = loadAgentConfig();
      if (!ac.runtime) ac.runtime = { default: "local" };
      if (!ac.runtime!.servers) ac.runtime!.servers = {};
      (ac.runtime!.servers as Record<string, string>)[server] = backend;
      writeFileSync(join(AGENTS_DIR, "config.json"), JSON.stringify(ac, null, 2) + "\n");
      console.log(`✓ ${server} → ${backend}`);
    });
}
