import type { Command } from "commander";
import { existsSync } from "node:fs";
import { AGENTS_DIR } from "../lib/config";
import { loadMergedPolicy, PolicyEngine } from "../lib/policy";
import {
  extractToolMentions,
  formatPlanViolations,
  readPlanFile,
  validatePlanMentions,
} from "../lib/plan-validate";

const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function loadPlanText(file: string | undefined): Promise<string> {
  if (file) {
    try {
      return readPlanFile(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      process.exit(1);
    }
  }
  return readStdin();
}

function reportValidationResults(
  violations: ReturnType<typeof validatePlanMentions>,
  ci: boolean | undefined,
): void {
  const errors = violations.filter(v => v.severity === "error");
  const warnings = violations.filter(v => v.severity === "warning");

  if (violations.length === 0) {
    console.log(green("✓ No policy violations found"));
    process.exit(0);
  }

  console.log(formatPlanViolations(violations));
  console.log();

  const summary: string[] = [];
  if (errors.length > 0) summary.push(red(`${errors.length} error(s)`));
  if (warnings.length > 0) summary.push(yellow(`${warnings.length} warning(s)`));
  console.log(`Validation: ${summary.join(", ")}`);

  if (ci && errors.length > 0) {
    process.exit(1);
  }
}

export function registerPlanValidate(program: Command): void {
  program
    .command("plan-validate")
    .description("Validate tool mentions in a plan file against policy")
    .argument("[file]", "Plan file to validate (defaults to stdin)")
    .option("--server <name>", "Server name for policy context", "default")
    .option("--ci", "Exit with non-zero code on violations")
    .option("--dry-run", "Show plan and violations without prompting")
    .action(async (file: string | undefined, opts: { server?: string; ci?: boolean; dryRun?: boolean }) => {
      if (!existsSync(AGENTS_DIR)) {
        console.error("Run 'vakt init' first");
        process.exit(1);
      }

      const planText = await loadPlanText(file);
      if (!planText.trim()) {
        console.error("No plan content provided");
        process.exit(1);
      }

      console.log(dim("Analyzing plan for policy violations...\n"));

      const mentions = extractToolMentions(planText);
      if (mentions.length === 0) {
        console.log(dim("No tool mentions found in plan."));
        process.exit(0);
      }

      console.log(dim(`Found ${mentions.length} tool mention(s):`));
      mentions.forEach(m => console.log(dim(`  Step ${m.step}: ${m.tool}`)));
      console.log();

      const policy = loadMergedPolicy(AGENTS_DIR);
      const engine = policy ? new PolicyEngine(policy) : null;
      const violations = validatePlanMentions(mentions, engine, opts.server || "default");
      reportValidationResults(violations, opts.ci);
    });
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", chunk => data += chunk);
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}
