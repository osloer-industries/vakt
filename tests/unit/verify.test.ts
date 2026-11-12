import { describe, expect, it } from "bun:test";
import { buildNpmAttestationsUrl, verifyNpm } from "../../src/lib/verify";

describe("buildNpmAttestationsUrl", () => {
  it("fixes attestations requests to registry.npmjs.org", () => {
    const url = buildNpmAttestationsUrl("@scope/pkg", "1.2.3");
    expect(url.origin).toBe("https://registry.npmjs.org");
    expect(url.hostname).toBe("registry.npmjs.org");
    expect(url.pathname).toBe("/-/npm/v1/attestations/%40scope%2Fpkg@1.2.3");
  });

  it("rejects invalid versions before building a URL", () => {
    expect(() => buildNpmAttestationsUrl("pkg", "../../../evil")).toThrow(
      "Invalid package version",
    );
  });
});

describe("verifyNpm", () => {
  it("rejects invalid package names before any network call", async () => {
    const result = await verifyNpm("@scope/../../etc");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Invalid npm package name");
    }
  });
});
