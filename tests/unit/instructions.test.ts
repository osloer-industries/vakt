import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, existsSync, readlinkSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { ensureProviderAgentsMd, resolveProviderInstructionsPath } from "../../src/lib/instructions";
import type { Provider } from "../../src/lib/schemas";

describe("ensureProviderAgentsMd", () => {
  let tmp: string;
  let source: string;

  beforeEach(() => {
    tmp = mkdtempSync("/tmp/vakt-instructions-");
    source = join(tmp, "central", "AGENTS.md");
    mkdirSync(join(tmp, "central"), { recursive: true });
    writeFileSync(source, "# Central AGENTS.md\n");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("creates symlink when target is missing", () => {
    const target = join(tmp, "provider", "AGENTS.md");
    expect(ensureProviderAgentsMd(source, target, "symlink", false)).toBe("linked");
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
    expect(readlinkSync(target)).toBe(source);
  });

  it("skips when symlink already points at source", () => {
    const target = join(tmp, "provider", "AGENTS.md");
    mkdirSync(join(tmp, "provider"), { recursive: true });
    symlinkSync(source, target);
    expect(ensureProviderAgentsMd(source, target, "symlink", false)).toBe("skipped");
  });

  it("blocks when a regular file already exists", () => {
    const target = join(tmp, "provider", "AGENTS.md");
    mkdirSync(join(tmp, "provider"), { recursive: true });
    writeFileSync(target, "local only");
    expect(ensureProviderAgentsMd(source, target, "symlink", false)).toBe("blocked");
    expect(existsSync(target)).toBe(true);
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
  });

  it("overwrites on copy refresh", () => {
    const target = join(tmp, "provider", "AGENTS.md");
    mkdirSync(join(tmp, "provider"), { recursive: true });
    writeFileSync(target, "stale");
    writeFileSync(source, "# Updated\n");
    expect(ensureProviderAgentsMd(source, target, "copy", false)).toBe("refreshed");
    expect(readFileSync(target, "utf-8")).toBe("# Updated\n");
  });
});

describe("resolveProviderInstructionsPath", () => {
  it("returns expanded platform path", () => {
    const provider = {
      id: "codex",
      instructions: {
        path: { linux: "$HOME/.codex/AGENTS.md" },
        method: "symlink",
      },
    } as unknown as Provider;
    const prev = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });
    const path = resolveProviderInstructionsPath(provider);
    Object.defineProperty(process, "platform", { value: prev });
    expect(path?.endsWith("/.codex/AGENTS.md")).toBe(true);
  });
});