import { describe, it, test, expect, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  resolveServer,
  resolveAll,
  formatForProvider,
  writeJsonConfig,
  readTomlConfig,
  toToml,
  syncSkills,
  writeTomlConfig,
  toTomlArrayOfTables,
  isResolvedStdioServer,
  isResolvedHttpServer,
} from "./resolver";
import { loadProviders } from "./config";
import { secretsSet } from "./secrets";
import type { McpConfig, McpServer, Provider } from "./schemas";
import { expectDefined, expectEnv } from "./test-assert";
import { isRecord, readString } from "./type-guards";

// setup.ts sets AGENTS_SECRETS_BACKEND=env and AGENTS_DIR to a sandbox
const AGENTS = expectEnv("AGENTS_DIR");

beforeEach(() => {
  mkdirSync(AGENTS, { recursive: true });
});

describe("resolveServer — missing secrets", () => {
  it("preserves raw secret ref in env when secret is not set", async () => {
    const { server: resolved, missing } = await resolveServer(
      "test",
      { command: "npx", args: ["-y", "some-server"], env: { TOKEN: "secret:MISSING_TOKEN_XYZ" }, global: false },
      {},
    );
    expect(isResolvedStdioServer(resolved) ? resolved.env?.["TOKEN"] : undefined).toBe("secret:MISSING_TOKEN_XYZ");
    expect(missing).toContain("MISSING_TOKEN_XYZ");
  });

  it("does not write empty string for a missing secret", async () => {
    const { server: resolved } = await resolveServer(
      "test",
      { command: "npx", env: { KEY: "secret:ALSO_MISSING_XYZ" }, global: false },
      {},
    );
    expect(isResolvedStdioServer(resolved) ? resolved.env?.["KEY"] : "").not.toBe("");
  });

  it("resolves env value when secret exists", async () => {
    await secretsSet("RESOLVER_TEST_TOKEN", "real-value");
    const { server: resolved, missing } = await resolveServer(
      "test",
      { command: "npx", env: { TOKEN: "secret:RESOLVER_TEST_TOKEN" }, global: false },
      {},
    );
    expect(isResolvedStdioServer(resolved) ? resolved.env?.["TOKEN"] : undefined).toBe("real-value");
    expect(missing).toHaveLength(0);
  });

  it("handles multiple env vars — resolves present, preserves ref for missing", async () => {
    await secretsSet("RESOLVER_PRESENT_KEY", "present-value");
    const { server: resolved, missing } = await resolveServer(
      "test",
      {
        command: "npx",
        env: {
          PRESENT: "secret:RESOLVER_PRESENT_KEY",
          ABSENT: "secret:RESOLVER_ABSENT_KEY",
        },
        global: false,
      },
      {},
    );
    expect(isResolvedStdioServer(resolved) ? resolved.env?.["PRESENT"] : undefined).toBe("present-value");
    expect(isResolvedStdioServer(resolved) ? resolved.env?.["ABSENT"] : undefined).toBe("secret:RESOLVER_ABSENT_KEY");
    expect(missing).toContain("RESOLVER_ABSENT_KEY");
    expect(missing).not.toContain("RESOLVER_PRESENT_KEY");
  });
});

describe("writeJsonConfig — output format", () => {
  it("writes JSON with a trailing newline", async () => {
    const filePath = join(AGENTS, "test-output.json");
    await writeJsonConfig(filePath, "mcpServers", { foo: { command: "bar" } }, false);
    const content = readFileSync(filePath, "utf-8");
    expect(content.endsWith("\n")).toBe(true);
  });

  it("merges into existing file without clobbering other keys", async () => {
    const filePath = join(AGENTS, "test-merge.json");
    await writeJsonConfig(filePath, "mcpServers", { first: { command: "a" } }, false);
    // Now write a second key — first key must survive
    const existing = JSON.parse(readFileSync(filePath, "utf-8"));
    existing["otherKey"] = { some: "data" };
    await Bun.write(filePath, JSON.stringify(existing, null, 2));
    await writeJsonConfig(filePath, "mcpServers", { second: { command: "b" } }, false);
    const result = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(result["otherKey"]).toEqual({ some: "data" });
    expect(result["mcpServers"]["second"]).toBeDefined();
  });

  it("dry-run does not write the file", async () => {
    const filePath = join(AGENTS, "should-not-exist.json");
    await writeJsonConfig(filePath, "mcpServers", { foo: { command: "bar" } }, true);
    expect(() => readFileSync(filePath)).toThrow();
  });
});

