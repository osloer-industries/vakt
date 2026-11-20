import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AGENTS_DIR, expandHome } from "./config";
import { PolicySchema, type Policy, type PolicyResult, type PolicyServerRules } from "./schemas";

export function loadPolicy(): Policy | null {
  const path = join(AGENTS_DIR, "policy.json");
  if (!existsSync(path)) return null;
  return PolicySchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export function loadMergedPolicy(agentsDir: string): Policy | null {
  const remotePath = join(agentsDir, "policy.remote.json");
  const localPath = join(agentsDir, "policy.json");

  let remote: Policy | null = null;
  let local: Policy | null = null;

  if (existsSync(remotePath)) {
    try {
      const raw: unknown = JSON.parse(readFileSync(remotePath, "utf-8"));
      const result = PolicySchema.safeParse(raw);
      if (result.success) remote = result.data;
    } catch { /* ignore */ }
  }

  if (existsSync(localPath)) {
    try {
      const raw: unknown = JSON.parse(readFileSync(localPath, "utf-8"));
      const result = PolicySchema.safeParse(raw);
      if (result.success) local = result.data;
    } catch { /* ignore */ }
  }

  if (remote && local) return mergePolicies(remote, local);
  return remote ?? local ?? null;
}

const POLICY_META_KEY = "_meta";

export function mergePolicies(remote: Policy, local: Policy): Policy {
  const lockedKeys = new Set(remote[POLICY_META_KEY]?.lockedKeys ?? []);

  const merged: Record<string, unknown> = { ...remote };

  for (const [key, value] of Object.entries(local)) {
    if (key === POLICY_META_KEY) continue; // Never override _meta from local
    if (lockedKeys.has(key)) continue; // Locked by remote

    if (key === "servers") {
      merged["servers"] = mergeServers(
        remote.servers ?? {},
        local.servers ?? {},
      );
    } else {
      merged[key] = value;
    }
  }

  // Re-parse to ensure type safety
  const result = PolicySchema.safeParse(merged);
  return result.success ? result.data : remote; // Fall back to remote if merge produces invalid policy
}

function mergeServers(
  remoteServers: Record<string, PolicyServerRules>,
  localServers: Record<string, PolicyServerRules>
): Record<string, PolicyServerRules> {
  const merged = { ...remoteServers };
  for (const [name, localCfg] of Object.entries(localServers)) {
    if (!(name in merged)) {
      merged[name] = localCfg;
      continue;
    }
    const remoteCfg = merged[name];
    if (remoteCfg === undefined) {
      merged[name] = localCfg;
      continue;
    }
    const rTools = remoteCfg.tools ?? {};
    const lTools = localCfg.tools ?? {};

    const mergedTools: { allow?: string[]; deny?: string[] } = { ...rTools };

    if (lTools.allow !== undefined || rTools.allow !== undefined) {
      const rAllow = new Set(rTools.allow ?? []);
      const lAllow = new Set(lTools.allow ?? []);
      mergedTools.allow = uniqueSortedStrings([...rAllow, ...lAllow]);
    }

    if (lTools.deny !== undefined || rTools.deny !== undefined) {
      const rDeny = new Set(rTools.deny ?? []);
      const lDeny = new Set(lTools.deny ?? []);
      mergedTools.deny = uniqueSortedStrings([...rDeny, ...lDeny]);
    }

    merged[name] = { ...remoteCfg, tools: mergedTools };
  }
  return merged;
}

function uniqueSortedStrings(values: string[]): string[] {
  const copy = [...new Set(values)];
  copy.sort((a, b) => a.localeCompare(b));
  return copy;
}

/** Convert a simple glob pattern (only * as wildcard) to a RegExp. */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export interface CheckResult {
  result: PolicyResult;
  matchedRule?: string;
}

type ToolRules = NonNullable<PolicyServerRules["tools"]>;
type PathRules = NonNullable<PolicyServerRules["paths"]>;

function matchToolPattern(patterns: string[] | undefined, toolName: string): string | undefined {
  return patterns?.find((p) => globToRegex(p).test(toolName));
}

function matchPathPattern(patterns: string[] | undefined, filePath: string): string | undefined {
  return patterns?.find((p) => filePath.startsWith(expandHome(p)));
}

function denyToolHit(
  tools: ToolRules | undefined,
  toolName: string,
  rulePrefix: string,
): CheckResult | null {
  if (!tools) return null;
  const denied = matchToolPattern(tools.deny, toolName);
  return denied ? { result: "deny", matchedRule: `${rulePrefix}.tools.deny["${denied}"]` } : null;
}

function allowToolHit(
  tools: ToolRules | undefined,
  toolName: string,
  rulePrefix: string,
): CheckResult | null {
  if (!tools) return null;
  const allowed = matchToolPattern(tools.allow, toolName);
  return allowed ? { result: "allow", matchedRule: `${rulePrefix}.tools.allow["${allowed}"]` } : null;
}

function denyPathHit(
  paths: PathRules | undefined,
  filePath: string,
  rulePrefix: string,
): CheckResult | null {
  if (!paths) return null;
  const denied = matchPathPattern(paths.deny, filePath);
  return denied ? { result: "deny", matchedRule: `${rulePrefix}.paths.deny["${denied}"]` } : null;
}

function allowPathHit(
  paths: PathRules | undefined,
  filePath: string,
  rulePrefix: string,
): CheckResult | null {
  if (!paths) return null;
  const allowed = matchPathPattern(paths.allow, filePath);
  return allowed ? { result: "allow", matchedRule: `${rulePrefix}.paths.allow["${allowed}"]` } : null;
}

export class PolicyEngine {
  constructor(private policy: Policy) {}

  checkTool(serverName: string, toolName: string): CheckResult {
    const specific = this.policy.servers?.[serverName];
    const wildcard = this.policy.servers?.["*"];
    const scoped: Array<[PolicyServerRules | undefined, string]> = [
      [specific, `servers.${serverName}`],
      [wildcard, `servers["*"]`],
    ];
    for (const [rules, prefix] of scoped) {
      const hit = denyToolHit(rules?.tools, toolName, prefix);
      if (hit) return hit;
    }
    for (const [rules, prefix] of scoped) {
      const hit = allowToolHit(rules?.tools, toolName, prefix);
      if (hit) return hit;
    }
    return { result: this.policy.default, matchedRule: `default["${this.policy.default}"]` };
  }

  checkPath(serverName: string, filePath: string): CheckResult {
    const specific = this.policy.servers?.[serverName];
    const wildcard = this.policy.servers?.["*"];
    const scoped: Array<[PolicyServerRules | undefined, string]> = [
      [specific, `servers.${serverName}`],
      [wildcard, `servers["*"]`],
    ];
    for (const [rules, prefix] of scoped) {
      const hit = denyPathHit(rules?.paths, filePath, prefix);
      if (hit) return hit;
    }
    for (const [rules, prefix] of scoped) {
      const hit = allowPathHit(rules?.paths, filePath, prefix);
      if (hit) return hit;
    }
    return { result: this.policy.default, matchedRule: `default["${this.policy.default}"]` };
  }

  get registryPolicy() { return this.policy.registryPolicy ?? "allow-unverified"; }
}
