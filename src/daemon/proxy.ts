import { randomUUID } from "node:crypto";
import { PolicyEngine } from "../lib/policy";
import { AuditStore } from "../lib/audit";
import { recordToolCallSpan } from "../lib/otel";
import { JsonRpcFrameSchema, type JsonRpcFrame, type Policy } from "../lib/schemas";
import { isRecord, parseJsonUnknown, readString } from "../lib/type-guards";

interface DenyData {
  rule: string;
  hint?: string;
  systemMessage: string;
}

function buildDenyData(rule: string): DenyData {
  const isWildcardServer = rule.includes('servers["*"]') || rule.includes("servers['*']");
  const isWildcardTool = rule.includes('["*"]') || rule.includes("['*']");
  
  let hint: string | undefined;
  if (isWildcardServer && isWildcardTool) {
    hint = "All tools on all servers are denied by default. Add specific allow rules.";
  } else if (isWildcardServer) {
    hint = "Tool is denied by wildcard server rule. Add specific server rule to allow.";
  } else if (isWildcardTool) {
    hint = "Tool matches wildcard deny pattern. Use specific tool name to allow.";
  }
  
  return {
    rule,
    hint,
    systemMessage: `vakt blocked tool — matched policy: ${rule}`,
  };
}

function denyFrame(id: unknown, toolName: string, data: DenyData): string {
  return JSON.stringify({
    jsonrpc: "2.0", id,
    error: { 
      code: -32603, 
      message: `vakt: tool '${toolName}' denied by policy`,
      data,
    },
  }) + "\n";
}

function parseFrameLine(line: string): JsonRpcFrame | null {
  try {
    return JsonRpcFrameSchema.parse(parseJsonUnknown(line));
  } catch {
    return null;
  }
}

function parseFrames(data: Buffer | Uint8Array): JsonRpcFrame[] {
  return Buffer.from(data).toString("utf-8")
    .split("\n")
    .filter(l => l.trim())
    // MCP uses newline-delimited JSON-RPC 2.0 over stdio; malformed lines are silently dropped
    // per spec: https://spec.modelcontextprotocol.io/specification/basic/transports/#stdio
    .flatMap(l => {
      const frame = parseFrameLine(l);
      return frame ? [frame] : [];
    });
}

export interface ProxyOptions {
  serverName: string;
  policy:     Policy | null;
  store:      AuditStore;
  sessionId?: string;
  provider?:  string;
}

function recordDeniedToolCall(
  opts: ProxyOptions,
  sessionId: string,
  toolName: string,
  startedAt: number,
  policyRule: string | undefined,
): void {
  const endedAt = Date.now();
  opts.store.recordToolCall({
    sessionId, serverName: opts.serverName, toolName, runtime: "local",
    provider: opts.provider ?? "unknown", policyResult: "deny",
    startedAt, endedAt, responseOk: false, policyRule,
  });
  recordToolCallSpan({
    serverName: opts.serverName, toolName, runtime: "local",
    policyResult: "deny", provider: opts.provider ?? "unknown",
    sessionId, startedAt, endedAt, ok: false, policyRule,
  });
}

export function createProxy(opts: ProxyOptions) {
  const engine    = opts.policy ? new PolicyEngine(opts.policy) : null;
  const sessionId = opts.sessionId ?? randomUUID();
  const pending   = new Map<unknown, { toolName: string; startedAt: number }>();

  /** Intercepts stdin data heading to the MCP server. Returns forwarded bytes and denied responses. */
  function interceptRequest(data: Buffer | Uint8Array): { forward: Buffer; denied: string[] } {
    if (!engine) return { forward: Buffer.from(data), denied: [] };

    const frames = parseFrames(data);
    const forward: string[] = [];
    const denied:  string[] = [];

    for (const frame of frames) {
      const raw = JSON.stringify(frame) + "\n";
      if (frame.method !== "tools/call") {
        forward.push(raw);
        continue;
      }

      const params = isRecord(frame.params) ? frame.params : {};
      const toolName = readString(params, "name") ?? "";
      const startedAt = Date.now();
      const checkResult = engine.checkTool(opts.serverName, toolName);

      if (checkResult.result === "deny") {
        const denyData = buildDenyData(checkResult.matchedRule ?? "unknown");
        denied.push(denyFrame(frame.id, toolName, denyData));
        recordDeniedToolCall(opts, sessionId, toolName, startedAt, checkResult.matchedRule);
        continue;
      }

      forward.push(raw);
      if (frame.id !== undefined && frame.id !== null) {
        pending.set(frame.id, { toolName, startedAt });
      }
    }

    return {
      forward: Buffer.from(forward.join("")),
      denied,
    };
  }

  /** Intercepts stdout data from the MCP server. Records allowed calls and passes bytes through. */
  function interceptResponse(data: Buffer | Uint8Array): Buffer {
    const frames = parseFrames(data);
    for (const frame of frames) {
      if (frame.id !== undefined && frame.id !== null && pending.has(frame.id)) {
        const pendingCall = pending.get(frame.id);
        if (pendingCall === undefined) continue;
        const { toolName, startedAt } = pendingCall;
        pending.delete(frame.id);
        recordAllowed(toolName, startedAt);
      }
    }
    return Buffer.from(data);
  }

  /** Call after receiving a successful tool response to record in audit. */
  function recordAllowed(toolName: string, startedAt: number): void {
    const endedAt = Date.now();
    opts.store.recordToolCall({
      sessionId, serverName: opts.serverName, toolName, runtime: "local",
      provider: opts.provider ?? "unknown", policyResult: "allow",
      startedAt, endedAt, responseOk: true,
    });
    recordToolCallSpan({
      serverName: opts.serverName, toolName, runtime: "local",
      policyResult: "allow", provider: opts.provider ?? "unknown",
      sessionId, startedAt, endedAt, ok: true,
    });
  }

  return { interceptRequest, interceptResponse, recordAllowed };
}
