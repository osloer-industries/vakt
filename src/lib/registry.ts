const REGISTRY_BASE = "https://registry.modelcontextprotocol.io";

import {
  RegistryEntrySchema,
  RegistrySearchResponseSchema,
  type RegistryEntry,
} from "./schemas";

export type { RegistryEntry };

export interface ResolvedPackage {
  command: string;
  args: string[];
  requiredSecrets: string[];
}

export class RegistryClient {
  lookupUrl(id: string): string {
    return `${REGISTRY_BASE}/v0/servers/${encodeURIComponent(id)}`;
  }

  async lookup(id: string): Promise<RegistryEntry | null> {
    const res = await fetch(this.lookupUrl(id));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Registry ${res.status}: ${id}`);
    const body: unknown = await res.json();
    return RegistryEntrySchema.parse(body);
  }

  async search(query: string, limit = 10): Promise<RegistryEntry[]> {
    const res = await fetch(
      `${REGISTRY_BASE}/v0/servers?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
    if (!res.ok) throw new Error(`Registry search failed: ${res.status}`);
    const body: unknown = await res.json();
    const data = RegistrySearchResponseSchema.parse(body);
    return data.servers ?? [];
  }

  resolvePackage(entry: RegistryEntry): ResolvedPackage {
    const pkg = entry.server.packages?.[0];
    if (!pkg) throw new Error(`No package info for ${entry.server.name}`);

    const requiredSecrets = (pkg.environmentVariables ?? [])
      .filter(v => v.isSecret)
      .map(v => v.name);

    if (pkg.registryType === "npm") {
      return {
        command: pkg.runtimeHint ?? "npx",
        args: [
          ...(pkg.runtimeArguments ?? []).map(a => a.value),
          pkg.identifier,
          ...(pkg.packageArguments ?? []).map(a => a.value),
        ],
        requiredSecrets,
      };
    }

    if (pkg.registryType === "oci") {
      return {
        command: "docker",
        args: ["run", "--rm", "-i", pkg.identifier],
        requiredSecrets,
      };
    }

    throw new Error(`Unsupported registry type: ${pkg.registryType}`);
  }
}