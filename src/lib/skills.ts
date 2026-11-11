import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeSync,
  writeFileSync,
} from "node:fs";
import { join, basename, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { assertSafePath } from "./safe-input";
import { requireExecutable, safeSpawnEnv } from "./safe-exec";

export { assertSafePath } from "./safe-input";

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * Returns key-value pairs from the --- block.
 * Lightweight — no full YAML parser needed for simple scalar values.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") return {};
  const result: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") break;
    const kv = (/^(\w[\w-]*):\s*(.+)/).exec(lines[i]!);
    if (kv) result[kv[1]!] = kv[2]!.trim();
  }
  return result;
}

// ── Skill metadata (includes array fields) ──────────────────────────────────

export interface SkillMeta {
  name?: string;
  description?: string;
  version?: string;
  /** Claude Code `allowed-tools` frontmatter — other platforms ignore it. */
  allowedTools?: string[];
}

export interface SkillHazard {
  file: string;
  pattern: string;
  line: number;
}

/** Inline array: `[Bash, Read, Write]` — string-only, no regex */
function parseInlineArray(value: string): string[] | null {
  if (!value.startsWith("[") || !value.endsWith("]")) return null;
  return value.slice(1, -1).split(",").map(s => s.trim()).filter(Boolean);
}

/** True if s is a valid YAML frontmatter key ([\w-]+ without regex). */
function isValidKey(s: string): boolean {
  if (s.length === 0 || s.length > 64) return false;
  for (let j = 0; j < s.length; j++) {
    const c = s.charCodeAt(j);
    const ok = (c >= 65 && c <= 90)   // A-Z
             || (c >= 97 && c <= 122)  // a-z
             || (c >= 48 && c <= 57)   // 0-9
             || c === 45               // -
             || c === 95;              // _
    if (!ok) return false;
  }
  return true;
}

/** Parse a YAML block-array starting at lines[startIndex]. Returns items and next line index. */
function parseBlockArray(lines: string[], startIndex: number): { items: string[]; nextIndex: number } {
  const items: string[] = [];
  let i = startIndex;
  while (i < lines.length) {
    const itemLine = lines[i]!.trimStart();
    if (!itemLine.startsWith("- ")) break;
    items.push(itemLine.slice(2).trim());
    i++;
  }
  return { items, nextIndex: i };
}

/** Apply a scalar or inline-array frontmatter field to meta in-place. */
function applyScalarField(meta: SkillMeta, key: string, trimmed: string): void {
  if (key === "allowed-tools") {
    const arr = parseInlineArray(trimmed);
    if (arr) meta.allowedTools = arr;
  } else if (key === "name")        { meta.name        = trimmed; }
  else if (key === "description")   { meta.description = trimmed; }
  else if (key === "version")       { meta.version     = trimmed; }
}

/**
 * Parse all structured frontmatter from a SKILL.md content string,
 * including the `allowed-tools` array field (inline or block style).
 * Uses only string operations — no regex — to guarantee linear runtime.
 */
export function parseSkillFrontmatter(content: string): SkillMeta {
  const meta: SkillMeta = {};
  // Extract frontmatter block using indexOf (avoids multi-line regex ReDoS)
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return meta;
  const bodyStart = content.indexOf("\n") + 1;
  const endMarker = content.indexOf("\n---", bodyStart);
  if (endMarker === -1) return meta;
  const block = content.slice(bodyStart, endMarker);

  const lines = block.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const colonPos = line.indexOf(":");
    if (colonPos <= 0) { i++; continue; }

    const key = line.slice(0, colonPos);
    if (!isValidKey(key)) { i++; continue; }

    const rest = line.slice(colonPos + 1).trimStart();
    if (rest === "") {
      const { items, nextIndex } = parseBlockArray(lines, i + 1);
      if (key === "allowed-tools" && items.length) meta.allowedTools = items;
      i = nextIndex;
      continue;
    }

    applyScalarField(meta, key, rest.trim());
    i++;
  }
  return meta;
}

/** Read and parse SKILL.md from a skill directory. Returns `{}` if missing. */
export function readSkillMeta(skillDir: string): SkillMeta {
  assertSafePath(skillDir);
  const skillMd = join(skillDir, "SKILL.md");
  if (!existsSync(skillMd)) return {};
  return parseSkillFrontmatter(readFileSync(skillMd, "utf-8"));
}

