import { describe, it, expect } from "bun:test";
import { spawnSync } from "bun";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

const AGENTCTL = join(dirname(fileURLToPath(import.meta.url)), "../vakt.sh");

function run(...args: string[]) {
  const tmp = mkdtempSync(join(tmpdir(), "vakt-test-"));
  const result = spawnSync([AGENTCTL, ...args], {
    env: { ...process.env, AGENTS_DIR: tmp, HOME: tmp, AGENTS_SECRETS_BACKEND: "env" },
  });
  rmSync(tmp, { recursive: true, force: true });
  return {
    status: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

describe("vakt agent CLI", () => {
  it("agent --help lists subcommands", () => {
    const r = run("agent", "--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("start");
    expect(r.stdout).toContain("exec");
    expect(r.stdout).toContain("destroy");
  });

  it("agent start --help shows options", () => {
    const r = run("agent", "start", "--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--provider");
  });
});
