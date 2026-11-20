import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { filterGlobal, getUnclassifiedServers, getUnclassifiedSkills, refreshSkills } from "./sync";
import type { McpConfig } from "../lib/schemas";

describe("filterGlobal", () => {
  test("keeps servers with global: true", () => {
    const cfg: McpConfig = {
      "global-srv": { command: "npx", global: true },
      "local-srv": { command: "npx", global: false },
    };
    const result = filterGlobal(cfg);
    expect("global-srv" in result).toBe(true);
    expect("local-srv" in result).toBe(false);
  });

  test("removes servers with global: false", () => {
    const cfg: McpConfig = {
      "srv-a": { command: "npx", global: false },
      "srv-b": { command: "node", global: false },
    };
    const result = filterGlobal(cfg);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test("removes servers whose global defaults to false (no explicit field parsed by zod)", () => {
    // When zod parses a server without a global field, it defaults to false
    const cfg: McpConfig = {
      "no-global": { command: "npx", global: false },
      "explicit-global": { command: "npx", global: true },
    };
    const result = filterGlobal(cfg);
    expect("no-global" in result).toBe(false);
    expect("explicit-global" in result).toBe(true);
  });

  test("returns empty object when all servers are local", () => {
    const cfg: McpConfig = {
      "a": { command: "a", global: false },
      "b": { command: "b", global: false },
    };
    expect(Object.keys(filterGlobal(cfg))).toHaveLength(0);
  });

  test("returns all servers when all are global", () => {
    const cfg: McpConfig = {
      "a": { command: "a", global: true },
      "b": { command: "b", global: true },
    };
    const result = filterGlobal(cfg);
    expect(Object.keys(result)).toHaveLength(2);
  });

  test("works with HTTP servers", () => {
    const cfg: McpConfig = {
      "http-global": { transport: "http", url: "https://example.com/mcp", global: true },
      "http-local": { transport: "http", url: "https://example.com/mcp", global: false },
    };
    const result = filterGlobal(cfg);
    expect("http-global" in result).toBe(true);
    expect("http-local" in result).toBe(false);
  });
});

describe("getUnclassifiedServers", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync("/tmp/vakt-sync-test-"); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  test("returns empty array when no mcp-config.json", () => {
    expect(getUnclassifiedServers(tmp)).toEqual([]);
  });

  test("returns servers with no global field", () => {
    writeFileSync(join(tmp, "mcp-config.json"), JSON.stringify({
      "classified": { command: "npx", global: true },
      "unclassified": { command: "npx" },
    }));
    expect(getUnclassifiedServers(tmp)).toEqual(["unclassified"]);
  });

  test("returns multiple unclassified servers", () => {
    writeFileSync(join(tmp, "mcp-config.json"), JSON.stringify({
      "a": { command: "npx" },
      "b": { command: "node", global: false },
      "c": { command: "npx" },
    }));
    const result = getUnclassifiedServers(tmp);
    expect(result).toContain("a");
    expect(result).toContain("c");
    expect(result).not.toContain("b");
  });

  test("ignores _* meta keys", () => {
    writeFileSync(join(tmp, "mcp-config.json"), JSON.stringify({
      "_note": "a comment",
      "server": { command: "npx", global: false },
    }));
    expect(getUnclassifiedServers(tmp)).toEqual([]);
  });

  test("returns empty array when all servers have global field", () => {
    writeFileSync(join(tmp, "mcp-config.json"), JSON.stringify({
      "a": { command: "npx", global: true },
      "b": { command: "node", global: false },
    }));
    expect(getUnclassifiedServers(tmp)).toEqual([]);
  });

  test("returns empty array on malformed JSON", () => {
    writeFileSync(join(tmp, "mcp-config.json"), "not json");
    expect(getUnclassifiedServers(tmp)).toEqual([]);
  });
});

describe("refreshSkills", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync("/tmp/vakt-refresh-test-"); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  test("returns early (no throw) when skills dir does not exist", async () => {
    await expect(refreshSkills(tmp, false)).resolves.toBeUndefined();
    expect(existsSync(join(tmp, "skills"))).toBe(false);
  });

  test("returns early (no throw) in dry-run when skills dir does not exist", async () => {
    await expect(refreshSkills(tmp, true)).resolves.toBeUndefined();
    expect(existsSync(join(tmp, "skills"))).toBe(false);
  });

  test("completes without error when skills dir exists but is empty", async () => {
    mkdirSync(join(tmp, "skills"), { recursive: true });
    await expect(refreshSkills(tmp, true)).resolves.toBeUndefined();
    expect(readdirSync(join(tmp, "skills"))).toEqual([]);
  });

  test("completes without error when skills dir has a non-git directory", async () => {
    const skillDir = join(tmp, "skills", "my-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: my-skill\nglobal: true\n---\n");
    await expect(refreshSkills(tmp, true)).resolves.toBeUndefined();
    expect(existsSync(join(skillDir, "SKILL.md"))).toBe(true);
  });
});

describe("getUnclassifiedSkills", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync("/tmp/vakt-skills-test-"); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  test("returns empty array when no skills dir", () => {
    expect(getUnclassifiedSkills(tmp)).toEqual([]);
  });

  test("returns skills with no global field in SKILL.md", () => {
    const skillsDir = join(tmp, "skills");
    mkdirSync(join(skillsDir, "unclassified"), { recursive: true });
    writeFileSync(join(skillsDir, "unclassified", "SKILL.md"), "---\nname: unclassified\n---\n");
    mkdirSync(join(skillsDir, "classified"), { recursive: true });
    writeFileSync(join(skillsDir, "classified", "SKILL.md"), "---\nname: classified\nglobal: true\n---\n");
    const result = getUnclassifiedSkills(tmp);
    expect(result).toContain("unclassified");
    expect(result).not.toContain("classified");
  });

  test("returns empty array when all skills are classified", () => {
    const skillsDir = join(tmp, "skills");
    mkdirSync(join(skillsDir, "s1"), { recursive: true });
    writeFileSync(join(skillsDir, "s1", "SKILL.md"), "---\nname: s1\nglobal: true\n---\n");
    mkdirSync(join(skillsDir, "s2"), { recursive: true });
    writeFileSync(join(skillsDir, "s2", "SKILL.md"), "---\nname: s2\nglobal: false\n---\n");
    expect(getUnclassifiedSkills(tmp)).toEqual([]);
  });

  test("treats skill with no SKILL.md as unclassified", () => {
    const skillsDir = join(tmp, "skills");
    mkdirSync(join(skillsDir, "no-skill-md"), { recursive: true });
    const result = getUnclassifiedSkills(tmp);
    expect(result).toContain("no-skill-md");
  });
});
