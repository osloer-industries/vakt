import type { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadAgentConfig } from "../lib/config";
import {
  fetchRemotePolicy,
  fetchRemoteMcpConfig,
  fetchRemoteSkillsManifest,
  mergeRemoteMcp,
} from "../lib/remote";

const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const ok     = (s: string) => console.log(`  ${green("✓")}  ${s}`);
const warn   = (s: string) => console.log(`  ${yellow("⚠")}  ${s}`);
const info   = (s: string) => console.log(`  ${cyan("→")}  ${s}`);

type RemoteCfg = NonNullable<ReturnType<typeof loadAgentConfig>["remote"]>;
type PullWhat = "policy" | "mcp" | "skills" | "all";
type PullResult = { fetched: string[]; errors: string[] };

function resolvePullWhat(opts: { policyOnly?: boolean; mcpOnly?: boolean; skillsOnly?: boolean }): PullWhat {
  if (opts.policyOnly) return "policy";
  if (opts.mcpOnly) return "mcp";
  if (opts.skillsOnly) return "skills";
  return "all";
}

async function fetchPolicyArtifact(remoteCfg: RemoteCfg, agentsDir: string, dryRun: boolean, result: PullResult): Promise<void> {
  const out = await fetchRemotePolicy(remoteCfg, agentsDir, remoteCfg.token);
  if (out) {
    result.fetched.push("policy");
    if (dryRun) info("[dry-run] would fetch policy.json");
    else ok("policy.json fetched → policy.remote.json");
  } else {
    result.errors.push("policy.json");
    warn("could not fetch policy.json");
  }
}

async function fetchMcpArtifact(remoteCfg: RemoteCfg, agentsDir: string, dryRun: boolean, result: PullResult): Promise<void> {
  if (dryRun) { info("[dry-run] would fetch mcp-config.json"); return; }
  const out = await fetchRemoteMcpConfig(remoteCfg, agentsDir, remoteCfg.token);
  if (!out) { result.errors.push("mcp-config.json"); warn("could not fetch mcp-config.json"); return; }
  result.fetched.push("mcp-config");
  ok("mcp-config.json fetched → mcp-config.remote.json");
  const changes = await mergeRemoteMcp(agentsDir, false);
  for (const [name, status] of Object.entries(changes)) {
    if (status !== "unchanged") info(`server ${status}: ${name}`);
  }
}

async function fetchSkillsArtifact(remoteCfg: RemoteCfg, agentsDir: string, dryRun: boolean, result: PullResult): Promise<void> {
  if (dryRun) { info("[dry-run] would fetch skills/index.json"); return; }
  const out = await fetchRemoteSkillsManifest(remoteCfg, agentsDir, remoteCfg.token);
  if (out) { result.fetched.push("skills/index"); ok("skills/index.json fetched → skills/remote-index.json"); }
  // Skills manifest is optional — not an error if missing
}

type PullOpts = { dryRun?: boolean; policyOnly?: boolean; mcpOnly?: boolean; skillsOnly?: boolean };

function loadPullRemoteConfig(): RemoteCfg {
  const cfg = loadAgentConfig();
  if (!cfg.remote?.url) {
    console.error("No remote.url configured.");
    console.error("Set it with: vakt config set remote.url https://github.com/org/agent-config");
    process.exit(1);
  }
  return cfg.remote;
}

function ensureAgentsDirForPull(): string {
  const agentsDir = process.env["AGENTS_DIR"] ?? join(process.env["HOME"] ?? "~", ".agents");
  if (!existsSync(agentsDir)) {
    console.error(`Error: ~/.agents/ not initialized. Run 'vakt init' first.`);
    process.exit(1);
  }
  return agentsDir;
}

function finishPull(result: PullResult, dryRun: boolean): void {
  console.log("");
  if (result.errors.length === 0 || result.fetched.length > 0) {
    ok("Pull complete");
    if (!dryRun) info("Run 'vakt sync' to apply updated config to all providers");
  } else {
    warn("Pull failed — check remote.url in config.json");
    process.exit(1);
  }
  console.log("");
}

async function runPullCommand(opts: PullOpts): Promise<void> {
  const agentsDir = ensureAgentsDirForPull();
  let remoteCfg: RemoteCfg;
  try {
    remoteCfg = loadPullRemoteConfig();
  } catch (e) {
    console.error(`Error loading config: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  const dryRun = opts.dryRun ?? false;
  const what = resolvePullWhat(opts);
  const result: PullResult = { fetched: [], errors: [] };

  console.log("");
  console.log(bold("vakt pull"));
  if (dryRun) console.log(yellow("DRY RUN — no changes will be made"));
  console.log("");

  if (what === "all" || what === "policy") await fetchPolicyArtifact(remoteCfg, agentsDir, dryRun, result);
  if (what === "all" || what === "mcp") await fetchMcpArtifact(remoteCfg, agentsDir, dryRun, result);
  if (what === "all" || what === "skills") await fetchSkillsArtifact(remoteCfg, agentsDir, dryRun, result);

  finishPull(result, dryRun);
}

export function registerPull(program: Command): void {
  program
    .command("pull")
    .description("Fetch remote config, policy, and skills manifest")
    .option("--dry-run", "preview without writing files")
    .option("--policy-only", "only fetch policy.json")
    .option("--mcp-only", "only fetch mcp-config.json")
    .option("--skills-only", "only fetch skills/index.json")
    .action(async (opts: PullOpts) => {
      await runPullCommand(opts);
    });
}
