import { describe, it, expect } from "bun:test";
import { expectDefined } from "../lib/test-assert";
import { ProcessManager } from "./process-manager";

describe("ProcessManager", () => {
  it("lists all configured servers as stopped initially", () => {
    const pm = new ProcessManager(
      { github: { command: "echo", args: ["ok"], global: false } },
      {},
    );
    const statuses = pm.listStatuses();
    expect(expectDefined(statuses["github"], "github status").status).toBe("stopped");
  });

  it("starts a server and reports pid + running status", async () => {
    const pm = new ProcessManager({ test: { command: "sleep", args: ["30"], global: false } }, {});
    await pm.start("test");
    const s = expectDefined(pm.listStatuses()["test"], "test status");
    expect(s.status).toBe("running");
    expect(s.pid).toBeGreaterThan(0);
    await pm.stop("test");
  });

  it("stop brings status back to stopped", async () => {
    const pm = new ProcessManager({ test: { command: "sleep", args: ["30"], global: false } }, {});
    await pm.start("test");
    await pm.stop("test");
    expect(expectDefined(pm.listStatuses()["test"], "test status").status).toBe("stopped");
  });

  it("throws when starting an unknown server", async () => {
    const pm = new ProcessManager({}, {});
    let threw = false;
    try {
      await pm.start("nonexistent");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});