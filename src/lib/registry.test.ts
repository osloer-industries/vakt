import { describe, it, expect } from "bun:test";
import { RegistryClient } from "./registry";
import { RegistryEntrySchema } from "./schemas";

function withMockFetch(mock: typeof fetch, fn: () => Promise<void>): Promise<void> {
  const origFetch = globalThis.fetch;
  globalThis.fetch = mock;
  return fn().finally(() => {
    globalThis.fetch = origFetch;
  });
}

const fetch404: typeof fetch = () => Promise.resolve(new Response(null, { status: 404 }));
const fetch500: typeof fetch = () => Promise.resolve(new Response(null, { status: 500 }));
const fetch503: typeof fetch = () => Promise.resolve(new Response(null, { status: 503 }));
const fetchEmptyJson: typeof fetch = () =>
  Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));

function fetchJson(payload: unknown): typeof fetch {
  return () => Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
}

describe("RegistryClient", () => {
  it("builds the correct lookup URL", () => {
    const client = new RegistryClient();
    expect(client.lookupUrl("io.github.modelcontextprotocol/server-github"))
      .toBe("https://registry.modelcontextprotocol.io/v0/servers/io.github.modelcontextprotocol%2Fserver-github");
  });

  it("resolves command and args from an npm package entry", () => {
    const entry = RegistryEntrySchema.parse({
      server: {
        name: "io.github.test/server",
        packages: [{
          registryType: "npm",
          identifier: "@modelcontextprotocol/server-github",
          version: "0.6.2",
          runtimeHint: "npx",
          runtimeArguments: [{ value: "-y" }],
          packageArguments: [],
          environmentVariables: [
            { name: "GITHUB_PERSONAL_ACCESS_TOKEN", isSecret: true, isRequired: true },
          ],
        }],
      },
    });
    const resolved = new RegistryClient().resolvePackage(entry);
    expect(resolved.command).toBe("npx");
    expect(resolved.args).toContain("-y");
    expect(resolved.args).toContain("@modelcontextprotocol/server-github");
    expect(resolved.requiredSecrets).toContain("GITHUB_PERSONAL_ACCESS_TOKEN");
  });

  it("resolves docker run for an OCI package entry", () => {
    const entry = RegistryEntrySchema.parse({
      server: {
        name: "io.example/server",
        packages: [{
          registryType: "oci",
          identifier: "docker.io/example/server:1.0.0",
          environmentVariables: [],
        }],
      },
    });
    const resolved = new RegistryClient().resolvePackage(entry);
    expect(resolved.command).toBe("docker");
    expect(resolved.args).toContain("docker.io/example/server:1.0.0");
  });
});

describe("RegistryClient.resolvePackage — error paths", () => {
  it("throws when entry has no packages", () => {
    const entry = RegistryEntrySchema.parse({ server: { name: "no-pkg" } });
    expect(() => new RegistryClient().resolvePackage(entry)).toThrow("No package info");
  });

  it("throws for unsupported registry type", () => {
    const entry = RegistryEntrySchema.parse({
      server: {
        name: "exotic",
        packages: [{ registryType: "npm", identifier: "chart/server" }],
      },
    });
    const pkg = entry.server.packages?.[0];
    if (pkg) Reflect.set(pkg, "registryType", "helm");
    expect(() => new RegistryClient().resolvePackage(entry)).toThrow("Unsupported registry type");
  });
});

describe("RegistryClient.lookup", () => {
  it("returns null on 404", async () => {
    const client = new RegistryClient();
    await withMockFetch(fetch404, async () => {
      expect(await client.lookup("nonexistent/server")).toBeNull();
    });
  });

  it("throws on non-404 HTTP error", async () => {
    const client = new RegistryClient();
    await withMockFetch(fetch500, async () => {
      let threw = false;
      try {
        await client.lookup("bad/server");
      } catch (err) {
        threw = err instanceof Error && err.message.includes("Registry 500");
      }
      expect(threw).toBe(true);
    });
  });

  it("returns parsed entry on success", async () => {
    const client = new RegistryClient();
    const payload = { server: { name: "test/server", packages: [] } };
    await withMockFetch(fetchJson(payload), async () => {
      const result = await client.lookup("test/server");
      expect(result?.server.name).toBe("test/server");
    });
  });
});

describe("RegistryClient.search", () => {
  it("returns servers array on success", async () => {
    const client = new RegistryClient();
    const payload = { servers: [{ server: { name: "result/server" } }] };
    await withMockFetch(fetchJson(payload), async () => {
      const results = await client.search("test query");
      expect(results).toHaveLength(1);
    });
  });

  it("returns empty array when servers key is absent", async () => {
    const client = new RegistryClient();
    await withMockFetch(fetchEmptyJson, async () => {
      expect(await client.search("nothing")).toHaveLength(0);
    });
  });

  it("throws on HTTP error", async () => {
    const client = new RegistryClient();
    await withMockFetch(fetch503, async () => {
      let threw = false;
      try {
        await client.search("q");
      } catch (err) {
        threw = err instanceof Error && err.message.includes("Registry search failed");
      }
      expect(threw).toBe(true);
    });
  });
});