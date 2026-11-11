import { isAbsolute, relative, resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { PolicyEngine } from "./policy";
import { KNOWN_TOOLS } from "./schemas";

export interface ToolMention {
  step: number;
  tool: string;
  args?: string;
}

export interface PlanViolation {
  step: number;
  tool: string;
  rule: string;
  suggestion?: string;
  severity: "error" | "warning";
}

const TOOL_PATTERNS = KNOWN_TOOLS.map(t => ({
  name: t,
  regex: new RegExp(`\\b${t}\\s*\\(`, "i"),
}));

const OUTBOUND_NETWORK_PATTERNS = [
  /curl\s+/i,
  /wget\s+/i,
  /fetch\s+/i,
];

/** Resolve a user-supplied plan path under the current working directory. */
export function resolvePlanFilePath(file: string, cwd = process.cwd()): string {
  const absPath = resolve(cwd, file);
  const rel = relative(cwd, absPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Plan file path must be under the current working directory");
  }
  return absPath;
}

export function readPlanFile(file: string, cwd = process.cwd()): string {
  const absPath = resolvePlanFilePath(file, cwd);
  return readFileSync(absPath, "utf-8");
}

export function extractToolMentions(planText: string): ToolMention[] {
  const mentions: ToolMention[] = [];
  const lines = planText.split("\n");

  let stepNum = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (typeof line !== "string") continue;

    const stepMatch = /^(?:Step\s+)?(\d+)[:.)\s]/i.exec(line);
    if (stepMatch) {
      stepNum = Number.parseInt(stepMatch[1] ?? "0", 10);
    }

    for (const { name, regex } of TOOL_PATTERNS) {
      if (regex.test(line)) {
        const argsMatch = /\(([^)]*)\)/.exec(line);
        mentions.push({
          step: stepNum || i + 1,
          tool: name,
          args: argsMatch?.[1],
        });
      }
    }
  }

  return mentions;
}

export function hasOutboundNetwork(args: string | undefined): boolean {
  if (!args) return false;
  return OUTBOUND_NETWORK_PATTERNS.some(p => p.test(args));
}

export function validatePlanMentions(
  mentions: ToolMention[],
  engine: PolicyEngine | null,
  serverName: string,
): PlanViolation[] {
  const violations: PlanViolation[] = [];

  for (const mention of mentions) {
    if (!engine) {
      if (mention.tool === "Bash" && mention.args && hasOutboundNetwork(mention.args)) {
        violations.push({
          step: mention.step,
          tool: mention.tool,
          rule: "outbound-network",
          suggestion: "Outbound HTTP in Bash is unaudited — use WebFetch or WebSearch instead",
          severity: "warning",
        });
      }
      continue;
    }

    const result = engine.checkTool(serverName, mention.tool);
    if (result.result === "deny") {
      violations.push({
        step: mention.step,
        tool: mention.tool,
        rule: result.matchedRule ?? "policy",
        suggestion: "Tool is denied by policy — use an allowed alternative",
        severity: "error",
      });
    }

    if (mention.tool === "Bash" && mention.args && hasOutboundNetwork(mention.args)) {
      violations.push({
        step: mention.step,
        tool: mention.tool,
        rule: "outbound-network",
        suggestion: "Outbound HTTP in Bash is unaudited — use WebFetch or WebSearch instead",
        severity: "warning",
      });
    }
  }

  return violations;
}

export function formatPlanViolations(violations: PlanViolation[]): string {
  const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
  const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

  return violations.map(v => {
    const icon = v.severity === "error" ? red("✗") : yellow("⚠");
    const lines = [
      `Step ${v.step}: ${v.tool}`,
      `  ${icon}  ${v.tool} — ${v.severity === "error" ? "denied" : "warning"} by ${v.rule}`,
    ];
    if (v.suggestion) {
      lines.push(`     Suggestion: ${v.suggestion}`);
    }
    return lines.join("\n");
  }).join("\n\n");
}
