import type { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { PID_PATH, sendToDaemon } from "../daemon/ipc";
import { DaemonStatusDataSchema } from "../lib/schemas";
import { runDaemon } from "../daemon/index";

export function registerDaemon(program: Command): void {
  const daemon = program.command("daemon").description("Manage the vakt daemon process");

  // Hidden subcommand used for self-exec in both dev and compiled mode.
  daemon.command("_run", { hidden: true }).action(() => {
    runDaemon();
  });

  daemon.command("start").description("Start the daemon").action(async () => {
    if (existsSync(PID_PATH)) {
      console.log(`Daemon already running (pid ${readFileSync(PID_PATH, "utf-8").trim()})`);
      return;
    }
    // In compiled mode Bun.main is "/$bunfs/…"; use argv[0] (the binary itself).
    // In dev mode Bun.main is the real source path; use bun + that path.
    const isBundled = Bun.main.startsWith("/$bunfs");
    const self = process.argv[0] ?? process.execPath;
    const cmd: string[] = isBundled
      ? [self, "daemon", "_run"]
      : ["bun", Bun.main, "daemon", "_run"];
    const proc = Bun.spawn(cmd, { detached: true, stdio: ["ignore", "ignore", "ignore"] });
    proc.unref();
    await Bun.sleep(400);
    console.log("✓ vakt daemon started");
  });

  daemon.command("stop").description("Stop the daemon").action(() => {
    if (!existsSync(PID_PATH)) { console.log("Daemon not running."); return; }
    const pid = Number.parseInt(readFileSync(PID_PATH, "utf-8"), 10);
    process.kill(pid, "SIGTERM");
    console.log(`✓ Sent SIGTERM to daemon (pid ${pid})`);
  });

  daemon.command("status").description("Show daemon and server status").action(async () => {
    const r = await sendToDaemon({ type: "status" });
    if (!r.ok) { console.log(r.error); return; }
    const parsed = DaemonStatusDataSchema.safeParse(r.data);
    if (!parsed.success) {
      console.log("Daemon returned unexpected status payload");
      return;
    }
    const d = parsed.data;
    console.log(`\nDaemon running (pid ${d.pid})\n`);
    console.log(`${"SERVER".padEnd(22)} STATUS     PID`);
    console.log("─".repeat(45));
    for (const [name, s] of Object.entries(d.servers)) {
      console.log(`${name.padEnd(22)} ${s.status.padEnd(10)} ${s.pid ?? ""}`);
    }
  });

  daemon.command("logs").description("Tail daemon logs").action(() => {
    console.log("Run: vakt daemon start 2>> ~/.agents/daemon.log");
    console.log("Then: tail -f ~/.agents/daemon.log");
  });
}
