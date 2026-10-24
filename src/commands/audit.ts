import { existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import type { Command } from "commander";
import { AGENTS_DIR } from "../lib/config";
import { AuditStore } from "../lib/audit";
import { compressWithRtk } from "../lib/rtk";
import { readSkillMeta, scanSkillHazards } from "../lib/skills";

function parseDuration(s: string): number {
  const m = /^(\d+)(h|d|w)$/.exec(s);
  if (!m) return 24 * 3_600_000;
  const n = Number(m[1]);
  const units: Record<string, number> = { h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return n * (units[m[2]!] ?? 3_600_000);
}

type SkillRow = { name: string; allowedTools: string[] | null; scoped: boolean; hazards: ReturnType<typeof scanSkillHazards> };

function buildSkillRows(skillsDir: string, skills: string[]): SkillRow[] {
  return skills
    .filter(skill => skill === basename(skill) && statSync(join(skillsDir, skill)).isDirectory())
    .map(skill => {
      const skillDir = join(skillsDir, skill);
      const meta = readSkillMeta(skillDir);
      const hazards = scanSkillHazards(skillDir);
      return { name: skill, allowedTools: meta.allowedTools ?? null, scoped: meta.allowedTools !== undefined, hazards };
    });
}

const ansi = {
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
};

const COL = { skill: 26, tools: 26, scoped: 10, hazards: 10 };

function printSkillRow(r: SkillRow): void {
  const name     = r.name.length > COL.skill ? r.name.slice(0, COL.skill - 1) + "…" : r.name;
  const nameCol  = ansi.bold(name).padEnd(COL.skill + 8);
  const toolsStr = r.allowedTools ? r.allowedTools.join(", ") : "—";
  const toolsCol = ansi.dim(toolsStr).padEnd(COL.tools + 4);
  const scopedCol = (r.scoped ? ansi.green("✓") : ansi.yellow("⚠ no")).padEnd(COL.scoped + 9);
  const n        = r.hazards.length;
  const hazCol   = n === 0 ? ansi.green("—") : ansi.red(`${n} finding${n > 1 ? "s" : ""}`);
  console.log(`  ${nameCol} ${toolsCol} ${scopedCol} ${hazCol}`);
  for (const h of r.hazards) {
    console.log(`    ${ansi.dim(`${h.file}:${h.line}`)}  ${ansi.yellow(h.pattern)}`); // NOSONAR — intentional CLI output of local scan results
  }
}

function printSkillsSummary(unscoped: number, withHazards: number): void {
  if (unscoped > 0)    console.log(`  ${ansi.yellow(`⚠ ${unscoped} unscoped skill${unscoped > 1 ? "s" : ""} — add allowed-tools to SKILL.md frontmatter`)}`); // NOSONAR
  if (withHazards > 0) console.log(`  ${ansi.red(`✗ ${withHazards} skill${withHazards > 1 ? "s" : ""} with static hazard findings — review before syncing`)}`); // NOSONAR
  if (unscoped === 0 && withHazards === 0) console.log(`  ${ansi.green("✓ All skills scoped and no static hazards found")}`);
}

function printSkillsTable(rows: SkillRow[]): void {
  console.log(`\n${ansi.bold("── Skills Security Audit ────────────────────────────────────────────────────")}`);
  console.log(`  ${"SKILL".padEnd(COL.skill)} ${"TOOLS".padEnd(COL.tools)} ${"SCOPED".padEnd(COL.scoped)} HAZARDS`);
  console.log(`  ${"─".repeat(COL.skill)} ${"─".repeat(COL.tools)} ${"─".repeat(COL.scoped)} ${"─".repeat(COL.hazards)}`);
  for (const r of rows) printSkillRow(r);
  console.log();
  printSkillsSummary(rows.filter(r => !r.scoped).length, rows.filter(r => r.hazards.length > 0).length);
  console.log();
}

export function registerAudit(program: Command): void {
  const audit = program.command("audit").description("Query the local audit log");

  audit
    .command("show")
    .description("Show recent tool calls")
    .option("--server <name>", "filter by server name")
    .option("--last <window>", "time window: 1h, 24h, 7d, 4w", "24h")
    .option("--limit <n>",    "max rows to show", "50")
    .action((opts) => {
      const store = new AuditStore();
      store.init();
      const rows = store.query({
        serverName: opts.server,
        since: Date.now() - parseDuration(opts.last as string),
        limit: Number(opts.limit),
      });

      if (rows.length === 0) {
        console.log("No tool calls found.");
        return;
      }

      const COL_WIDTH = { time: 12, server: 16, tool: 30, policy: 8 };
      console.log(`\n${"TIME".padEnd(COL_WIDTH.time)} ${"SERVER".padEnd(COL_WIDTH.server)} ${"TOOL".padEnd(COL_WIDTH.tool)} ${"POLICY".padEnd(COL_WIDTH.policy)} DUR`);
      console.log("─".repeat(76));

      for (const r of rows) {
        const time   = new Date(r.started_at as number).toISOString().slice(11, 23);
        const policy = r.policy_result === "deny" ? "✗ deny " : "✓ allow";
        const dur    = (r.duration_ms as number) < 1000
          ? `${r.duration_ms}ms`
          : `${((r.duration_ms as number) / 1000).toFixed(1)}s`;
        console.log(
          `${time.padEnd(COL_WIDTH.time)} ${(r.server_name as string).padEnd(COL_WIDTH.server)} ` +
          `${(r.tool_name as string).padEnd(COL_WIDTH.tool)} ${policy.padEnd(COL_WIDTH.policy)} ${dur}`
        );
      }
    });

  audit
    .command("skills")
    .description("Show security posture of installed skills (allowed-tools, hazards)")
    .option("--json", "Emit JSON array instead of table")
    .action((opts: { json?: boolean }) => {
      const skillsDir = join(AGENTS_DIR, "skills");
      if (!existsSync(skillsDir)) { console.log("No skills directory found."); return; }

      const skills = readdirSync(skillsDir);
      if (skills.length === 0) { console.log("No skills installed."); return; }

      const rows = buildSkillRows(skillsDir, skills);
      if (opts.json) { console.log(JSON.stringify(rows, null, 2)); return; }
      printSkillsTable(rows);
    });

  audit
    .command("export")
    .description("Export audit log as JSON (pipe to SIEM or OTLP collector)")
    .option("--since <iso-date>", "only events after this date")
    .option("--limit <n>", "max rows", "10000")
    .option("--compress-rtk", "compress JSON export with RTK when installed")
    .action(async (opts: { since?: string; limit?: string; compressRtk?: boolean }) => {
      const store = new AuditStore();
      store.init();
      const since = opts.since ? new Date(opts.since).getTime() : 0;
      const rows = store.query({ since, limit: Number(opts.limit) });
      const payload = JSON.stringify(rows, null, 2);
      if (opts.compressRtk) {
        console.log(await compressWithRtk(payload));
        return;
      }
      console.log(payload);
    });
}
