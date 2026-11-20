import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { assertSafePath, resolveBoundedWritableFile } from "./safe-input";

/**
 * Atomically replace a UTF-8 file: write a temp file in the same directory, fsync, then rename.
 * Target and temp paths are resolved through {@link resolveBoundedWritableFile} before I/O.
 */
export function writeUtf8FileAtomic(filePath: string, content: string): void {
  const target = resolveBoundedWritableFile(filePath);
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