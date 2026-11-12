import type { Command } from "commander";
import { loadAgentConfig } from "../lib/config";
import { AuditStore, defaultAuditDbPath } from "../lib/audit";
import { DockerSandboxProvider } from "../lib/sandbox/docker";
import { sanitizeForLog } from "../lib/safe-input";
import type { SandboxProvider } from "../lib/sandbox";

type AgentConfig = Awaited<ReturnType<typeof loadAgentConfig>>;

function getProvider(name: string, config: AgentConfig): SandboxProvider {
  if (name === "docker") {
    const d = config.runtime?.docker;
    return new DockerSandboxProvider({
      socket:  d?.socket,
      image:   d?.image,
      memory:  d?.memory,
      cpus:    d?.cpus,
      network: d?.network,
    });
  }
  throw new Error(`Unknown sandbox provider: ${name}. Supported: docker`);
}

export function registerAgent(program: Command): void {
  const agent = program
    .command("agent")
    .description("Manage coding agent sessions in isolated sandbox containers");

  agent
    .command("start")
    .description("Create a new sandbox session and return the session ID")
    .option("-p, --provider <name>", "Sandbox provider (docker)", "docker")
    .option("-r, --repo <path>",     "Host path to bind-mount at /workspace")
    .option("-i, --image <image>",   "Container image override")
    .option("-n, --name <name>",     "Session name (e.g. sprint-1-coder-0)")
    .option("--format <fmt>",        "Output format: full | id", "full")
    .action(async (opts) => {
      const config = loadAgentConfig();
      const provider = getProvider(opts.provider, config);
      const store = new AuditStore(defaultAuditDbPath());
      store.init();

      const handle = await provider.create({
        repo:  opts.repo,
        image: opts.image,
        name:  opts.name,
      });

      const sessionId = store.createSession({
        provider: provider.name,
        containerId: handle.id,
        repo: opts.repo,
        name: opts.name,
      });

      if (opts.format === "id") {
        process.stdout.write(sessionId + "\n");
      } else {
        console.log(`session   ${sessionId}`);
        console.log(`container ${sanitizeForLog(handle.id)}`);
        console.log(`provider  ${sanitizeForLog(provider.name)}`);
      }
    });

  agent
    .command("exec <session-id> <command>")
    .description("Run a shell command inside the session container")
    .action(async (sessionId: string, command: string) => {
      const config = loadAgentConfig();
      const store = new AuditStore(defaultAuditDbPath());
      store.init();
      const session = store.getSession(sessionId);
      if (!session) { console.error(`Session not found: ${sessionId}`); process.exit(1); }
      const provider = getProvider(session.provider, config);
      const startedAt = Date.now();
      const result = await provider.exec(
        { id: session.container_id, provider: session.provider },
        ["sh", "-c", command],
      );
      store.recordToolCall({
        sessionId,
        serverName: session.provider,
        toolName: "exec",
        runtime: session.provider,
        provider: session.provider,
        policyResult: "allow",
        startedAt,
        endedAt: Date.now(),
        responseOk: result.exitCode === 0,
      });
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.exitCode);
    });

  agent
    .command("write-file <session-id> <path> <content>")
    .description("Write a file into the session container")
    .action(async (sessionId: string, path: string, content: string) => {
      const config = loadAgentConfig();
      const store = new AuditStore(defaultAuditDbPath());
      store.init();
      const session = store.getSession(sessionId);
      if (!session) { console.error(`Session not found: ${sessionId}`); process.exit(1); }
      const provider = getProvider(session.provider, config);
      await provider.writeFile({ id: session.container_id, provider: session.provider }, path, content);
    });

  agent
    .command("read-file <session-id> <path>")
    .description("Read a file from the session container")
    .action(async (sessionId: string, path: string) => {
      const config = loadAgentConfig();
      const store = new AuditStore(defaultAuditDbPath());
      store.init();
      const session = store.getSession(sessionId);
      if (!session) { console.error(`Session not found: ${sessionId}`); process.exit(1); }
      const provider = getProvider(session.provider, config);
      const content = await provider.readFile({ id: session.container_id, provider: session.provider }, path);
      process.stdout.write(content);
    });

  agent
    .command("status <session-id>")
    .description("Show status of a session")
    .action(async (sessionId: string) => {
      const store = new AuditStore(defaultAuditDbPath());
      store.init();
      const session = store.getSession(sessionId);
      if (!session) { console.error(`Session not found: ${sessionId}`); process.exit(1); }
      console.log(`id        ${session.id}`);
      console.log(`provider  ${session.provider}`);
      console.log(`container ${session.container_id}`);
      console.log(`status    ${session.status}`);
      if (session.repo) console.log(`repo      ${session.repo}`);
    });

  agent
    .command("destroy <session-id>")
    .description("Destroy the sandbox container and close the session")
    .action(async (sessionId: string) => {
      const config = loadAgentConfig();
      const store = new AuditStore(defaultAuditDbPath());
      store.init();
      const session = store.getSession(sessionId);
      if (!session) { console.error(`Session not found: ${sessionId}`); process.exit(1); }
      const provider = getProvider(session.provider, config);
      await provider.destroy({ id: session.container_id, provider: session.provider });
      store.closeSession(sessionId);
      console.log(`destroyed ${sessionId}`);
    });

  agent
    .command("list")
    .description("List all sessions")
    .option("--status <status>", "Filter by status (running|closed)")
    .action(async (opts) => {
      const store = new AuditStore(defaultAuditDbPath());
      store.init();
      const sessions = store.listSessions({ status: opts.status });
      if (sessions.length === 0) { console.log("no sessions"); return; }
      for (const s of sessions) {
        console.log(`${s.id}  ${s.provider}  ${s.status}  ${s.container_id}`);
      }
    });
}
