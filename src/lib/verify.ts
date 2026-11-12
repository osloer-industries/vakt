import { assertNpmPackageName } from "./safe-input";
import { requireExecutable } from "./safe-exec";
import { runCosignVerify, type CosignVerifyOutput } from "./verify-cosign";

export type VerifyResult =
  | { ok: true; signer: string; source: string }
  | { ok: false; reason: string };

const NPM_REGISTRY = "https://registry.npmjs.org";
const NPM_REGISTRY_HOST = "registry.npmjs.org";

/** Fixed-base URL for npm attestations lookups (blocks SSRF via user input). */
export function buildNpmAttestationsUrl(pkg: string, version?: string): URL {
  if (version !== undefined && !/^[\w.+-]+$/.test(version)) {
    throw new Error(`Invalid package version: ${version}`);
  }
  const encoded = encodeURIComponent(pkg);
  const rel = version
    ? `/-/npm/v1/attestations/${encoded}@${encodeURIComponent(version)}`
    : `/-/npm/v1/attestations/${encoded}`;
  const parsed = new URL(rel, NPM_REGISTRY);
  const attestationsPrefix = "/-/npm/v1/attestations/";
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== NPM_REGISTRY_HOST ||
    parsed.origin !== NPM_REGISTRY ||
    !parsed.pathname.startsWith(attestationsPrefix) ||
    parsed.pathname.includes("..")
  ) {
    throw new Error("Refusing non-registry npm URL");
  }
  return parsed;
}

function cmdAvailable(cmd: string): boolean {
  try {
    requireExecutable(cmd);
    return true;
  } catch {
    return false;
  }
}

export function verifyOci(identifier: string): VerifyResult {
  if (!cmdAvailable("cosign")) {
    return { ok: false, reason: "cosign not installed (brew install cosign)" };
  }
  let r: CosignVerifyOutput;
  try {
    r = runCosignVerify(identifier);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  if (r.status === 0) {
    let signer = "verified";
    try {
      const data = JSON.parse(r.stdout) as unknown[];
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0] as Record<string, unknown>;
        const optional = first["optional"] as Record<string, unknown> | undefined;
        signer = (optional?.["Subject"] as string | undefined) ?? "verified";
      }
    } catch { /* ignore */ }
    return { ok: true, signer, source: "cosign" };
  }
  const reason = ((r.stderr as string) || (r.stdout as string)).trim();
  return { ok: false, reason: `cosign verify failed: ${reason}` };
}

export async function verifyNpm(identifier: string, version?: string): Promise<VerifyResult> {
  let pkg: string;
  try {
    pkg = assertNpmPackageName(identifier);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }

  if (version !== undefined && !/^[\w.+-]+$/.test(version)) {
    return { ok: false, reason: `Invalid package version: ${version}` };
  }

  let requestUrl: URL;
  try {
    requestUrl = buildNpmAttestationsUrl(pkg, version);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }

  try {
    const resp = await fetch(requestUrl, {
      headers: { "User-Agent": "vakt-verify/1.0.0" },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!resp.ok) {
      if (resp.status === 404) return { ok: false, reason: `No attestations found for ${pkg}` };
      return { ok: false, reason: `npm registry error: HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as { attestations?: Array<{ predicateType?: string; bundleMediaType?: string }> };
    const attestations = data.attestations ?? [];
    if (attestations.length === 0) return { ok: false, reason: `No attestations for ${pkg}` };

    const hasSLSA = attestations.some(
      (a) =>
        (a.predicateType ?? "").toLowerCase().includes("slsa") ||
        (a.bundleMediaType ?? "").toLowerCase().includes("slsa"),
    );
    return {
      ok: true,
      signer: hasSLSA ? "npm-registry-slsa" : "npm-registry",
      source: "npm-attestations",
    };
  } catch (e) {
    return { ok: false, reason: `Could not reach npm registry: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function verifyPackage(
  pkgType: "oci" | "npm" | "npx",
  identifier: string,
  version?: string,
): Promise<VerifyResult> {
  if (pkgType === "oci") return verifyOci(identifier);
  return verifyNpm(identifier, version);
}
