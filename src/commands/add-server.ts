// src/commands/add-server.ts
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { AGENTS_DIR, loadMcpConfig } from "../lib/config";
import { RegistryClient } from "../lib/registry";
import { verifyPackage } from "../lib/verify";
import { sanitizeForLog } from "../lib/safe-input";
import { PolicyEngine, loadMergedPolicy } from "../lib/policy";
import { isRecord, parseJsonUnknown } from "../lib/type-guards";
import { McpConfigSchema, McpServerSchema, type McpConfig } from "../lib/schemas";

type StdioEntryOpts = { command: string; args: string[]; global: boolean };
type HttpEntryOpts = { transport: "http"; url: string; global: boolean };
type ServerEntryOpts = StdioEntryOpts | HttpEntryOpts;

export function buildServerEntry(opts: ServerEntryOpts): Record<string, unknown> {
  if ("transport" in opts) {
    return { transport: opts.transport, url: opts.url, global: opts.global };
  }
  return {
    command: opts.command,
    ...(opts.args.length > 0 ? { args: opts.args } : {}),
    global: opts.global,
  };
}

export async function addServerToConfig(
  agentsDir: string,
  name: string,
  opts: ServerEntryOpts,
): Promise<void> {
  const mcpPath = join(agentsDir, "mcp-config.json");
  let config: McpConfig = {};
  if (existsSync(mcpPath)) {
    config = McpConfigSchema.parse(parseJsonUnknown(readFileSync(mcpPath, "utf-8")));
  }
  config[name] = McpServerSchema.parse(buildServerEntry(opts));
  await Bun.write(mcpPath, JSON.stringify(config, null, 2));
}

function filterCmdArgs(rawAfterName: string[]): string[] {
  const cmdArgs: string[] = [];
  for (let i = 0; i < rawAfterName.length; i++) {
    const token = rawAfterName[i];
    if (token === undefined) continue;
    if (token === "--http") { i++; continue; }
    if (token.startsWith("--http=")) continue;
    if (token === "--global") continue;
    cmdArgs.push(token);
  }
  return cmdArgs;
}

const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function enforceRegistryVerification(
  firstArg: string,
  registryPolicy: string,
  vResult: Awaited<ReturnType<typeof verifyPackage>>,
): void {
  if (vResult.ok) return;
  if (registryPolicy === "registry-only") {
    console.error(red(`✗ Verification failed for ${sanitizeForLog(firstArg)}:`));
    console.error(red(`  ${sanitizeForLog(vResult.reason)}`));
    console.error(red(`\nServer not added. Set policy.registryPolicy to "warn-unverified" or "allow-unverified" to proceed.`));
    process.exit(1);
  }
  if (registryPolicy === "warn-unverified") {
    console.log(yellow(`⚠ Warning: ${sanitizeForLog(firstArg)} could not be verified`));
    console.log(yellow(`  ${sanitizeForLog(vResult.reason)}`));
  }
}

function buildRegistryFileEntry(
  firstArg: string,
  makeGlobal: boolean,
  entry: NonNullable<Awaited<ReturnType<RegistryClient["lookup"]>>>,
  resolved: ReturnType<RegistryClient["resolvePackage"]>,
  vResult: Awaited<ReturnType<typeof verifyPackage>>,
): Record<string, unknown> {
  return {
    registry: firstArg,
    ...(entry.server.version ? { version: entry.server.version } : {}),
    command: resolved.command,
    args: resolved.args,
    ...(resolved.requiredSecrets.length > 0
      ? { env: Object.fromEntries(resolved.requiredSecrets.map((k) => [k, `secret:${k}`])) }
      : {}),
    global: makeGlobal,
    verified: vResult.ok,
    ...(vResult.ok ? {
      verifiedAt: new Date().toISOString(),
      verifiedBy: vResult.signer,
    } : {
      verificationFailed: vResult.reason,
    }),
  };
}

function printRegistrySecrets(requiredSecrets: string[]): void {
  if (requiredSecrets.length === 0) return;
  console.log(`\nSecrets needed:`);
  requiredSecrets.forEach((k) =>
    console.log(`  vakt secrets set ${sanitizeForLog(k)} <value>`));
}

