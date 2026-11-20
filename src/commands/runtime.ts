import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadMcpConfig, loadAgentConfig, AGENTS_DIR } from "../lib/config";
import { getRuntimeForServer } from "../lib/runtime";
import { RuntimeBackendSchema } from "../lib/schemas";

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
    .description("Set runtime for a server")
    .action((server: string, backend: string) => {
      const parsedBackend = RuntimeBackendSchema.safeParse(backend);
      if (!parsedBackend.success) {
        console.error(`Backend must be one of: ${RuntimeBackendSchema.options.join(", ")}`);
        process.exit(1);
      }
      const ac = loadAgentConfig();
      const runtimeCfg = ac.runtime ?? { default: "local" as const };
      const servers = { ...runtimeCfg.servers, [server]: parsedBackend.data };
      ac.runtime = { ...runtimeCfg, servers };
      writeFileSync(join(AGENTS_DIR, "config.json"), JSON.stringify(ac, null, 2) + "\n");
      console.log(`✓ ${server} → ${backend}`);
    });
}
