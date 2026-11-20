// src/commands/sync.ts
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import { loadMcpConfig, loadAgentConfig, loadProviders, resolveProviderConfigPath, expandHome, AGENTS_DIR } from "../lib/config";
import { isSkillClassified, setSkillGlobal, isGitRepo, fetchAndCheckSkill, pullSkill } from "../lib/skills";
import { collectGateIssues } from "../lib/sync-gate";
import { promptBoolean } from "../lib/prompt";
import { loadPolicy } from "../lib/policy";
import { makePermissionsAdapter } from "../lib/permissions";
import { syncPolicyHooks } from "../lib/policy-hooks";
import { AuditStore } from "../lib/audit";
import {
  resolveAll, formatForProvider, writeJsonConfig, writeTomlConfig, syncSkills,
  isResolvedStdioServer, type ResolvedServer,
} from "../lib/resolver";
import { ensureProviderAgentsMd } from "../lib/instructions";
import { fetchRemotePolicy, fetchRemoteMcpConfig, mergeRemoteMcp } from "../lib/remote";
import type { AgentConfig } from "../lib/schemas";
import type { ResolvedConfig } from "../lib/resolver";
import type { Provider, McpConfig } from "../lib/schemas";
import { HookProviderIdSchema } from "../lib/schemas";
import type { Policy } from "../lib/schemas";
import {
  currentPlatformKey,
  isRecord,
  mcpServerHasRegistry,
  parseJsonUnknown,
  platformStringPath,
  readString,
  readStringArray,
  readStringRecord,
} from "../lib/type-guards";

