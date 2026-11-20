import type { Command } from "commander";
import { loadMcpConfig, loadAgentConfig } from "../lib/config";
import { loadPolicy } from "../lib/policy";
import { AuditStore } from "../lib/audit";
import { initOtel, shutdownOtel } from "../lib/otel";
import { createProxy } from "../daemon/proxy";
import { randomUUID } from "node:crypto";
import { requireStdioServer } from "../lib/stdio-server";
import { envRecord } from "../lib/type-guards";

export function registerProxy(program: Command): void {
  program
    .command("proxy <server>")
    .description("Run as MCP stdio proxy for a server (called by provider configs — not invoked directly)")
    .action(async (serverName: string) => {
      const mcpConfig   = loadMcpConfig();
      const agentConfig = loadAgentConfig();
      const policy      = loadPolicy();
      const server      = requireStdioServer(serverName, mcpConfig[serverName]);

      const store = new AuditStore();
      store.init();
      await initOtel(agentConfig.otel?.endpoint);

      const proxy = createProxy({
        serverName, policy, store,
        sessionId: randomUUID(),
        provider: process.env["VAKT_PROVIDER"],
      });

      const proc = Bun.spawn(
        [server.command, ...(server.args ?? [])],
        {
          stdin: "pipe", stdout: "pipe", stderr: "pipe",
          env: { ...envRecord(), ...server.env },
        }
      );

      const procStdin = proc.stdin;
      if (procStdin === null || procStdin === undefined) {
        process.stderr.write(`vakt: failed to open stdin for server '${serverName}'\n`);
        process.exit(1);
      }

      // Agent stdin → policy check → server stdin
      // Close server stdin on EOF so the server exits cleanly and flushes its stdout
      process.stdin.on("data", (data: Buffer) => {
        const { forward, denied } = proxy.interceptRequest(data);
        denied.forEach((d) => process.stdout.write(d));
        if (forward.length > 0) void procStdin.write(forward);
      });
      process.stdin.on("end", () => { void procStdin.end(); });

      // Server stdout → audit recording → agent stdout
      // Awaited before exit so interceptResponse runs for every response before the process ends
      const stdoutDone = (async () => {
        for await (const chunk of proc.stdout) {
          proxy.interceptResponse(chunk);
          process.stdout.write(chunk);
        }
      })();

      // Server stderr → our stderr
      void (async () => { for await (const chunk of proc.stderr) process.stderr.write(chunk); })();

      void proc.exited.then(async (code) => {
        await stdoutDone;
        await shutdownOtel();
        process.exit(code ?? 0);
      });
    });
}