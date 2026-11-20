import { join, dirname } from "node:path";
import { existsSync, mkdirSync, symlinkSync, readdirSync, readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import type { McpConfig, McpServer, Provider, StdioServer, HttpServer } from "./schemas";
import { isRecord, parseJsonUnknown } from "./type-guards";
import { expandPaths } from "./config";
import { resolveSecretRefs } from "./secrets";
import { isSkillGlobal } from "./skills";

export type ResolvedHttpServer = Omit<HttpServer, "global">;
export type ResolvedStdioServer = Omit<StdioServer, "global">;
export type ResolvedServer = ResolvedHttpServer | ResolvedStdioServer;
export type ResolvedConfig = Record<string, ResolvedServer>;

export function isResolvedHttpServer(server: ResolvedServer): server is ResolvedHttpServer {
  return "transport" in server && server.transport === "http";
}

export function isResolvedStdioServer(server: ResolvedServer): server is ResolvedStdioServer {
  return "command" in server;
}

export async function resolveServer(
  _name: string,
  server: McpServer,
  paths: Record<string, string>
): Promise<{ server: ResolvedServer; missing: string[] }> {
  const missing: string[] = [];

  async function resolveValue(v: string): Promise<string> {
    const expanded = expandPaths(v, paths);
    const { resolved, missing: m } = await resolveSecretRefs(expanded);
    missing.push(...m);
    return resolved;
  }

  async function resolveRecord(rec: Record<string, string>): Promise<Record<string, string>> {
    const pairs = await Promise.all(
      Object.entries(rec).map(async ([k, v]) => [k, await resolveValue(v)] as const),
    );
    return Object.fromEntries(pairs);
  }

  if ("transport" in server && server.transport === "http") {
    return {
      server: {
        transport: "http",
        url: await resolveValue(server.url),
        ...(server.headers ? { headers: await resolveRecord(server.headers) } : {}),
      },
      missing,
    };
  }

  if (!("command" in server)) {
    throw new Error("Invalid MCP server configuration");
  }
  const s = server;
  return {
    server: {
      command: s.command,
      ...(s.args ? { args: s.args } : {}),
      ...(s.env ? { env: await resolveRecord(s.env) } : {}),
      ...(s.cwd ? { cwd: await resolveValue(s.cwd) } : {}),
    },
    missing,
  };
}

export async function resolveAll(
  config: McpConfig,
  paths: Record<string, string>
): Promise<{ resolved: ResolvedConfig; allMissing: Record<string, string[]> }> {
  const pairs = await Promise.all(
    Object.entries(config).map(async ([name, server]) => {
      const { server: r, missing } = await resolveServer(name, server, paths);
      return { name, r, missing };
    }),
  );
  const resolved: ResolvedConfig = {};
  const allMissing: Record<string, string[]> = {};
  for (const { name, r, missing } of pairs) {
    resolved[name] = r;
    if (missing.length > 0) allMissing[name] = missing;
  }
  return { resolved, allMissing };
}

type HttpMapping = NonNullable<Provider["configStructure"]["httpPropertyMapping"]>;
type StdioMapping = NonNullable<Provider["configStructure"]["stdioPropertyMapping"]>;

function formatHttpServer(
  s: Pick<HttpServer, "transport" | "url" | "headers">,
  hm: HttpMapping,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (hm.typeProperty && hm.typeValue) out[hm.typeProperty] = hm.typeValue;
  if (hm.urlProperty) out[hm.urlProperty] = s.url;
  if (hm.headersProperty && s.headers) out[hm.headersProperty] = s.headers;
  return out;
}

function formatStdioServer(
  s: Pick<StdioServer, "command" | "args" | "env" | "cwd">,
  sm: StdioMapping,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (sm.typeProperty && sm.typeValue) out[sm.typeProperty] = sm.typeValue;
  if (sm.commandProperty && sm.commandProperty === sm.argsProperty) {
    out[sm.commandProperty] = [s.command, ...(s.args ?? [])];
  } else {
    if (sm.commandProperty) out[sm.commandProperty] = s.command;
    if (sm.argsProperty && s.args?.length) out[sm.argsProperty] = s.args;
  }
  if (sm.envProperty && s.env) out[sm.envProperty] = s.env;
  if (s.cwd) out["cwd"] = s.cwd;
  return out;
}

function formatServer(
  _name: string,
  server: ResolvedServer,
  provider: Provider
): Record<string, unknown> {
  const { stdioPropertyMapping: sm, httpPropertyMapping: hm } = provider.configStructure;
  if (isResolvedHttpServer(server)) {
    if (hm) return formatHttpServer(server, hm);
    return { transport: "http", url: server.url, ...(server.headers ? { headers: server.headers } : {}) };
  }
  if (isResolvedStdioServer(server)) {
    if (sm) return formatStdioServer(server, sm);
    return {
      command: server.command,
      ...(server.args?.length ? { args: server.args } : {}),
      ...(server.env ? { env: server.env } : {}),
      ...(server.cwd ? { cwd: server.cwd } : {}),
    };
  }
  return {};
}

export function formatForProvider(
  resolved: ResolvedConfig,
  provider: Provider
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(resolved).map(([name, server]) => [name, formatServer(name, server, provider)])
  );
}

