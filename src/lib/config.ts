import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import providersRaw from "../providers.json";
import {
  AgentConfigSchema, McpConfigSchema, ProvidersSchema,
  type AgentConfig, type McpConfig, type Providers, type Provider,
} from "./schemas";
import { currentPlatformKey, platformStringPath } from "./type-guards";

export const AGENTS_DIR = process.env["AGENTS_DIR"] ?? join(process.env["HOME"] ?? "~", ".agents");

export function loadAgentConfig(): AgentConfig {
  const path = join(AGENTS_DIR, "config.json");
  if (!existsSync(path)) return AgentConfigSchema.parse({});
  return AgentConfigSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export function loadMcpConfig(): McpConfig {
  const path = join(AGENTS_DIR, "mcp-config.json");
  if (!existsSync(path)) return {};
  return McpConfigSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export function loadProviders(): Providers {
  const filtered = Object.fromEntries(
    Object.entries(providersRaw).filter(([k]) => !k.startsWith("$") && !k.startsWith("_"))
  );
  return ProvidersSchema.parse(filtered);
}

/** Expand {{paths.code}} style templates */
export function expandPaths(value: string, paths: Record<string, string>): string {
  return value.replaceAll(/\{\{paths\.(\w+)\}\}/g, (_, key: string) => {
    const val = paths[key] ?? "";
    return val.startsWith("~") ? join(process.env["HOME"] ?? "~", val.slice(1)) : val;
  });
}

/** Expand ~ to $HOME in a path string */
export function expandHome(value: string): string {
  const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "~";
  return value.startsWith("~")
    ? join(home, value.slice(1))
    : value.replace(/^\$HOME/, home).replace(/^%USERPROFILE%/, home);
}

/** Resolve provider config path for current platform */
export function resolveProviderConfigPath(provider: Provider): string {
  const raw = platformStringPath(provider.configPath, currentPlatformKey());
  return expandHome(raw.replace("$HOME", process.env["HOME"] ?? "~"));
}
