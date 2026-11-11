import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

/** Strip control characters for safe terminal/log output (log injection). */
export function sanitizeForLog(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]/g, "?");
}

function rejectParentPathSegments(userPath: string): void {
  if (/(^|[\\/])\.\.([\\/]|$)/.test(userPath)) {
    throw new Error("Path traversal rejected");
  }
}

/**
 * Validates that a path is safe to pass to spawnSync as a directory argument.
 * Rejects relative paths and paths containing shell metacharacters.
 */
export function assertSafePath(p: string): void {
  if (!p.startsWith("/") || /[;&|`$<>]/.test(p)) {
    throw new Error(`Unsafe path rejected: ${p}`);
  }
}

/** Resolve a user-supplied file path to an absolute, existing regular file. */
export function resolveReadableFile(userPath: string): string {
  if (!userPath || userPath.includes("\0")) {
    throw new Error("Invalid file path");
  }
  rejectParentPathSegments(userPath);
  const abs = resolve(userPath);
  assertSafePath(abs);
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const st = statSync(abs);
  if (!st.isFile()) {
    throw new Error(`Not a file: ${abs}`);
  }
  return realpathSync.native(abs);
}

/** Resolve a user-supplied path to an absolute, existing directory. */
export function resolveLocalDirectory(userPath: string): string {
  if (!userPath || userPath.includes("\0")) {
    throw new Error("Invalid path");
  }
  rejectParentPathSegments(userPath);
  const abs = resolve(userPath);
  assertSafePath(abs);
  if (!existsSync(abs)) {
    throw new Error(`Path not found: ${abs}`);
  }
  const st = statSync(abs);
  if (!st.isDirectory()) {
    throw new Error(`Not a directory: ${abs}`);
  }
  return realpathSync.native(abs);
}

/** Skill name must be a single path segment (no slashes or traversal). */
export function assertSafeSkillName(name: string): string {
  const base = basename(name);
  if (base !== name || base === "." || base === ".." || base.length === 0) {
    throw new Error(`Invalid skill name: ${name}`);
  }
  if (!/^[\w.-]+$/.test(base)) {
    throw new Error(`Invalid skill name: ${name}`);
  }
  return base;
}

const GIT_HTTPS = /^https:\/\/[\w.-]+(\/[\w.\-/]+)*(\.git)?\/?$/;
const GIT_SSH = /^git@[\w.-]+:[\w.\-/]+(\.git)?$/;

export function assertGitRemoteUrl(url: string): void {
  if (GIT_HTTPS.test(url) || GIT_SSH.test(url)) return;
  throw new Error(`Unsupported or invalid git URL: ${url}`);
}

const DOCKER_ID = /^[a-f0-9]{12,64}$/i;

export function assertDockerResourceId(id: string): void {
  if (!DOCKER_ID.test(id)) {
    throw new Error("Invalid Docker resource id");
  }
}

/** Docker Engine HTTP API path — fixed prefix segments only, no traversal. */
export function assertDockerApiPath(path: string): void {
  if (!path.startsWith("/") || path.includes("..") || path.includes("\0")) {
    throw new Error("Invalid Docker API path");
  }
  if (/%2e/i.test(path) || /%2f/i.test(path)) {
    throw new Error("Invalid Docker API path");
  }
}

const DOCKER_PATH_LITERALS = new Set(["containers", "exec", "images", "create", "json", "start", "attach"]);

/** Validate dynamic id segments in Docker API paths returned from or sent to the engine. */
export function validateDockerApiPath(path: string): void {
  assertDockerApiPath(path);
  const pathname = path.split("?")[0] ?? path;
  const segments = pathname.split("/").filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const parent = segments[i - 1];
    if (parent === "containers" && !DOCKER_PATH_LITERALS.has(seg)) {
      assertDockerResourceId(seg);
    }
    if (parent === "exec" && seg !== "start") {
      assertDockerResourceId(seg);
    }
  }
}

const OCI_REF =
  /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*)(?::[\w][\w.\-]{0,127})?(?:@sha256:[a-f0-9]{64})?$/i;

export function assertOciReference(ref: string): void {
  const trimmed = ref.trim();
  if (!OCI_REF.test(trimmed)) {
    throw new Error(`Invalid OCI image reference: ${ref}`);
  }
}

const NPM_PKG = /^(?:@[\w.-]+\/)?[\w.-]+$/;

export function assertNpmPackageName(pkg: string): string {
  const cleaned = pkg.replace(/^-y\s+/, "").trim();
  if (!NPM_PKG.test(cleaned) || cleaned.length > 214) {
    throw new Error(`Invalid npm package name: ${pkg}`);
  }
  return cleaned;
}

const DOCKER_IMAGE =
  /^[\w][\w.\-/]*(?::[\w][\w.\-]*)?(@sha256:[a-f0-9]{64})?$/;

export function assertDockerImageRef(image: string): void {
  if (!DOCKER_IMAGE.test(image)) {
    throw new Error(`Invalid Docker image reference: ${image}`);
  }
}
