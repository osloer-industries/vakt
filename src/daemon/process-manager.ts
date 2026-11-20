import type { McpConfig, AgentConfig } from "../lib/schemas";
import { requireStdioServer } from "../lib/stdio-server";
import { envRecord } from "../lib/type-guards";

export type ServerStatus = {
  status: "stopped" | "starting" | "running" | "crashed";
  pid?: number;
  restarts: number;
  lastStartedAt?: number;
};

export class ProcessManager {
  private statuses: Record<string, ServerStatus> = {};
  private procs: Record<string, ReturnType<typeof Bun.spawn>> = {};

  constructor(
    private mcpConfig: McpConfig,
    private _agentConfig: AgentConfig | Record<string, never>
  ) {
    for (const name of Object.keys(mcpConfig)) {
      this.statuses[name] = { status: "stopped", restarts: 0 };
    }
  }

  listStatuses(): Record<string, ServerStatus> {
    return { ...this.statuses };
  }

  async start(name: string): Promise<void> {
    const server = requireStdioServer(name, this.mcpConfig[name]);

    const prior = this.statuses[name] ?? { status: "stopped" as const, restarts: 0 };
    this.statuses[name] = { ...prior, status: "starting" };

    const proc = Bun.spawn([server.command, ...(server.args ?? [])], {
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
      env: { ...envRecord(), ...server.env },
    });

    this.procs[name] = proc;
    this.statuses[name] = {
      status: "running",
      pid: proc.pid,
      restarts: prior.restarts,
      lastStartedAt: Date.now(),
    };

    // Auto-restart on unexpected exit
    void proc.exited.then((code) => {
      const status = this.statuses[name];
      if (code !== 0 && status?.status === "running") {
        this.statuses[name] = { ...status, status: "crashed", restarts: status.restarts + 1 };
        setTimeout(() => { void this.start(name).catch(console.error); }, 2_000);
      }
    });
  }

  async stop(name: string): Promise<void> {
    this.procs[name]?.kill();
    delete this.procs[name];
    const status = this.statuses[name];
    if (status) this.statuses[name] = { ...status, status: "stopped" };
  }

  async restart(name: string): Promise<void> {
    await this.stop(name);
    await this.start(name);
  }

  getProcess(name: string) { return this.procs[name] ?? null; }
}