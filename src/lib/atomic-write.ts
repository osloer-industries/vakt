import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { assertSafePath } from "./safe-input";

/**
 * Atomically replace a UTF-8 file: write a temp file in the same directory, fsync, then rename.
 * Paths are validated before rename so Sonar path-manipulation rules are satisfied.
 */
export function writeUtf8FileAtomic(filePath: string, content: string): void {
  assertSafePath(filePath);
  assertSafePath(dirname(filePath));
  const tmp = join(
    dirname(filePath),
    `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  assertSafePath(tmp);
  const fd = openSync(tmp, "wx", 0o600);
  try {
    writeSync(fd, content, undefined, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, filePath);
}