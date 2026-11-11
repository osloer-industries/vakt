import { assertDockerResourceId, validateDockerApiPath } from "./safe-input";
import { assertDockerImageRef } from "./safe-input-oci";

const DOCKER_PATH_LITERALS = new Set(["containers", "exec", "images", "create", "json", "start", "attach"]);

function sanitizeDockerImageCreateQuery(query: string): string {
  const params = new URLSearchParams(query);
  const img = params.get("fromImage");
  if (!img) {
    throw new Error("Invalid Docker API path");
  }
  const decoded = decodeURIComponent(img);
  assertDockerImageRef(decoded);
  return `?${new URLSearchParams({ fromImage: decoded }).toString()}`;
}

function appendDockerQuery(pathname: string, query: string): string {
  if (pathname === "/images/create") {
    return sanitizeDockerImageCreateQuery(query);
  }
  if (query === "force=true") {
    return "?force=true";
  }
  if (pathname === "/containers/json" && query.startsWith("filters=")) {
    if (query.includes("..") || query.includes("\0")) {
      throw new Error("Invalid Docker API path");
    }
    return `?${query}`;
  }
  throw new Error("Invalid Docker API path");
}

function safeDockerSegment(seg: string, parent: string | undefined): string {
  const needsId =
    (parent === "containers" && !DOCKER_PATH_LITERALS.has(seg)) ||
    (parent === "exec" && seg !== "start");
  if (!needsId) {
    return seg;
  }
  assertDockerResourceId(seg);
  return seg.toLowerCase();
}

/**
 * Rebuild a Docker Engine API path from validated segments (breaks taint for fetch URLs).
 */
export function rebuildDockerApiPath(path: string): string {
  const qIndex = path.indexOf("?");
  const pathname = qIndex >= 0 ? path.slice(0, qIndex) : path;
  validateDockerApiPath(pathname);
  const segments = pathname.split("/").filter(Boolean);
  const rebuilt = segments.map((seg, i) => safeDockerSegment(seg, segments[i - 1]));
  let out = `/${rebuilt.join("/")}`;
  if (qIndex >= 0) {
    out += appendDockerQuery(pathname, path.slice(qIndex + 1));
  }
  return out;
}

/** Build a validated Docker exec start API path from an engine exec id. */
export function buildDockerExecStartPath(execId: string): string {
  assertDockerResourceId(execId);
  return rebuildDockerApiPath(`/exec/${execId.toLowerCase()}/start`);
}
