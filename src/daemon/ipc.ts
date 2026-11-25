import { join } from "path";
import { existsSync } from "fs";
import { AGENTS_DIR } from "../lib/config";
import {
  DaemonCmdSchema,
  DaemonResponseSchema,
  type DaemonCmd,
  type DaemonResponse,
} from "../lib/schemas";
import { parseJsonUnknown } from "../lib/type-guards";

export const SOCKET_PATH = join(AGENTS_DIR, "daemon.sock");
export const PID_PATH    = join(AGENTS_DIR, "daemon.pid");

export type { DaemonCmd, DaemonResponse };

export async function sendToDaemon(cmd: DaemonCmd): Promise<DaemonResponse> {
  if (!existsSync(SOCKET_PATH)) {
    return { ok: false, error: "Daemon not running. Start with: vakt daemon start" };
  }
  return new Promise((resolve, reject) => {
    void Bun.connect({
      unix: SOCKET_PATH,
      socket: {
        data(_, data) {
          try {
            const parsed = parseJsonUnknown(data.toString());
            resolve(DaemonResponseSchema.parse(parsed));
          } catch (e) { reject(e); }
        },
        error(_, e) { reject(e); },
        open(s) { s.write(JSON.stringify(cmd)); },
      },
    });
  });
}

export function parseDaemonCmd(raw: unknown): DaemonCmd {
  return DaemonCmdSchema.parse(raw);
}