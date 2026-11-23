import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildServerEntry } from "./add-server";

const tmp = "/tmp/vakt-add-server-test";

describe("buildServerEntry", () => {
  test("builds a stdio server entry with global: false by default", () => {
    const entry = buildServerEntry({ command: "npx", args: ["my-server"], global: false });
    expect(entry).toEqual({ command: "npx", args: ["my-server"], global: false });
  });

  test("builds a stdio server entry with global: true when specified", () => {
    const entry = buildServerEntry({ command: "npx", args: ["my-server"], global: true });
    expect(entry).toEqual({ command: "npx", args: ["my-server"], global: true });
  });

  test("omits args when empty", () => {
    const entry = buildServerEntry({ command: "my-cmd", args: [], global: false });
    expect(entry).not.toHaveProperty("args");
    expect(entry.global).toBe(false);
  });

  test("builds an HTTP server entry with global: false by default", () => {
    const entry = buildServerEntry({ transport: "http", url: "https://example.com/mcp", global: false });
    expect(entry).toEqual({ transport: "http", url: "https://example.com/mcp", global: false });
  });

  test("builds an HTTP server entry with global: true when specified", () => {
    const entry = buildServerEntry({ transport: "http", url: "https://example.com/mcp", global: true });
    expect(entry).toEqual({ transport: "http", url: "https://example.com/mcp", global: true });
  });
});

describe("add-server writes global field to mcp-config.json", () => {
  const agentsDir = join(tmp, ".agents");
  const mcpPath = join(agentsDir, "mcp-config.json");

  beforeEach(async () => {
    mkdirSync(agentsDir, { recursive: true });
    // Write empty mcp-config.json
    await Bun.write(mcpPath, "{}");
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  test("written stdio entry has global: true when flag passed", async () => {
    const { addServerToConfig } = await import("./add-server");
    await addServerToConfig(agentsDir, "my-server", { command: "npx", args: ["srv"], global: true });
    const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(config["my-server"].global).toBe(true);
  });

  test("written stdio entry has global: false when flag not passed", async () => {
    const { addServerToConfig } = await import("./add-server");
    await addServerToConfig(agentsDir, "my-server", { command: "npx", args: ["srv"], global: false });
    const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(config["my-server"].global).toBe(false);
  });

  test("written http entry has global: true when flag passed", async () => {
    const { addServerToConfig } = await import("./add-server");
    await addServerToConfig(agentsDir, "my-http", { transport: "http", url: "https://example.com", global: true });
    const config = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(config["my-http"].global).toBe(true);
  });
});