/**
 * Scan a skill directory for static hazard patterns in SKILL.md and
 * bundled scripts. Returns an array of findings; empty means no issues.
 *
 * Note: this is best-effort heuristic analysis — it cannot catch all
 * dangerous instructions, and some findings may be false positives.
 */
function checkPipeToShell(lo: string): string | null {
  if (!lo.includes("| sh") && !lo.includes("|sh") && !lo.includes("| bash") && !lo.includes("|bash")) return null;
  if (lo.includes("curl"))  return "curl-pipe-sh";
  if (lo.includes("wget"))  return "wget-pipe-sh";
  if (lo.includes("base64") && lo.includes("-d")) return "base64-pipe-sh";
  return null;
}

function checkRmRfAbsolute(lo: string): string | null {
  if (!lo.includes("/")) return null;
  const rmAt = lo.indexOf("rm ");
  if (rmAt === -1) return null;
  const pre = rmAt > 0 ? lo.charCodeAt(rmAt - 1) : 32;
  const preIsLetter = (pre >= 97 && pre <= 122) || (pre >= 65 && pre <= 90);
  if (preIsLetter) return null;
  const look = lo.slice(rmAt + 3, rmAt + 27).trimStart();
  if (look.startsWith("-") && look.includes("r") && lo.indexOf("/", rmAt) > rmAt) return "rm-rf-absolute";
  return null;
}

function checkEvalExec(lo: string, line: string): string | null {
  const evalAt = lo.indexOf("eval");
  if (evalAt === -1) return null;
  const pre = evalAt > 0 ? lo.charCodeAt(evalAt - 1) : 32;
  const preIsWord = (pre >= 97 && pre <= 122) || (pre >= 48 && pre <= 57) || pre === 95;
  if (preIsWord) return null;
  let j = evalAt + 4;
  while (j < line.length && (line[j] === " " || line[j] === "\t")) j++;
  return '"\'`$('.includes(line[j] ?? "") ? "eval-exec" : null;
}

function checkSubshellCurl(lo: string, line: string): string | null {
  if (lo.includes("curl") && (line.includes("$(") || line.includes("`"))) return "subshell-curl";
  return null;
}

/**
 * Linear-time hazard check on a single line.
 * Uses string operations only (indexOf / includes / charCodeAt) so the
 * runtime is O(n) in the line length — no regex backtracking risk.
 */
function findLineHazard(line: string): string | null {
  const lo = line.toLowerCase();
  return checkPipeToShell(lo)
    ?? checkRmRfAbsolute(lo)
    ?? checkEvalExec(lo, line)
    ?? checkSubshellCurl(lo, line);
}

export function scanSkillHazards(skillDir: string): SkillHazard[] {
  const hazards: SkillHazard[] = [];

  function scanFile(filePath: string): void {
    if (!existsSync(filePath)) return;
    const lines = readFileSync(filePath, "utf-8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const label = findLineHazard(lines[i]!);
      if (label) hazards.push({ file: basename(filePath), pattern: label, line: i + 1 });
    }
  }

  // Scan SKILL.md content (catches instructions directing the agent)
  scanFile(join(skillDir, "SKILL.md"));

  // Scan all bundled scripts
  const scriptsDir = join(skillDir, "scripts");
  if (existsSync(scriptsDir)) {
    for (const f of readdirSync(scriptsDir)) {
      const full = join(scriptsDir, f);
      if (statSync(full).isFile()) scanFile(full);
    }
  }

  return hazards;
}

/**
 * Returns true if a skill directory should be synced globally.
 * Skills without a SKILL.md or without a `global` field default to true
 * (preserves backwards compatibility).
 * Set `global: false` in SKILL.md frontmatter to make a skill local-only.
 */
export function isSkillGlobal(skillDir: string): boolean {
  const skillMd = join(skillDir, "SKILL.md");
  if (!existsSync(skillMd)) return true;
  const content = readFileSync(skillMd, "utf-8");
  const fm = parseFrontmatter(content);
  if (!("global" in fm)) return true;
  return fm["global"] !== "false";
}

/**
 * Returns true if a skill has an explicit `global:` field in its SKILL.md.
 * Skills without this field are "unclassified" and should trigger a prompt during sync/add.
 */
export function isSkillClassified(skillDir: string): boolean {
  const skillMd = join(skillDir, "SKILL.md");
  if (!existsSync(skillMd)) return false;
  const content = readFileSync(skillMd, "utf-8");
  const fm = parseFrontmatter(content);
  return "global" in fm;
}

