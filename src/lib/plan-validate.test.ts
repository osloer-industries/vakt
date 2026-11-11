import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  extractToolMentions,
  formatPlanViolations,
  hasOutboundNetwork,
  readPlanFile,
  resolvePlanFilePath,
} from "./plan-validate";

describe("extractToolMentions", () => {
  it("extracts tool names from plan text", () => {
    const planText = `
Step 1: Read("file.txt")
Step 2: Edit("content")
Step 3: Bash("npm install")
`;
    const mentions = extractToolMentions(planText);

    expect(mentions.length).toBeGreaterThan(0);
    expect(mentions.some(m => m.tool === "Read")).toBe(true);
    expect(mentions.some(m => m.tool === "Edit")).toBe(true);
    expect(mentions.some(m => m.tool === "Bash")).toBe(true);
  });

  it("handles numbered steps without 'Step' prefix", () => {
    const planText = `
1. Read("file")
2. WebSearch("examples")
3. Write("result")
`;
    const mentions = extractToolMentions(planText);

    expect(mentions.length).toBeGreaterThan(0);
  });

  it("returns empty array for plan with no tools", () => {
    const planText = `
This is just a description
with no tool calls
`;
    const mentions = extractToolMentions(planText);

    expect(mentions.length).toBe(0);
  });

  it("handles tools with arguments", () => {
    const planText = `
Step 1: Read("file.txt")
Step 2: Bash("npm test")
`;
    const mentions = extractToolMentions(planText);

    expect(mentions.length).toBe(2);
    expect(mentions[0]?.args).toBeDefined();
    expect(mentions[1]?.args).toBeDefined();
  });

  it("is case insensitive for tool names", () => {
    const planText = `
step 1: read("file")
step 2: edit("content")
step 3: bash("command")
`;
    const mentions = extractToolMentions(planText);

    expect(mentions.length).toBeGreaterThan(0);
  });
});

describe("hasOutboundNetwork", () => {
  it("detects curl in args", () => {
    expect(hasOutboundNetwork("curl https://example.com")).toBe(true);
    expect(hasOutboundNetwork("CURL https://example.com")).toBe(true);
  });

  it("detects wget in args", () => {
    expect(hasOutboundNetwork("wget https://example.com")).toBe(true);
    expect(hasOutboundNetwork("WGET https://example.com")).toBe(true);
  });

  it("detects fetch in args", () => {
    expect(hasOutboundNetwork("fetch https://example.com")).toBe(true);
    expect(hasOutboundNetwork("FETCH https://example.com")).toBe(true);
  });

  it("returns false for local commands", () => {
    expect(hasOutboundNetwork("npm install")).toBe(false);
    expect(hasOutboundNetwork("node script.js")).toBe(false);
    expect(hasOutboundNetwork("echo hello")).toBe(false);
  });

  it("returns false for empty args", () => {
    expect(hasOutboundNetwork("")).toBe(false);
    expect(hasOutboundNetwork(undefined)).toBe(false);
  });
});

describe("formatPlanViolations", () => {
  it("formats error violations", () => {
    const violations = [
      {
        step: 1,
        tool: "WebSearch",
        rule: "policy",
        severity: "error" as const,
        suggestion: "Use allowed alternative",
      },
    ];

    const output = formatPlanViolations(violations);
    expect(output).toContain("Step 1");
    expect(output).toContain("WebSearch");
    expect(output).toContain("denied");
    expect(output).toContain("Use allowed alternative");
  });

  it("formats warning violations", () => {
    const violations = [
      {
        step: 2,
        tool: "Bash",
        rule: "outbound-network",
        severity: "warning" as const,
        suggestion: "Use WebFetch instead",
      },
    ];

    const output = formatPlanViolations(violations);
    expect(output).toContain("Step 2");
    expect(output).toContain("Bash");
    expect(output).toContain("warning");
    expect(output).toContain("Use WebFetch instead");
  });

  it("formats multiple violations", () => {
    const violations = [
      {
        step: 1,
        tool: "WebSearch",
        rule: "policy",
        severity: "error" as const,
      },
      {
        step: 3,
        tool: "Bash",
        rule: "outbound-network",
        severity: "warning" as const,
      },
    ];

    const output = formatPlanViolations(violations);
    expect(output).toContain("Step 1");
    expect(output).toContain("Step 3");
  });
});

describe("resolvePlanFilePath", () => {
  it("rejects paths outside the working directory", () => {
    expect(() => resolvePlanFilePath("/etc/passwd", "/tmp/workspace")).toThrow(
      /under the current working directory/,
    );
  });

  it("reads plan files under the working directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "vakt-plan-"));
    try {
      const planPath = join(dir, "plan.md");
      writeFileSync(planPath, "Step 1: Read(\"x\")", "utf-8");
      const text = readPlanFile("plan.md", dir);
      expect(text).toContain("Read");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
