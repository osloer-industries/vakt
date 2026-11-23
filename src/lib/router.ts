import type { ModelRouter } from "./schemas";
import { isRecord } from "./type-guards";

export interface RoutingSignals {
  promptTokens: number;
  toolCount: number;
  hasCode: boolean;
  hasMath: boolean;
}

export interface RoutingResult {
  backend: string | null;
  signals: RoutingSignals;
  matchedRule?: number;
}

export function estimateTokens(messages: unknown[]): number {
  if (messages.length === 0) return 0;
  return Math.ceil(JSON.stringify(messages).length / 4);
}

function latestUserMessage(
  messages: Array<{ role: string; content: string }>,
): { role: string; content: string } | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === "user") return m;
  }
  return undefined;
}

export function detectCode(messages: Array<{ role: string; content: string }>): boolean {
  const latestUser = latestUserMessage(messages);
  if (!latestUser?.content) return false;
  
  const content = latestUser.content;
  if (/```[a-zA-Z]*\n/.test(content)) return true;
  
  const codeKeywords = /\b(function|class|const|let|var|if|for|while|return|import|export|def|class)\b/;
  if (codeKeywords.test(content)) return true;
  
  return false;
}

export function detectMath(messages: Array<{ role: string; content: string }>): boolean {
  const latestUser = latestUserMessage(messages);
  if (!latestUser?.content) return false;

  const content = latestUser.content;
  if (/\$[^$]+\$/.test(content)) return true;
  if (/[∫∑∏√∂^]/.test(content)) return true;
  
  return false;
}

export function extractToolCount(body: unknown): number {
  if (!isRecord(body)) return 0;
  const tools = body.tools;
  if (Array.isArray(tools)) return tools.length;
  return 0;
}

interface RoutingRule {
  if?: {
    promptTokens?: { gt?: number };
    toolCount?: { gt?: number };
    hasCode?: boolean;
    hasMath?: boolean;
  };
  use: string | string[];
}

type ConfigRoutingRule = NonNullable<NonNullable<ModelRouter>["rules"]>[number];

function normalizeRoutingRule(rule: ConfigRoutingRule): RoutingRule {
  const ifBlock = rule.if;
  const normalizedIf = ifBlock === undefined ? undefined : {
    ...(ifBlock.promptTokens === undefined ? {} : { promptTokens: ifBlock.promptTokens }),
    ...(ifBlock.toolCount === undefined ? {} : { toolCount: ifBlock.toolCount }),
    ...(ifBlock.hasCode === undefined ? {} : { hasCode: ifBlock.hasCode }),
    ...(ifBlock.hasMath === undefined ? {} : { hasMath: ifBlock.hasMath }),
  };
  return {
    use: rule.use,
    ...(normalizedIf === undefined ? {} : { if: normalizedIf }),
  };
}

function getFirstBackend(use: string | string[]): string | null {
  const backends = Array.isArray(use) ? use : [use];
  return backends[0] ?? null;
}

function checkRuleCondition(
  rule: RoutingRule,
  signals: RoutingSignals
): boolean {
  if (!rule.if) return true;
  
  if (rule.if.promptTokens?.gt !== undefined) {
    if (signals.promptTokens <= rule.if.promptTokens.gt) {
      return false;
    }
  }
  
  if (rule.if.toolCount?.gt !== undefined) {
    if (signals.toolCount <= rule.if.toolCount.gt) {
      return false;
    }
  }
  
  if (rule.if.hasCode !== undefined && signals.hasCode !== rule.if.hasCode) {
    return false;
  }
  
  if (rule.if.hasMath !== undefined && signals.hasMath !== rule.if.hasMath) {
    return false;
  }
  
  return true;
}

export function selectBackend(
  config: ModelRouter | undefined,
  signals: RoutingSignals
): RoutingResult {
  if (!config) {
    return { backend: null, signals };
  }
  
  const rules = config.rules ?? [];
  
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;
    
    if (checkRuleCondition(normalizeRoutingRule(rule), signals)) {
      return {
        backend: getFirstBackend(rule.use),
        signals,
        matchedRule: i,
      };
    }
  }
  
  return {
    backend: null,
    signals,
  };
}

export function buildSignals(body: unknown): RoutingSignals {
  const messages = extractMessages(body);
  const toolCount = extractToolCount(body);
  
  return {
    promptTokens: estimateTokens(messages),
    toolCount,
    hasCode: detectCode(messages),
    hasMath: detectMath(messages),
  };
}

function isChatMessage(m: unknown): m is { role: string; content: string } {
  return (
    isRecord(m) &&
    typeof m.role === "string" &&
    typeof m.content === "string"
  );
}

function extractMessages(body: unknown): Array<{ role: string; content: string }> {
  if (!isRecord(body)) return [];
  const messages = body.messages;
  if (!Array.isArray(messages)) return [];
  return messages.filter(isChatMessage);
}