/**
 * Write or update the `global:` field in a skill's SKILL.md frontmatter.
 * Creates SKILL.md if it does not exist.
 */
/**
 * Build a clean environment for git subprocess calls that strips any inherited
 * GIT_DIR / GIT_WORK_TREE overrides so that isGitRepo correctly detects
 * whether a directory is itself a git repo.
 */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = safeSpawnEnv();
  delete env["GIT_DIR"];
  delete env["GIT_WORK_TREE"];
  delete env["GIT_INDEX_FILE"];
  delete env["GIT_OBJECT_DIRECTORY"];
  return env;
}

function gitBinary(): string {
  return requireExecutable("git");
}

function writeUtf8FileAtomic(filePath: string, content: string): void {
  assertSafePath(filePath);
  assertSafePath(dirname(filePath));
  const tmp = join(
    dirname(filePath),
    `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  const fd = openSync(tmp, "wx", 0o600);
  try {
    writeSync(fd, content, undefined, "utf-8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, filePath);
}

/**
 * Returns true if the given directory is a git repository.
 */
export function isGitRepo(skillDir: string): boolean {
  assertSafePath(skillDir);
  const result = spawnSync(gitBinary(), ["-C", skillDir, "rev-parse", "--git-dir"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
    env: cleanGitEnv(),
  });
  return result.status === 0;
}

export type SkillUpdateInfo = {
  behind: number;       // number of commits behind upstream
  filesSummary: string; // e.g. "SKILL.md, README.md (+2 more)"
};

/**
 * Fetches from origin and returns info about how far behind the local branch is.
 * Returns null if not a git repo, no remote, or already up to date.
 */
export function fetchAndCheckSkill(skillDir: string): SkillUpdateInfo | null {
  assertSafePath(skillDir);
  if (!isGitRepo(skillDir)) return null;

  // git fetch origin (silent — ignore errors if no network)
  spawnSync(gitBinary(), ["-C", skillDir, "fetch", "origin"], {
    encoding: "utf-8",
    stdio: "ignore",
    env: cleanGitEnv(),
  });

  // Count commits behind
  const behindResult = spawnSync(
    gitBinary(), ["-C", skillDir, "rev-list", "--count", "HEAD..@{u}"],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], env: cleanGitEnv() },
  );
  if (behindResult.status !== 0) return null;
  const behind = Number.parseInt(behindResult.stdout.trim(), 10);
  if (Number.isNaN(behind) || behind === 0) return null;

  // Get changed files summary
  const filesResult = spawnSync(
    gitBinary(), ["-C", skillDir, "diff", "--name-only", "HEAD..@{u}"],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], env: cleanGitEnv() },
  );
  const files = (filesResult.stdout ?? "").trim().split("\n").filter(Boolean);
  const filesSummary = files.length <= 3
    ? files.join(", ")
    : `${files.slice(0, 3).join(", ")} (+${files.length - 3} more)`;

  return { behind, filesSummary };
}

/**
 * Pulls the latest changes for a skill directory (fast-forward only).
 * Returns true on success.
 */
export function pullSkill(skillDir: string): boolean {
  assertSafePath(skillDir);
  const result = spawnSync(gitBinary(), ["-C", skillDir, "pull", "--ff-only"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: cleanGitEnv(),
  });
  return result.status === 0;
}

export function setSkillGlobal(skillDir: string, value: boolean): void {
  assertSafePath(skillDir);
  const skillMd = join(skillDir, "SKILL.md");
  if (!existsSync(skillMd)) {
    writeUtf8FileAtomic(skillMd, `---\nname: ${basename(skillDir)}\nglobal: ${value}\n---\n`);
    return;
  }
  let content = readFileSync(skillMd, "utf-8");
  if (content.startsWith("---")) {
    if (content.includes("\nglobal:")) {
      // Replace existing global line
      content = content.replace(/\nglobal: (true|false)/, `\nglobal: ${value}`);
    } else {
      // Inject after opening ---
      content = content.replace(/^---\r?\n/, `---\nglobal: ${value}\n`);
    }
    writeUtf8FileAtomic(skillMd, content);
  } else {
    writeUtf8FileAtomic(skillMd, `---\nglobal: ${value}\n---\n\n` + content);
  }
}
