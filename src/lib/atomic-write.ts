import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { AGENTS_DIR } from "./config";
import {
  assertSafePath,
  resolveWritableFileUnderRoots,
  userPathRoots,
} from "./safe-input";

/**
 * Atomically replace a UTF-8 file: write a temp file in the same directory, fsync, then rename.
 */
export function writeUtf8FileAtomic(
  filePath: string,
  content: string,
  allowedRoots?: readonly string[],
): void {
  const roots = allowedRoots ?? userPathRoots(AGENTS_DIR);
  const target = resolveWritableFileUnderRoots(filePath, roots);
  const dir = dirname(target);
  assertSafePath(dir);
  const tmp = join(dir, `.${basename(target)}.${randomBytes(16).toString("hex")}.tmp`);
  assertSafePath(tmp);
  const fd = openSync(tmp, "wx", 0o600);
  try {
    writeSync(fd, content, undefined, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, target);
}