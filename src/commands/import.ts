// src/commands/import.ts
import { join } from "node:path";
import { existsSync, readdirSync, lstatSync, readFileSync } from "node:fs";
import type { Command } from "commander";
import { AGENTS_DIR, loadMcpConfig, loadProviders, resolveProviderConfigPath, expandHome } from "../lib/config";
import { RawProviderServerSchema, type McpServer } from "../lib/schemas";
import { parse as parseToml } from "smol-toml";
import {
  currentPlatformKey,
  isRecord,
  parseJsonUnknown,
  platformStringPath,
} from "../lib/type-guards";

type RawServer = ReturnType<typeof RawProviderServerSchema.parse>;

function parseHttpServerEntry(r: RawServer): McpServer | null {
  const url = r.url ?? r.httpUrl ?? r.serverUrl;
  if (!url) return null;
  return {
    transport: "http",
    url,
    ...(r.headers ? { headers: r.headers } : {}),
    global: false,
  };
}

function parseStdioServerEntry(r: RawServer): McpServer | null {
  const cmdRaw = r.command;
  if (cmdRaw === undefined) return null;
  const command = Array.isArray(cmdRaw) ? cmdRaw[0] : cmdRaw;
  if (typeof command !== "string" || command.length === 0) return null;

  let args: string[] | undefined;
  if (Array.isArray(cmdRaw)) {
    args = cmdRaw.slice(1);
  } else if (Array.isArray(r.args)) {
    args = r.args;
  } else {
    args = undefined;
  }
  return {
    command,
    ...(args?.length ? { args } : {}),
    ...(r.env ? { env: r.env } : {}),
    ...(r.cwd ? { cwd: r.cwd } : {}),
    global: false,
  };
}

function parseServerEntry(r: RawServer): McpServer | null {
  if (r.url || r.httpUrl || r.serverUrl || r.type === "http") {
    return parseHttpServerEntry(r);
  }
  return parseStdioServerEntry(r);
}

function parseConfigFile(content: string, format: "json" | "toml"): Record<string, unknown> {
  const parsed: unknown = format === "json" ? parseJsonUnknown(content) : parseToml(content);
  return isRecord(parsed) ? parsed : {};
}

function serversMapFromRoot(root: Record<string, unknown>, serversKey: string): Record<string, unknown> {
  const servers = root[serversKey];
  return isRecord(servers) ? servers : {};
}

function extractServersFromFile(
  filePath: string,
  serversKey: string,
  format: "json" | "toml"
): Record<string, McpServer> {
  if (!existsSync(filePath)) return {};
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseConfigFile(content, format);
    const servers = serversMapFromRoot(parsed, serversKey);
    const result: Record<string, McpServer> = {};
    for (const [name, raw] of Object.entries(servers)) {
      const validated = RawProviderServerSchema.safeParse(raw);
      if (!validated.success) continue;
      const server = parseServerEntry(validated.data);
      if (server === null) continue;
      result[name] = server;
    }
    return result;
  } catch { return {}; }
}

function mergeServers(
  existing: Record<string, McpServer>,
  incoming: Record<string, McpServer>,
  source: string
): number {
  let imported = 0;
  for (const [name, server] of Object.entries(incoming)) {
    if (existing[name]) { console.log(`  · skipped (exists): ${name}`); continue; }
    existing[name] = server;
    console.log(`  ✓  imported: ${name} (from ${source})`);
    imported++;
  }
  return imported;
}

async function linkSkillEntry(entry: string, skillsSource: string, skillsTarget: string): Promise<void> {
  const src = join(skillsSource, entry);
  const dest = join(skillsTarget, entry);
  if (!lstatSync(src).isDirectory()) return;
  if (existsSync(dest)) return;
  const { symlinkSync, mkdirSync } = await import("fs");
  mkdirSync(skillsTarget, { recursive: true });
  symlinkSync(src, dest);
  console.log(`  ✓  linked skill: ${entry}`);
}

async function importSkillsFromProvider(
  provider: ReturnType<typeof loadProviders>[string],
  platform: ReturnType<typeof currentPlatformKey>,
  skillsTarget: string,
): Promise<void> {
  const rawPath = platformStringPath(provider.skills.path, platform);
  if (!rawPath) return;
  const skillsSource = expandHome(rawPath);
  if (!existsSync(skillsSource) || skillsSource === skillsTarget) return;
  try {
    const entries = readdirSync(skillsSource);
    await Promise.all(entries.map((entry) => linkSkillEntry(entry, skillsSource, skillsTarget)));
  } catch {
    /* skip unreadable provider skill directory */
  }
}

async function importProviderSkills(
  providers: ReturnType<typeof loadProviders>,
  platform: ReturnType<typeof currentPlatformKey>,
  skillsTarget: string,
): Promise<void> {
  await Promise.all(
    Object.values(providers).map((provider) => importSkillsFromProvider(provider, platform, skillsTarget)),
  );
}

export function registerImport(program: Command): void {
  program
    .command("import-from-everywhere")
    .description("Import MCP servers and skills from all detected provider configs")
    .action(async () => {
      const mcpPath = join(AGENTS_DIR, "mcp-config.json");
      const existing = loadMcpConfig();
      const providers = loadProviders();
      let imported = 0;
      const platform = currentPlatformKey();

      for (const provider of Object.values(providers)) {
        const format = provider.configFormat;
        const configPath = resolveProviderConfigPath(provider);

        // Primary config path
        const servers = extractServersFromFile(
          configPath,
          provider.configStructure.serversPropertyName,
          format
        );
        imported += mergeServers(existing, servers, provider.displayName);

        // Additional import paths (e.g. per-user alternate locations)
        const extraPaths = provider.additionalImportPaths?.[platform]
          ?? provider.additionalImportPaths?.["linux"]
          ?? [];
        for (const rawPath of extraPaths) {
          const extra = expandHome(rawPath.replace("$HOME", process.env["HOME"] ?? "~"));
          const extraServers = extractServersFromFile(
            extra,
            provider.configStructure.serversPropertyName,
            format
          );
          imported += mergeServers(existing, extraServers, `${provider.displayName} (${extra})`);
        }
      }

      // Import skills: symlink directories found in provider skill paths
      const skillsTarget = join(AGENTS_DIR, "skills");
      await importProviderSkills(providers, platform, skillsTarget);

      await Bun.write(mcpPath, JSON.stringify(existing, null, 2));
      if (imported === 0) {
        console.log("nothing new to import");
      } else {
        console.log(`\nImported ${imported} server(s).`);
      }
    });
}