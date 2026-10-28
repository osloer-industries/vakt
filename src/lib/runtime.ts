import type { AgentConfig, RuntimeBackend } from "./schemas";
import { RuntimeBackendSchema } from "./schemas";

export type { RuntimeBackend };

export function getRuntimeForServer(name: string, config: AgentConfig): RuntimeBackend {
  const backend = config.runtime?.servers?.[name] ?? config.runtime?.default ?? "local";
  const parsed = RuntimeBackendSchema.safeParse(backend);
  return parsed.success ? parsed.data : "local";
}

// E2B cloud sandbox helpers (resolvedE2BApiKey, startServerInE2B, stopSandbox)
// are pending implementation in commands/runtime.ts (feat/e2b-sandbox).