describe("toTomlArrayOfTables", () => {
  it("emits [[key]] header for each server", () => {
    const result = toTomlArrayOfTables("mcp_servers", {
      github: { transport: "stdio", command: "npx" },
    });
    expect(result).toContain("[[mcp_servers]]");
    expect(result).toContain('name = "github"');
    expect(result).toContain('transport = "stdio"');
    expect(result).toContain('command = "npx"');
  });

  it("emits one block per server separated by a blank line", () => {
    const result = toTomlArrayOfTables("mcp_servers", {
      a: { command: "cmd-a" },
      b: { command: "cmd-b" },
    });
    const blocks = result.split("[[mcp_servers]]").filter(Boolean);
    expect(blocks).toHaveLength(2);
    expect(result).toContain('name = "a"');
    expect(result).toContain('name = "b"');
  });

  it("serialises array args as inline JSON", () => {
    const result = toTomlArrayOfTables("mcp_servers", {
      s: { args: ["-y", "pkg"] },
    });
    expect(result).toContain('args = ["-y","pkg"]');
  });

  it("serialises env/headers objects as valid TOML inline tables, not JSON", () => {
    const result = toTomlArrayOfTables("mcp_servers", {
      github: {
        transport: "stdio",
        command: "npx",
        env: { GITHUB_TOKEN: "ghp_test", NODE_ENV: "production" },
      },
    });
    // Must use TOML inline-table syntax (= not :)
    expect(result).toContain('env = { GITHUB_TOKEN = "ghp_test", NODE_ENV = "production" }');
    // Must NOT contain JSON object syntax
    expect(result).not.toContain('{"GITHUB_TOKEN"');
  });
});

describe("writeTomlConfig — array format", () => {
  it("writes array-of-tables format for vibe-style providers", async () => {
    const filePath = join(AGENTS, "vibe-config.toml");
    await writeTomlConfig(
      filePath,
      "mcp_servers",
      { github: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] } },
      "array",
      false,
    );
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("[[mcp_servers]]");
    expect(content).toContain('name = "github"');
    expect(content).toContain('transport = "stdio"');
  });

  it("preserves non-server keys when writing array format", async () => {
    const filePath = join(AGENTS, "vibe-existing.toml");
    writeFileSync(filePath, 'model = "mistral-large"\n');
    await writeTomlConfig(
      filePath,
      "mcp_servers",
      { s: { transport: "stdio", command: "npx" } },
      "array",
      false,
    );
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('model = "mistral-large"');
    expect(content).toContain("[[mcp_servers]]");
  });

  it("dry-run does not write the file", async () => {
    const filePath = join(AGENTS, "vibe-dryrun.toml");
    await writeTomlConfig(filePath, "mcp_servers", { s: { command: "npx" } }, "array", true);
    expect(existsSync(filePath)).toBe(false);
  });

  it("falls back to record format when serversFormat is record", async () => {
    const filePath = join(AGENTS, "codex-style.toml");
    await writeTomlConfig(
      filePath,
      "mcp_servers",
      { myserver: { command: "npx" } },
      "record",
      false,
    );
    const content = readFileSync(filePath, "utf-8");
    // Record format uses [mcp_servers] section, not [[mcp_servers]]
    expect(content).not.toContain("[[mcp_servers]]");
  });
});


// Helper — provider fixture based on the real cursor entry
function makeProvider(structureOverrides: Partial<Provider["configStructure"]> = {}): Provider {
  const base = expectDefined(loadProviders()["cursor"], "cursor provider");
  return {
    ...base,
    displayName: "Test Provider",
    configStructure: {
      ...base.configStructure,
      ...structureOverrides,
      stdioPropertyMapping: {
        ...base.configStructure.stdioPropertyMapping,
        ...structureOverrides.stdioPropertyMapping,
      },
      httpPropertyMapping: {
        ...base.configStructure.httpPropertyMapping,
        ...structureOverrides.httpPropertyMapping,
      },
    },
  };
}