export async function writeJsonConfig(
  filePath: string,
  serversKey: string,
  servers: Record<string, Record<string, unknown>>,
  dryRun: boolean
): Promise<void> {
  let existing: Record<string, unknown> = {};
  if (existsSync(filePath)) {
    const raw = parseJsonUnknown(await Bun.file(filePath).text());
    existing = isRecord(raw) ? raw : {};
  }
  existing[serversKey] = servers;
  const content = JSON.stringify(existing, null, 2) + "\n";
  if (!dryRun) {
    mkdirSync(dirname(filePath), { recursive: true });
    await Bun.write(filePath, content);
  }
}

export function readTomlConfig(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    const parsed: unknown = parseToml(readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : {};
  }
  catch { return {}; }
}

export function toToml(data: Record<string, unknown>, _indent = 0): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") lines.push(`${k} = ${JSON.stringify(v)}`);
    else if (typeof v === "number" || typeof v === "boolean") lines.push(`${k} = ${v}`);
    else if (Array.isArray(v)) lines.push(`${k} = ${JSON.stringify(v)}`);
    else if (isRecord(v)) {
      lines.push(`\n[${k}]`);
      lines.push(toToml(v));
    }
  }
  return lines.join("\n");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

/** Serialise a flat string-valued record as a TOML inline table: { k = "v", ... } */
function toTomlInlineTable(obj: Record<string, string>): string {
  const pairs = Object.entries(obj)
    .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
    .join(", ");
  return `{ ${pairs} }`;
}

/**
 * Serialise a record of servers as TOML array-of-tables.
 * Each entry gets a `name` field injected from the record key.
 *
 *   [[mcp_servers]]
 *   name = "github"
 *   transport = "stdio"
 *   ...
 */
export function toTomlArrayOfTables(
  key: string,
  servers: Record<string, Record<string, unknown>>
): string {
  return Object.entries(servers)
    .map(([name, fields]) => {
      const lines = [`[[${key}]]`, `name = ${JSON.stringify(name)}`];
      for (const [k, v] of Object.entries(fields)) {
        if (typeof v === "string") lines.push(`${k} = ${JSON.stringify(v)}`);
        else if (typeof v === "number" || typeof v === "boolean") lines.push(`${k} = ${v}`);
        else if (Array.isArray(v)) lines.push(`${k} = ${JSON.stringify(v)}`);
        else if (isStringRecord(v)) {
          lines.push(`${k} = ${toTomlInlineTable(v)}`);
        }
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Write MCP server config to a TOML file, preserving existing non-server keys.
 * Supports both record format ([mcp_servers.name]) and array-of-tables ([[mcp_servers]]).
 */
export async function writeTomlConfig(
  filePath: string,
  serversKey: string,
  servers: Record<string, Record<string, unknown>>,
  serversFormat: "record" | "array",
  dryRun: boolean
): Promise<void> {
  const existing = readTomlConfig(filePath);
  let content: string;

  if (serversFormat === "array") {
    // Rebuild file: all non-server keys first, then the array-of-tables block
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(existing)) {
      if (k !== serversKey) rest[k] = v;
    }
    const parts: string[] = [];
    if (Object.keys(rest).length > 0) parts.push(toToml(rest));
    if (Object.keys(servers).length > 0) parts.push(toTomlArrayOfTables(serversKey, servers));
    content = parts.join("\n\n") + "\n";
  } else {
    existing[serversKey] = servers;
    content = toToml(existing) + "\n";
  }

  if (!dryRun) {
    mkdirSync(dirname(filePath), { recursive: true });
    await Bun.write(filePath, content);
  }
}

/** System junk / metadata files that must never be treated as skills. */
const SYSTEM_FILES = new Set(["Thumbs.db", "desktop.ini"]);

/** True for entries that should never be synced as skills: system junk, hidden files, dot-dirs. */
export function isIgnoredSkillEntry(entry: string): boolean {
  return entry.startsWith(".") || SYSTEM_FILES.has(entry);
}

function linkOneSkill(
  entry: string,
  skillsSource: string,
  skillsTarget: string,
  dryRun: boolean,
  globalOnly: boolean,
): { kind: "linked" | "skipped" | "error"; message: string } | null {
  const src = join(skillsSource, entry);
  if (globalOnly && !isSkillGlobal(src)) return null;
  const dest = join(skillsTarget, entry);
  if (existsSync(dest)) return { kind: "skipped", message: entry };
  if (dryRun) return { kind: "linked", message: `[dry-run] Would link: ${entry}` };
  try {
    symlinkSync(src, dest);
    return { kind: "linked", message: entry };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { kind: "error", message: `${entry}: ${detail}` };
  }
}

export function syncSkills(
  skillsSource: string,
  skillsTarget: string,
  dryRun: boolean,
  globalOnly = true,
): { linked: string[]; skipped: string[]; errors: string[] } {
  const linked: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  if (!existsSync(skillsSource)) return { linked, skipped, errors };
  if (!dryRun) mkdirSync(skillsTarget, { recursive: true });

  const entries = readdirSync(skillsSource).filter((e) => !isIgnoredSkillEntry(e));
  for (const entry of entries) {
    const result = linkOneSkill(entry, skillsSource, skillsTarget, dryRun, globalOnly);
    if (result === null) continue;
    if (result.kind === "linked") linked.push(result.message);
    else if (result.kind === "skipped") skipped.push(result.message);
    else errors.push(result.message);
  }
  return { linked, skipped, errors };
}