function loadRawMcpConfigEntries(agentsDir: string): Record<string, unknown> {
  const configPath = join(agentsDir, "mcp-config.json");
  if (!existsSync(configPath)) return {};
  try {
    const parsed = parseJsonUnknown(readFileSync(configPath, "utf-8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getUnclassifiedServers(agentsDir: string): string[] {
  const raw = loadRawMcpConfigEntries(agentsDir);
  return Object.entries(raw)
    .filter(([k, v]) => !k.startsWith("_") && typeof v === "object" && v !== null && !("global" in v))
    .map(([k]) => k);
}

export function getUnclassifiedSkills(agentsDir: string): string[] {
  const skillsDir = join(agentsDir, "skills");
  if (!existsSync(skillsDir)) return [];
  try {
    return readdirSync(skillsDir).filter(entry => {
      const skillPath = join(skillsDir, entry);
      return statSync(skillPath).isDirectory() && !isSkillClassified(skillPath);
    });
  } catch {
    return [];
  }
}

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const ok = (s: string) => console.log(`  ${green("✓")}  ${s}`);
const warn = (s: string) => console.log(`  ${yellow("⚠")}  ${s}`);
const info = (s: string) => console.log(`  ${cyan("→")}  ${s}`);
const err = (s: string) => console.log(`  ${red("✗")}  ${s}`);

function resolveCmd(cmd: string): string | null {
  // Use absolute paths for system lookup tools to avoid PATH-based resolution
  const lookup = process.platform === "win32"
    ? "C:\\Windows\\System32\\where.exe"
    : "/usr/bin/which";
  const result = spawnSync(lookup, [cmd], { encoding: "utf-8" }); // NOSONAR — uses absolute path for lookup command
  if (result.status !== 0) return null;
  return result.stdout.trim().split("\n")[0]?.trim() ?? null;
}

function isInstalled(cmd: string): boolean {
  return resolveCmd(cmd) !== null;
}

function syncSingleServer(
  claudeBin: string,
  name: string,
  server: Record<string, unknown>,
  existing: string[],
): void {
  if (existing.includes(name)) {
    spawnSync(claudeBin, ["mcp", "remove", name], { stdio: "ignore" });
  }
  const url = readString(server, "url");
  const isHttp = url !== undefined;
  if (isHttp) {
    spawnSync(claudeBin, ["mcp", "add", "--transport", "http", name, url], { stdio: "ignore" });
  } else {
    const cmd = readString(server, "command");
    if (!cmd) return;
    const args = readStringArray(server, "args") ?? [];
    const env = readStringRecord(server, "env");
    const envPairs = env
      ? Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`])
      : [];
    spawnSync(claudeBin, ["mcp", "add", ...envPairs, name, cmd, ...args], { stdio: "ignore" });
  }
}

function syncViaCliProvider(
  servers: Record<string, Record<string, unknown>>,
  dryRun: boolean,
): void {
  if (dryRun) { info(`[dry-run] Would run claude mcp add/remove`); return; }
  const claudeBin = resolveCmd("claude");
  if (!claudeBin) { warn("claude not found, skipping CLI sync"); return; }

  let existing: string[] = [];
  const listResult = spawnSync(claudeBin, ["mcp", "list"], { encoding: "utf-8" });
  if (listResult.status === 0) {
    existing = (listResult.stdout ?? "").split("\n").map(l => l.split(":")[0]?.trim() ?? "").filter(Boolean);
  }

  for (const [name, server] of Object.entries(servers)) {
    syncSingleServer(claudeBin, name, server, existing);
    ok(name);
  }
}

async function syncProviderMcp(
  provider: Provider,
  servers: Record<string, Record<string, unknown>>,
  dryRun: boolean,
): Promise<void> {
  if (provider.syncMethod === "cli") {
    syncViaCliProvider(servers, dryRun);
    return;
  }

  const configPath = resolveProviderConfigPath(provider);
  const serversKey = provider.configStructure.serversPropertyName;

  if (provider.configFormat === "json") {
    await writeJsonConfig(configPath, serversKey, servers, dryRun);
    if (dryRun) info(`[dry-run] Would write ${configPath}`);
    else ok(`wrote ${configPath}`);
  } else if (provider.configFormat === "toml") {
    const serversFormat = provider.serversFormat ?? "record";
    await writeTomlConfig(configPath, serversKey, servers, serversFormat, dryRun);
    if (dryRun) info(`[dry-run] Would write ${configPath}`);
    else ok(`wrote ${configPath}`);
  }
}

export function filterGlobal(mcpConfig: McpConfig): McpConfig {
  return Object.fromEntries(
    Object.entries(mcpConfig).filter(([, server]) => server.global)
  );
}

function checkRegistryPolicy(policy: Policy | null, mcpConfig: McpConfig): void {
  if (policy?.registryPolicy !== "registry-only") return;
  const unverified = Object.keys(mcpConfig).filter(
    (name) => !mcpServerHasRegistry(mcpConfig[name]),
  );
  if (unverified.length > 0) {
    err(`Sync blocked — policy is registry-only but these servers have no registry field: ${unverified.join(", ")}`);
    err(`Set policy.registryPolicy to "warn-unverified" or add a registry field to each server.`);
    process.exit(1);
  }
}

function applyProxyWrap(resolved: ResolvedConfig, withProxy: boolean): ResolvedConfig {
  if (!withProxy) return resolved;
  const wrapped: ResolvedConfig = {};
  for (const [name, server] of Object.entries(resolved)) {
    if (isResolvedStdioServer(server)) {
      const proxied: ResolvedServer = {
        command: "vakt",
        args: ["proxy", name],
        ...(server.env ? { env: server.env } : {}),
      };
      wrapped[name] = proxied;
      continue;
    }
    wrapped[name] = server;
  }
  return wrapped;
}

async function syncMcpServers(
  providers: Provider[],
  resolved: ResolvedConfig,
  allMissing: Record<string, string[]>,
  withProxy: boolean,
  dryRun: boolean
): Promise<void> {
  console.log(`\n${bold("── MCP Servers ─────────────────────────────────────────────")}`);

  // Print each missing-secret warning once, before iterating providers
  const warnedSecrets = new Set<string>();
  for (const keys of Object.values(allMissing)) {
    for (const k of keys) {
      if (!warnedSecrets.has(k)) {
        warn(`secret '${k}' not found — set it with: vakt secrets set ${k}`);
        warnedSecrets.add(k);
      }
    }
  }

  await Promise.all(providers.map(async (provider) => {
    console.log(`\n  ${bold(provider.displayName)}`);
    if (!isInstalled(provider.detectCommand)) {
      warn(`${provider.detectCommand} not found, skipping`);
      return;
    }

    const serversForProvider = applyProxyWrap(resolved, withProxy);
    const formatted = formatForProvider(serversForProvider, provider);
    try {
      await syncProviderMcp(provider, formatted, dryRun);
      if (!dryRun) ok(`synced to ${provider.displayName}`);
    } catch (e) {
      err(`sync failed for ${provider.displayName}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }));
}

function logPermissionsResult(result: import("../lib/permissions").PermissionsResult, dryRun: boolean): void {
  for (const w of result.warnings) warn(w);
  const allowSuffix = result.allow.length > 0 ? `  allow: ${result.allow.length}` : "";
  const denySuffix  = result.deny.length  > 0 ? `  deny: ${result.deny.length}`   : "";
  if (dryRun) {
    info(`[dry-run] Would write ${result.path}${allowSuffix}${denySuffix}`);
  } else {
    ok(`wrote ${result.path}${dim(allowSuffix)}${dim(denySuffix)}`);
  }
}

function syncProviderPermissions(
  provider: Provider,
  allow: import("../lib/schemas").ToolPermission[],
  deny: import("../lib/schemas").ToolPermission[],
  dryRun: boolean,
): void {
  if (!isInstalled(provider.detectCommand)) {
    warn(`${provider.detectCommand} not found, skipping`);
    return;
  }
  if (!provider.permissionsPath || !provider.permissionsFormat) {
    warn(
      `policy.tools is set but ${provider.displayName} has no permissions config target — ` +
      `proxy (layer 1) is the only enforcement path for this provider`,
    );
    return;
  }
  const platformPath = platformStringPath(provider.permissionsPath, currentPlatformKey());
  if (!platformPath) {
    warn(`no permissionsPath for platform ${process.platform}, skipping`);
    return;
  }
  const result = makePermissionsAdapter(provider.permissionsFormat, platformPath).apply(allow, deny, dryRun);
  logPermissionsResult(result, dryRun);
}

function syncProviderHooks(provider: Provider, policy: Policy | null, dryRun: boolean): void {
  if (!isInstalled(provider.detectCommand)) return;
  
  const hookProvider = HookProviderIdSchema.safeParse(provider.id);
  if (!hookProvider.success) return;
  const result = syncPolicyHooks(hookProvider.data, policy, dryRun);
  
  if (result.action === "skipped") return;
  
  const actionStr = {
    created: "created",
    updated: "updated", 
    removed: "removed",
    "dry-run": "[dry-run] would update",
    skipped: "skipped"
  }[result.action];
  
  if (dryRun && result.action === "dry-run") {
    info(`[dry-run] Would update hook: ${result.path}`);
  } else if (result.written) {
    ok(`${actionStr} policy context: ${result.path}`);
  }
}

function syncPermissions(providers: Provider[], policy: Policy | null, dryRun: boolean): void {
  const allow = policy?.tools?.allow ?? [];
  const deny  = policy?.tools?.deny  ?? [];
  if (allow.length + deny.length === 0) return;

  console.log(`\n${bold("── Permissions ─────────────────────────────────────────────")}`);
  for (const provider of providers) {
    console.log(`\n  ${bold(provider.displayName)}`);
    syncProviderPermissions(provider, allow, deny, dryRun);
    syncProviderHooks(provider, policy, dryRun);
  }
}

function syncInstructionsToProviders(
  providers: Provider[],
  agentsDir: string,
  dryRun: boolean,
): void {
  const source = join(agentsDir, "AGENTS.md");
  if (!existsSync(source)) {
    info("No ~/.agents/AGENTS.md — skipping AGENTS.md instruction sync");
    return;
  }

  console.log(`\n${bold("── AGENTS.md ───────────────────────────────────────────────")}`);

  for (const provider of providers) {
    if (!provider.instructions || !isInstalled(provider.detectCommand)) continue;

    const platformPath = platformStringPath(provider.instructions.path, currentPlatformKey());
    const target = expandHome(platformPath);
    if (!target) continue;

    console.log(`\n  ${bold(provider.displayName)}  ${dim(`(${target})`)}`);

    if (dryRun) {
      info(`[dry-run] Would ${provider.instructions.method} ${source} → ${target}`);
      continue;
    }

    try {
      const action = ensureProviderAgentsMd(source, target, provider.instructions.method, dryRun);
      switch (action) {
        case "linked":
          ok(`linked AGENTS.md`);
          break;
        case "refreshed":
          ok(`refreshed AGENTS.md link`);
          break;
        case "skipped":
          info("unchanged");
          break;
        case "blocked":
          warn(`skipped (existing file — move content to ${source} and remove ${target} to symlink)`);
          break;
      }
    } catch (e) {
      err(`failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

function syncSkillsToProviders(
  providers: Provider[],
  agentsDir: string,
  dryRun: boolean,
  globalOnly = true,
): void {
  console.log(`\n${bold("── Skills ──────────────────────────────────────────────────")}`);
  const skillsSource = join(agentsDir, "skills");

  for (const provider of providers) {
    if (!isInstalled(provider.detectCommand)) continue;
    if (provider.skills.method === "native") {
      info(`${provider.displayName} reads ${skillsSource} natively`);
      continue;
    }
    const platformSkillsPath = platformStringPath(provider.skills.path, currentPlatformKey());
    const skillsTarget = expandHome(platformSkillsPath);

    if (!skillsTarget) continue;
    console.log(`\n  ${bold(provider.displayName)}  ${dim(`(${skillsTarget})`)}`);
    const { linked, skipped, errors } = syncSkills(skillsSource, skillsTarget, dryRun, globalOnly);
    for (const s of linked) ok(`linked skill: ${s}`);
    for (const s of skipped) info(`skipped (exists): ${s}`);
    for (const e of errors) err(e);
  }
}

async function handleSkillUpdate(entry: string, realPath: string, dryRun: boolean): Promise<void> {
  const updateInfo = fetchAndCheckSkill(realPath);
  if (!updateInfo) return;

  const { behind, filesSummary } = updateInfo;
  const commits = behind === 1 ? "1 new commit" : `${behind} new commits`;

  if (dryRun) {
    info(`[dry-run] Skill '${entry}' is ${commits} behind upstream (${filesSummary})`);
    return;
  }

  const doUpdate = await promptBoolean(
    `  Skill '${entry}' has ${commits} upstream (${filesSummary}). Update?`
  );
  if (doUpdate) {
    const succeeded = pullSkill(realPath);
    if (succeeded) ok(`updated skill: ${entry}`);
    else err(`git pull failed for skill: ${entry}`);
  } else {
    info(`skipped: ${entry}`);
  }
}

export async function refreshSkills(agentsDir: string, dryRun: boolean): Promise<void> {
  const skillsDir = join(agentsDir, "skills");
  if (!existsSync(skillsDir)) return;

  const gitSkills = readdirSync(skillsDir).flatMap((entry) => {
    const skillPath = join(skillsDir, entry);
    let realPath: string;
    try {
      realPath = realpathSync(skillPath); // NOSONAR — path comes from readdirSync of a known directory
    } catch {
      realPath = skillPath;
    }
    return isGitRepo(realPath) ? [{ entry, realPath }] : [];
  });
  if (gitSkills.length === 0) return;

  await gitSkills.reduce<Promise<void>>(async (prev, { entry, realPath }) => {
    await prev;
    await handleSkillUpdate(entry, realPath, dryRun);
  }, Promise.resolve());
}

async function promptUnclassifiedResources(agentsDir: string): Promise<void> {
  const unclassifiedServers = getUnclassifiedServers(agentsDir);
  const unclassifiedSkills = getUnclassifiedSkills(agentsDir);

  if (unclassifiedServers.length === 0 && unclassifiedSkills.length === 0) return;

  console.log(`\n${yellow("⚠")}  Unclassified resources found — please classify each:`);

  if (unclassifiedServers.length > 0) {
    const configPath = join(agentsDir, "mcp-config.json");
    const parsed = parseJsonUnknown(readFileSync(configPath, "utf-8"));
    const rawConfig = isRecord(parsed) ? parsed : {};
    await unclassifiedServers.reduce<Promise<void>>(async (prev, name) => {
      await prev;
      const isGlobal = await promptBoolean(`  Server '${name}': sync globally to all providers?`);
      const entry = rawConfig[name];
      if (isRecord(entry)) entry.global = isGlobal;
    }, Promise.resolve());
    writeFileSync(configPath, JSON.stringify(rawConfig, null, 2) + "\n");
  }

  if (unclassifiedSkills.length > 0) {
    const skillsDirPath = join(agentsDir, "skills");
    await unclassifiedSkills.reduce<Promise<void>>(async (prev, skill) => {
      await prev;
      const skillPath = join(skillsDirPath, skill);
      const isGlobal = await promptBoolean(`  Skill '${skill}': sync globally to all providers?`);
      setSkillGlobal(skillPath, isGlobal);
    }, Promise.resolve());
  }
}

type GateIssue = ReturnType<typeof collectGateIssues>["issues"][number];

function printIssueGroup(heading: string, issues: GateIssue[]): void {
  if (issues.length === 0) return;
  console.log(`\n  ${bold(heading)}`);
  for (const issue of issues) {
    const icon = issue.severity === "error" ? red("✗") : yellow("⚠");
    console.log(`  ${icon}  ${bold(issue.name)}  ${dim(issue.code)}  ${dim(issue.detail)}`); // NOSONAR — intentional CLI output of local config scan
  }
}

function pluralCount(n: number, word: string): string {
  if (n <= 0) return "";
  const suffix = n > 1 ? "s" : "";
  return `${n} ${word}${suffix}`;
}

function printGateIssues(gate: ReturnType<typeof collectGateIssues>): void {
  printIssueGroup("Skills",      gate.issues.filter(i => i.source === "skill"));
  printIssueGroup("MCP Servers", gate.issues.filter(i => i.source === "mcp"));

  const errCount  = gate.issues.filter(i => i.severity === "error").length;
  const warnCount = gate.issues.filter(i => i.severity === "warn").length;
  const summary   = [pluralCount(errCount, "error"), pluralCount(warnCount, "warning")]
    .filter(Boolean).join(", ");
  console.log(`\n  ${summary} found.`);
}

async function runSafetyGate(
  agentsDir: string,
  mcpConfig: import("../lib/schemas").McpConfig,
  policy: Policy | null,
  opts: { mcpOnly: boolean; skillsOnly: boolean; ci: boolean },
): Promise<boolean> {
  const gateSkillsDir = opts.mcpOnly ? "" : join(agentsDir, "skills");
  const gateMcpConfig: McpConfig = opts.skillsOnly ? {} : mcpConfig;
  const gate = collectGateIssues(gateSkillsDir, gateMcpConfig, policy);
  if (gate.issues.length === 0) return true;

  console.log(`\n${bold("── Pre-sync Safety Check ────────────────────────────────────")}`);
  printGateIssues(gate);

  if (gate.hasErrors) {
    if (opts.ci) { err("Sync blocked — fix errors or use --force to bypass."); return false; }
    const proceed = await promptBoolean("  Proceed with sync anyway?");
    if (!proceed) { console.log("  Aborted."); return false; }
  } else if (gate.hasWarnings && !opts.ci) {
    const proceed = await promptBoolean("  Proceed with sync?");
    if (!proceed) { console.log("  Aborted."); return false; }
  }
  return true;
}

async function syncSkillPhase(
  providers: Provider[],
  agentsDir: string,
  dryRun: boolean,
  all: boolean,
  noUpdateSkills: boolean,
): Promise<void> {
  if (!noUpdateSkills) {
    console.log(`\n${bold("── Skill Updates ───────────────────────────────────────────")}`);
    await refreshSkills(agentsDir, dryRun);
  }
  syncSkillsToProviders(providers, agentsDir, dryRun, !all);
}

function recordSyncAudit(
  providers: Provider[],
  mcpConfig: import("../lib/schemas").McpConfig,
  dryRun: boolean,
): void {
  try {
    const auditStore = new AuditStore();
    auditStore.init();
    auditStore.recordSync({
      providers: providers.map((p: Provider) => p.id),
      servers: Object.keys(mcpConfig),
      dryRun,
    });
  } catch { /* audit failures are non-fatal */ }
}

async function maybeAutoPull(
  userConfig: AgentConfig,
  agentsDir: string,
  dryRun: boolean,
  skipAutoPull: boolean
): Promise<void> {
  if (dryRun || skipAutoPull) return;
  if (!userConfig.remote?.url || !userConfig.remote?.autoSync) return;

  info("autoSync enabled — pulling remote config...");
  try {
    const policyFetched = await fetchRemotePolicy(userConfig.remote, agentsDir, userConfig.remote.token);
    if (policyFetched) ok("Remote policy pulled");

    const mcpFetched = await fetchRemoteMcpConfig(userConfig.remote, agentsDir, userConfig.remote.token);
    if (mcpFetched) {
      ok("Remote MCP config pulled");
      await mergeRemoteMcp(agentsDir, false);
    }
  } catch (e) {
    warn(`Auto-pull failed: ${e instanceof Error ? e.message : String(e)}`);
    warn("Continuing with local config...");
  }
}

type SyncOpts = {
  dryRun: boolean;
  mcpOnly: boolean;
  skillsOnly: boolean;
  withProxy: boolean;
  all: boolean;
  noUpdateSkills: boolean;
  ci: boolean;
  force: boolean;
  skipAutoPull: boolean;
};

function parseSyncOpts(opts: {
  dryRun?: boolean;
  mcpOnly?: boolean;
  skillsOnly?: boolean;
  withProxy?: boolean;
  all?: boolean;
  updateSkills?: boolean;
  ci?: boolean;
  force?: boolean;
  skipAutoPull?: boolean;
}): SyncOpts {
  return {
    dryRun: opts.dryRun ?? false,
    mcpOnly: opts.mcpOnly ?? false,
    skillsOnly: opts.skillsOnly ?? false,
    withProxy: opts.withProxy ?? false,
    all: opts.all ?? false,
    noUpdateSkills: opts.updateSkills === false,
    ci: opts.ci ?? false,
    force: opts.force ?? false,
    skipAutoPull: opts.skipAutoPull ?? false,
  };
}

async function runSyncCommand(syncOpts: SyncOpts): Promise<void> {
  const agentsDir = AGENTS_DIR;
  const userConfig = loadAgentConfig();
  await maybeAutoPull(userConfig, agentsDir, syncOpts.dryRun, syncOpts.skipAutoPull);

  if (!existsSync(agentsDir)) {
    console.error("Run 'vakt init' first");
    process.exit(1);
  }
  console.log();
  console.log(bold("vakt sync"));
  console.log(dim(`Source: ${agentsDir}`));
  if (syncOpts.dryRun) console.log(yellow("DRY RUN — no changes will be made"));

  const mcpConfig = loadMcpConfig();
  const policy = loadPolicy();
  checkRegistryPolicy(policy, mcpConfig);

  if (!syncOpts.force && !syncOpts.dryRun) {
    const gatePassed = await runSafetyGate(agentsDir, mcpConfig, policy, syncOpts);
    if (!gatePassed) process.exit(1);
  }

  if (!syncOpts.all && !syncOpts.dryRun) {
    await promptUnclassifiedResources(agentsDir);
  }

  const allProviders = loadProviders();
  const enabledProviders = userConfig.providers
    .map((id) => allProviders[id])
    .filter((p): p is Provider => p !== undefined);

  if (!syncOpts.skillsOnly) {
    const configToSync = syncOpts.all ? mcpConfig : filterGlobal(mcpConfig);
    const { resolved, allMissing } = await resolveAll(configToSync, userConfig.paths);
    await syncMcpServers(enabledProviders, resolved, allMissing, syncOpts.withProxy, syncOpts.dryRun);
  }

  if (!syncOpts.mcpOnly) {
    syncInstructionsToProviders(enabledProviders, agentsDir, syncOpts.dryRun);
  }

  syncPermissions(enabledProviders, policy, syncOpts.dryRun);

  if (!syncOpts.mcpOnly) {
    await syncSkillPhase(enabledProviders, agentsDir, syncOpts.dryRun, syncOpts.all, syncOpts.noUpdateSkills);
  }

  recordSyncAudit(enabledProviders, mcpConfig, syncOpts.dryRun);

  console.log();
  console.log(bold("── Summary ─────────────────────────────────────────────────"));
  if (syncOpts.dryRun) console.log(`  ${yellow("Dry run complete — no changes made.")}`);
  else console.log(`  ${green("Sync complete.")}`);
  console.log();
}

export function registerSync(program: Command): void {
  program
    .command("sync")
    .description("Sync MCP servers and skills to all providers")
    .option("--dry-run", "Preview changes without applying")
    .option("--mcp-only", "Sync MCP servers only")
    .option("--skills-only", "Sync skills only")
    .option("--with-proxy", "Route provider configs through vakt proxy for runtime policy + audit (opt-in)")
    .option("--all", "Sync all resources including local-only (default: global only)")
    .option("--no-update-skills", "Skip checking for upstream skill updates")
    .option("--ci", "Non-interactive: gate errors block sync (exit 1), warnings pass")
    .option("--force", "Skip pre-sync safety gate entirely")
    .option("--skip-auto-pull", "Skip automatic remote config pull (when autoSync is enabled)")
    .action(async (opts: {
      dryRun?: boolean;
      mcpOnly?: boolean;
      skillsOnly?: boolean;
      withProxy?: boolean;
      all?: boolean;
      updateSkills?: boolean;
      ci?: boolean;
      force?: boolean;
      skipAutoPull?: boolean;
    }) => {
      await runSyncCommand(parseSyncOpts(opts));
    });
}
