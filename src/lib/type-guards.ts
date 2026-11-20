import type { PlatformKey } from "./schemas";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

export function readStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  return value.every((entry) => typeof entry === "string") ? value : undefined;
}

export function readStringRecord(record: Record<string, unknown>, key: string): Record<string, string> | undefined {
  const value = record[key];
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string") return undefined;
    out[k] = v;
  }
  return out;
}

export function envRecord(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function parseJsonUnknown(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  return parsed;
}

export function currentPlatformKey(): PlatformKey {
  const platform = process.platform;
  if (platform === "darwin" || platform === "linux" || platform === "win32") {
    return platform;
  }
  return "linux";
}

/** Strip Zod optional entries so maps satisfy exactOptionalPropertyTypes. */
export function platformPathInput(
  map: {
    darwin?: string | undefined;
    linux?: string | undefined;
    win32?: string | undefined;
  },
): Partial<Record<PlatformKey, string>> {
  const out: Partial<Record<PlatformKey, string>> = {};
  if (map.darwin !== undefined) out.darwin = map.darwin;
  if (map.linux !== undefined) out.linux = map.linux;
  if (map.win32 !== undefined) out.win32 = map.win32;
  return out;
}

export function platformStringPath(
  map: string | Partial<Record<PlatformKey, string>> | {
    darwin?: string | undefined;
    linux?: string | undefined;
    win32?: string | undefined;
  },
  platform: PlatformKey = currentPlatformKey(),
): string {
  if (typeof map === "string") return map;
  const paths = platformPathInput(map);
  return paths[platform] ?? paths.linux ?? "";
}

export function nestedRecordGet(obj: unknown, dotKey: string): unknown {
  return dotKey.split(".").reduce<unknown>((acc, key) => (isRecord(acc) ? acc[key] : undefined), obj);
}

function isPrototypePollutionKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

export function nestedRecordSet(obj: Record<string, unknown>, dotKey: string, value: unknown): void {
  const parts = dotKey.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (key === undefined || isPrototypePollutionKey(key)) return;
    const next = cur[key];
    if (!isRecord(next)) cur[key] = {};
    const child = cur[key];
    if (!isRecord(child)) return;
    cur = child;
  }
  const last = parts[parts.length - 1];
  if (last !== undefined && !isPrototypePollutionKey(last)) cur[last] = value;
}

export function mcpServerHasRegistry(server: unknown): boolean {
  return isRecord(server) && typeof server.registry === "string" && server.registry.length > 0;
}

/** Deep-clone a JSON-serialisable value into a plain record (strips non-JSON fields). */
export function cloneJsonRecord(value: unknown): Record<string, unknown> {
  const cloned: unknown = JSON.parse(JSON.stringify(value));
  return isRecord(cloned) ? cloned : {};
}