async function lookupRegistryEntry(
  client: RegistryClient,
  firstArg: string,
): Promise<Awaited<ReturnType<RegistryClient["lookup"]>>> {
  try {
    return await client.lookup(firstArg);
  } catch (e) {
    console.error(`Registry lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
    return null;
  }
}

async function handleRegistryServer(
  _config: ReturnType<typeof loadMcpConfig>,
  name: string,
  firstArg: string,
  makeGlobal: boolean,
  mcpPath: string,
): Promise<void> {
  const client = new RegistryClient();
  const entry = await lookupRegistryEntry(client, firstArg);
  if (!entry) {
    console.error(`Not found in MCP registry: ${firstArg}`);
    process.exit(1);
  }
  const resolved = client.resolvePackage(entry);
  const isNpx = resolved.command === "npx" || resolved.command === "bunx";
  const pkgType = isNpx ? "npm" : "oci";
  const identifier = isNpx
    ? resolved.args.find((a) => !a.startsWith("-")) ?? entry.server.name
    : entry.server.name;

  const policy = loadMergedPolicy(AGENTS_DIR);
  const engine = policy ? new PolicyEngine(policy) : null;
  const registryPolicy = engine?.registryPolicy ?? "allow-unverified";

  const vResult = await verifyPackage(pkgType, identifier, entry.server.version);
  enforceRegistryVerification(firstArg, registryPolicy, vResult);

  const fileText = existsSync(mcpPath) ? readFileSync(mcpPath, "utf-8") : "{}";
  const parsed = parseJsonUnknown(fileText);
  const file = isRecord(parsed) ? parsed : {};
  file[name] = buildRegistryFileEntry(firstArg, makeGlobal, entry, resolved, vResult);
  await Bun.write(mcpPath, JSON.stringify(file, null, 2));
  console.log(`Added ${name} from registry (${firstArg})`);
  if (vResult.ok) {
    console.log(`  ✓ Verified by ${vResult.signer}`);
  }
  printRegistrySecrets(resolved.requiredSecrets);
}

export function registerAddServer(program: Command): void {
  const cmd = program
    .command("add-server <name>")
    .description("Add a new MCP server")
    .option("--http <url>", "Add an HTTP transport server")
    .option("--global", "Mark server as global — will be synced to all providers")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async (name: string, opts: { http?: string; global?: boolean }) => {
      const mcpPath = join(AGENTS_DIR, "mcp-config.json");
      if (!existsSync(AGENTS_DIR)) {
        console.error("Run 'vakt init' first");
        process.exit(1);
      }

      const config = loadMcpConfig();
      const makeGlobal = opts.global ?? false;

      if (opts.http === undefined) {
        const argv = process.argv;
        const addServerIdx = argv.indexOf("add-server");
        const rawAfterName = addServerIdx >= 0 ? argv.slice(addServerIdx + 2) : [];
        const cmdArgs = filterCmdArgs(rawAfterName);

        if (cmdArgs.length === 0) {
          console.error("Error: provide a command (or --http <url>)");
          process.exit(1);
        }

        const firstArg = cmdArgs[0];
        if (firstArg === undefined) {
          console.error("Error: provide a command (or --http <url>)");
          process.exit(1);
        }
        if (firstArg.includes("/") && !firstArg.startsWith("/") && !firstArg.startsWith(".")) {
          await handleRegistryServer(config, name, firstArg, makeGlobal, mcpPath);
        } else {
          config[name] = { command: firstArg, args: cmdArgs.slice(1), global: makeGlobal };
          await Bun.write(mcpPath, JSON.stringify(config, null, 2));
          console.log(`Added server: ${name}`);
        }
      } else {
        config[name] = { transport: "http", url: opts.http, global: makeGlobal };
        await Bun.write(mcpPath, JSON.stringify(config, null, 2));
        console.log(`Added HTTP server: ${name}`);
      }
      console.log("Run 'vakt sync' to push to providers.");
    });

  cmd.configureOutput({
    outputError(str, write) {
      write(str);
      write(`\nUsage: vakt add-server <name> [command [args...]]\n`);
      write(`       vakt add-server <name> --http <url>\n`);
    },
  });
}
