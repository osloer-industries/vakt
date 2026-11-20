import { describe, test, expect } from "bun:test";
import { expectDefined } from "./test-assert";
import { McpConfigSchema, ToolPermissionSchema, PolicySchema, KNOWN_TOOLS } from "./schemas";

describe("McpConfigSchema global field", () => {
  test("stdio server accepts global: true", () => {
    const result = McpConfigSchema.parse({
      "my-server": { command: "npx", args: ["-y", "some-mcp"], global: true },
    });
    expect(expectDefined(result["my-server"], "my-server").global).toBe(true);
  });

  test("stdio server defaults global to false", () => {
    const result = McpConfigSchema.parse({
      "my-server": { command: "npx" },
    });
    expect(expectDefined(result["my-server"], "my-server").global).toBe(false);
  });

  test("http server accepts global: true", () => {
    const result = McpConfigSchema.parse({
      "my-server": { transport: "http", url: "https://example.com/mcp", global: true },
    });
    expect(expectDefined(result["my-server"], "my-server").global).toBe(true);
  });

  test("_note key is stripped from config", () => {
    const raw = {
      "_note": "this is a comment",
      "github": { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
    };
    const result = McpConfigSchema.parse(raw);
    expect("_note" in result).toBe(false);
    expect("github" in result).toBe(true);
  });
});

// ── ToolPermissionSchema ──────────────────────────────────────────────────────

describe("ToolPermissionSchema", () => {
  test("parses bare tool name", () => {
    expect(ToolPermissionSchema.parse("Bash")).toEqual({ tool: "Bash" });
  });

  test("parses tool name with specifier", () => {
    expect(ToolPermissionSchema.parse("Bash(git *)")).toEqual({ tool: "Bash", specifier: "git *" });
  });

  test("parses WebFetch domain specifier", () => {
    expect(ToolPermissionSchema.parse("WebFetch(domain:github.com)"))
      .toEqual({ tool: "WebFetch", specifier: "domain:github.com" });
  });

  test("parses Read path specifier", () => {
    expect(ToolPermissionSchema.parse("Read(~/.env)")).toEqual({ tool: "Read", specifier: "~/.env" });
  });

  test("passes unknown tool names through (new Claude Code releases)", () => {
    expect(ToolPermissionSchema.parse("FutureTool")).toEqual({ tool: "FutureTool" });
    expect(ToolPermissionSchema.parse("FutureTool(some-pattern)"))
      .toEqual({ tool: "FutureTool", specifier: "some-pattern" });
  });

  test("rejects lowercase tool name", () => {
    expect(() => ToolPermissionSchema.parse("bash")).toThrow();
  });

  test("rejects tool name with space instead of parens", () => {
    expect(() => ToolPermissionSchema.parse("Bash git *")).toThrow();
  });

  test("rejects mcp__ prefixed entries", () => {
    expect(() => ToolPermissionSchema.parse("mcp__my-server")).toThrow();
    expect(() => ToolPermissionSchema.parse("mcp__server__tool")).toThrow();
  });

  test("rejects empty string", () => {
    expect(() => ToolPermissionSchema.parse("")).toThrow();
  });

  test("KNOWN_TOOLS contains only entries parseable by ToolPermissionSchema", () => {
    for (const tool of KNOWN_TOOLS) {
      expect(() => ToolPermissionSchema.parse(tool)).not.toThrow();
    }
  });
});

// ── PolicySchema.tools ────────────────────────────────────────────────────────

describe("PolicySchema tools field", () => {
  const base = { version: "1", default: "allow" } as const;

  test("accepts policy with tools.allow and tools.deny", () => {
    const policy = PolicySchema.parse({
      ...base,
      tools: {
        allow: ["Read", "Bash(git *)"],
        deny: ["WebSearch"],
      },
    });
    expect(policy.tools?.allow).toEqual([
      { tool: "Read" },
      { tool: "Bash", specifier: "git *" },
    ]);
    expect(policy.tools?.deny).toEqual([{ tool: "WebSearch" }]);
  });

  test("accepts policy without tools field", () => {
    const policy = PolicySchema.parse(base);
    expect(policy.tools).toBeUndefined();
  });

  test("rejects mcp__ entries in policy.tools", () => {
    expect(() =>
      PolicySchema.parse({
        ...base,
        tools: { deny: ["mcp__some-server"] },
      }),
    ).toThrow();
  });

  test("argument-pattern grants pass through to allow array", () => {
    const policy = PolicySchema.parse({
      ...base,
      tools: { allow: ["Bash(npm run *)", "WebFetch(domain:npmjs.com)"] },
    });
    expect(expectDefined(policy.tools?.allow?.[0], "allow[0]")).toEqual({ tool: "Bash", specifier: "npm run *" });
    expect(expectDefined(policy.tools?.allow?.[1], "allow[1]")).toEqual({ tool: "WebFetch", specifier: "domain:npmjs.com" });
  });
});