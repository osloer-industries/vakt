import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { AGENTS_DIR } from "./config";

/** Strip control characters for safe terminal/log output (log injection). */
export function sanitizeForLog(value: string): string {
  return value.replace(/\p{Cc}/gu, "?");
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

function rootPrefix(root: string): string {
  const resolved = resolve(root);
  const real = existsSync(resolved) ? realpathSync.native(resolved) : resolved;
  return real.endsWith("/") ? real : `${real}/`;
}

/** Prefix check on resolved paths without following directory symlinks away from allowed roots. */
function ensureUnderAllowedRootsLogical(logicalPath: string, allowedRoots: readonly string[]): string {
  const abs = resolve(logicalPath);
  assertSafePath(abs);
  for (const root of allowedRoots) {
    const resolvedRoot = resolve(root);
    const logicalPrefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
    if (abs === resolvedRoot || abs.startsWith(logicalPrefix)) {
      return abs;
    }
    if (existsSync(resolvedRoot) && existsSync(abs)) {
      const realPrefix = rootPrefix(root);
      const realBase = realPrefix.slice(0, -1);
      const real = realpathSync.native(abs);
      if (real === realBase || real.startsWith(realPrefix)) {
        return abs;
      }
    }
  }
  throw new Error("Path is outside allowed directories");
}

/** Ensure a resolved path stays within one of the allowed directory roots. */
export function ensureUnderAllowedRoots(resolvedPath: string, allowedRoots: readonly string[]): string {
  const real = realpathSync.native(resolvedPath);
  assertSafePath(real);
  for (const root of allowedRoots) {
    const prefix = rootPrefix(root);
    const base = prefix.slice(0, -1);
    if (real === base || real.startsWith(prefix)) {
      return real;
    }
  }
  throw new Error("Path is outside allowed directories");
}

/** Production allowlist: cwd, agents dir, and user home only. */
export function defaultUserPathRoots(agentsDir: string): string[] {
  return [process.cwd(), agentsDir, homedir()];
}

/**
 * Extra directory roots from env, only when {@link VAKT_TEST_MODE} is `1` (e2e / unit harness).
 */
export function testExtraPathRootsFromEnv(): string[] {
  if (process.env.VAKT_TEST_MODE !== "1") {
    return [];
  }
  const raw = process.env.VAKT_EXTRA_PATH_ROOTS ?? "";
  const roots: string[] = [];
  for (const part of raw.split(":")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const abs = resolve(trimmed);
    assertSafePath(abs);
    roots.push(abs);
  }
  return roots;
}

/** Resolved roots for CLI path checks: production roots plus optional test-only extras. */
export function userPathRoots(agentsDir: string): string[] {
  return [...defaultUserPathRoots(agentsDir), ...testExtraPathRootsFromEnv()];
}

/** Resolve a user-supplied file path to an absolute, existing regular file under allowed roots. */
export function resolveReadableFile(userPath: string, allowedRoots: readonly string[]): string {
  if (!userPath || userPath.includes("\0")) {
    throw new Error("Invalid file path");
  }
  rejectParentPathSegments(userPath);
  const abs = resolve(userPath);
  assertSafePath(abs);
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const bounded = ensureUnderAllowedRoots(realpathSync.native(abs), allowedRoots);
  if (!statSync(bounded).isFile()) {
    throw new Error(`Not a file: ${bounded}`);
  }
  return bounded;
}

/** Read a UTF-8 text file after path boundary validation. */
export function readBoundedUtf8File(userPath: string, allowedRoots: readonly string[]): string {
  return readFileSync(resolveReadableFile(userPath, allowedRoots), "utf-8");
}

function assertSafePathSegment(segment: string): void {
  if (!/^[\w.@+ -]+$/.test(segment) || segment === "." || segment === "..") {
    throw new Error("Invalid path segment");
  }
}

/**
 * Resolve a writable file path under allowed roots, creating safe intermediate directories as needed.
 */
export function resolveWritableFileUnderRoots(userPath: string, allowedRoots: readonly string[]): string {
  if (!userPath || userPath.includes("\0")) {
    throw new Error("Invalid file path");
  }
  rejectParentPathSegments(userPath);
  const abs = resolve(userPath);
  assertSafePath(abs);
  const fileName = basename(abs);
  if (!fileName || fileName === "." || fileName === "..") {
    throw new Error("Invalid file path");
  }
  assertSafePathSegment(fileName);

  let probe = dirname(abs);
  let boundedDir: string | undefined;
  const parentDir = dirname(abs);
  while (boundedDir === undefined) {
    if (existsSync(probe)) {
      boundedDir = ensureUnderAllowedRootsLogical(resolve(probe), allowedRoots);
      break;
    }
    const parent = dirname(probe);
    if (parent === probe) {
      throw new Error("Path is outside allowed directories");
    }
    probe = parent;
  }

  const relParts = relative(boundedDir, parentDir).split(sep).filter((part) => part.length > 0 && part !== "..");
  for (const part of relParts) {
    assertSafePathSegment(part);
  }

  let cur = boundedDir;
  for (const part of relParts) {
    cur = join(cur, part);
    assertSafePath(cur);
    if (!existsSync(cur)) {
      mkdirSync(cur);
    }
  }

  const target = join(cur, fileName);
  assertSafePath(target);
  return target;
}

/** Resolve a writable file under default vakt path roots ({@link userPathRoots}). */
export function resolveBoundedWritableFile(userPath: string): string {
  return resolveWritableFileUnderRoots(userPath, userPathRoots(AGENTS_DIR));
}

/** Resolve a user-supplied path to an absolute, existing directory under allowed roots. */
export function resolveLocalDirectory(userPath: string, allowedRoots: readonly string[]): string {
  if (!userPath || userPath.includes("\0")) {
    throw new Error("Invalid path");
  }
  rejectParentPathSegments(userPath);
  const abs = resolve(userPath);
  assertSafePath(abs);
  if (!existsSync(abs)) {
    throw new Error(`Path not found: ${abs}`);
  }
  const bounded = ensureUnderAllowedRoots(realpathSync.native(abs), allowedRoots);
  if (!statSync(bounded).isDirectory()) {
    throw new Error(`Not a directory: ${bounded}`);
  }
  return bounded;
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

export { assertGitRemoteUrl, validatedHttpsGitRemote } from "./safe-input-git";
export {
  assertDockerImageRef,
  assertOciReference,
  validatedOciReference,
} from "./safe-input-oci";

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
    const seg = segments[i];
    if (seg === undefined) continue;
    const parent = segments[i - 1];
    if (parent === "containers" && !DOCKER_PATH_LITERALS.has(seg)) {
      assertDockerResourceId(seg);
    }
    if (parent === "exec" && seg !== "start") {
      assertDockerResourceId(seg);
    }
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