describe("resolveServer — HTTP", () => {
  it("resolves a plain HTTP URL", async () => {
    const { server, missing } = await resolveServer("api", {
      transport: "http",
      url: "https://api.example.com/mcp",
      global: false,
    }, {});
    expect(isResolvedHttpServer(server) ? server.url : undefined).toBe("https://api.example.com/mcp");
    expect(isResolvedHttpServer(server) ? server.transport : undefined).toBe("http");
    expect(missing).toHaveLength(0);
  });

  it("resolves HTTP server headers containing a secret ref", async () => {
    await secretsSet("API_KEY", "tok-123");
    const { server } = await resolveServer("api", {
      transport: "http",
      url: "https://api.example.com/mcp",
      headers: { Authorization: "Bearer secret:API_KEY" },
      global: false,
    }, {});
    expect(isResolvedHttpServer(server) ? server.headers?.["Authorization"] : undefined).toBe("Bearer tok-123");
  });
});

describe("resolveAll", () => {
  it("resolves multiple servers and collects missing secrets", async () => {
    const config: McpConfig = {
      ok: { command: "npx", args: ["-y", "mcp-ok"], global: false },
      broken: { command: "npx", env: { TOKEN: "secret:MISSING_TOKEN_XYZ" }, global: false },
    };
    const { resolved, allMissing } = await resolveAll(config, {});
    const ok = expectDefined(resolved["ok"], "resolved ok");
    expect(isResolvedStdioServer(ok) ? ok.command : undefined).toBe("npx");
    expect(allMissing["broken"]).toContain("MISSING_TOKEN_XYZ");
    expect(allMissing["ok"]).toBeUndefined();
  });
});

describe("formatForProvider", () => {
  it("maps stdio server command and args", () => {
    const result = formatForProvider(
      { myserver: { command: "npx", args: ["-y", "mcp-test"] } },
      makeProvider(),
    );
    expect(result["myserver"]?.["command"]).toBe("npx");
    expect(result["myserver"]?.["args"]).toEqual(["-y", "mcp-test"]);
  });

  it("maps HTTP server to urlProperty", () => {
    const result = formatForProvider(
      { api: { transport: "http", url: "https://example.com/mcp", global: false } },
      makeProvider(),
    );
    expect(result["api"]?.["url"]).toBe("https://example.com/mcp");
  });

  it("merges command+args into one array when commandProperty === argsProperty", () => {
    const result = formatForProvider(
      { s: { command: "npx", args: ["-y", "pkg"] } },
      makeProvider({ stdioPropertyMapping: { commandProperty: "cmd", argsProperty: "cmd" } }),
    );
    expect(result["s"]?.["cmd"]).toEqual(["npx", "-y", "pkg"]);
  });

  it("includes typeProperty when configured", () => {
    const result = formatForProvider(
      { s: { command: "npx" } },
      makeProvider({
        stdioPropertyMapping: {
          commandProperty: "command",
          argsProperty: "args",
          typeProperty: "type",
          typeValue: "stdio",
        },
      }),
    );
    expect(result["s"]?.["type"]).toBe("stdio");
  });

  it("includes env when envProperty is configured", () => {
    const result = formatForProvider(
      { s: { command: "npx", env: { TOKEN: "abc" } } },
      makeProvider(),
    );
    expect(result["s"]?.["env"]).toEqual({ TOKEN: "abc" });
  });
});

describe("readTomlConfig", () => {
  it("returns empty object when file is missing", () => {
    expect(readTomlConfig("/nonexistent/path.toml")).toEqual({});
  });

  it("parses a valid TOML file", () => {
    mkdirSync(AGENTS, { recursive: true });
    const path = join(AGENTS, "test.toml");
    writeFileSync(path, '[mcp]\nserver = "test"\n');
    const result = readTomlConfig(path);
    const mcp = result["mcp"];
    expect(isRecord(mcp) ? readString(mcp, "server") : undefined).toBe("test");
  });

  it("returns empty object on malformed TOML", () => {
    mkdirSync(AGENTS, { recursive: true });
    const path = join(AGENTS, "bad.toml");
    writeFileSync(path, "[[[[not valid toml");
    expect(readTomlConfig(path)).toEqual({});
  });
});

describe("toToml", () => {
  it("serialises a string value", () => {
    expect(toToml({ key: "val" })).toContain('key = "val"');
  });

  it("serialises a boolean", () => {
    expect(toToml({ flag: true })).toContain("flag = true");
  });

  it("serialises a number", () => {
    expect(toToml({ n: 42 })).toContain("n = 42");
  });

  it("serialises an array as JSON inline", () => {
    expect(toToml({ arr: [1, 2] })).toContain("arr = [1,2]");
  });

  it("serialises a nested object as a section header", () => {
    const result = toToml({ db: { host: "localhost" } });
    expect(result).toContain("[db]");
    expect(result).toContain('host = "localhost"');
  });
});

describe("resolveServer strips global field", () => {
  test("global field is not included in resolved output", async () => {
    const server: McpServer = { command: "npx", args: ["-y", "test-mcp"], global: true };
    const { server: resolved } = await resolveServer("test", server, {});
    expect("global" in resolved).toBe(false);
  });
});

describe("syncSkills", () => {
  it("returns empty results when source dir does not exist", () => {
    const result = syncSkills("/nonexistent/skills", "/tmp/target-skills-xyz", false);
    expect(result.linked).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("links skills from source to target", () => {
    mkdirSync(AGENTS, { recursive: true });
    const src = join(AGENTS, "skills-src");
    const dst = join(AGENTS, "skills-dst");
    mkdirSync(join(src, "my-skill"), { recursive: true });
    writeFileSync(join(src, "my-skill", "SKILL.md"), "---\nname: my-skill\n---\n");
    const result = syncSkills(src, dst, false);
    expect(result.linked).toContain("my-skill");
    expect(result.errors).toHaveLength(0);
  });

  it("skips already-present skills in target", () => {
    mkdirSync(AGENTS, { recursive: true });
    const src = join(AGENTS, "skills-src2");
    const dst = join(AGENTS, "skills-dst2");
    mkdirSync(join(src, "existing-skill"), { recursive: true });
    mkdirSync(join(dst, "existing-skill"), { recursive: true });
    const result = syncSkills(src, dst, false);
    expect(result.skipped).toContain("existing-skill");
  });

  it("dry-run reports linked without creating symlinks", () => {
    mkdirSync(AGENTS, { recursive: true });
    const src = join(AGENTS, "skills-src3");
    const dst = join(AGENTS, "skills-dst3");
    mkdirSync(join(src, "dry-skill"), { recursive: true });
    const result = syncSkills(src, dst, true);
    expect(result.linked[0]).toContain("dry-skill");
    // target dir must NOT have been created
    expect(existsSync(dst)).toBe(false);
  });

  it("skips system junk files like .DS_Store", () => {
    mkdirSync(AGENTS, { recursive: true });
    const src = join(AGENTS, "skills-src4");
    const dst = join(AGENTS, "skills-dst4");
    mkdirSync(join(src, "real-skill"), { recursive: true });
    writeFileSync(join(src, ".DS_Store"), "junk");
    writeFileSync(join(src, "Thumbs.db"), "junk");
    writeFileSync(join(src, "desktop.ini"), "junk");
    const result = syncSkills(src, dst, false);
    expect(result.linked).toEqual(["real-skill"]);
    expect(existsSync(join(dst, ".DS_Store"))).toBe(false);
  });

  it("skips hidden entries like dot directories", () => {
    mkdirSync(AGENTS, { recursive: true });
    const src = join(AGENTS, "skills-src5");
    const dst = join(AGENTS, "skills-dst5");
    mkdirSync(join(src, ".git"), { recursive: true });
    mkdirSync(join(src, ".obsidian"), { recursive: true });
    mkdirSync(join(src, "visible-skill"), { recursive: true });
    const result = syncSkills(src, dst, false);
    expect(result.linked).toEqual(["visible-skill"]);
  });
});
