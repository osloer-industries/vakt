import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  sanitizeForLog,
  assertSafePath,
  resolveReadableFile,
  resolveLocalDirectory,
  assertSafeSkillName,
  assertGitRemoteUrl,
  assertDockerResourceId,
  assertDockerApiPath,
  assertOciReference,
  assertNpmPackageName,
  defaultUserPathRoots,
  testExtraPathRootsFromEnv,
  userPathRoots,
} from "./safe-input";

function testRoots(tmp: string): string[] {
  return [tmp];
}

describe("userPathRoots", () => {
  it("production roots exclude tmpdir", () => {
    const roots = defaultUserPathRoots("/home/user/.agents");
    expect(roots).not.toContain("/tmp");
    expect(roots).toHaveLength(3);
  });

  it("ignores extra roots unless VAKT_TEST_MODE is set", () => {
    const prevMode = process.env.VAKT_TEST_MODE;
    const prevExtra = process.env.VAKT_EXTRA_PATH_ROOTS;
    delete process.env.VAKT_TEST_MODE;
    process.env.VAKT_EXTRA_PATH_ROOTS = "/tmp";
    expect(testExtraPathRootsFromEnv()).toEqual([]);
    const withTest = userPathRoots("/home/user/.agents");
    expect(withTest).toHaveLength(3);
    process.env.VAKT_TEST_MODE = "1";
    expect(testExtraPathRootsFromEnv()).toContain("/tmp");
    process.env.VAKT_TEST_MODE = prevMode;
    process.env.VAKT_EXTRA_PATH_ROOTS = prevExtra;
  });
});

describe("sanitizeForLog", () => {
  it("strips newlines and control characters", () => {
    expect(sanitizeForLog("a\nb\rc")).toBe("a?b?c");
  });
});

describe("resolveReadableFile", () => {
  it("rejects path traversal segments before resolve", () => {
    expect(() => resolveReadableFile("../../etc/passwd", [process.cwd()])).toThrow();
  });

  it("resolves an existing file", () => {
    const tmp = mkdtempSync("/tmp/vakt-safe-");
    const f = join(tmp, "plan.md");
    writeFileSync(f, "# plan");
    const resolved = resolveReadableFile(f, testRoots(tmp));
    expect(resolved.endsWith("plan.md")).toBe(true);
    rmSync(tmp, { recursive: true });
  });
});

describe("resolveLocalDirectory", () => {
  it("rejects non-directories", () => {
    const tmp = mkdtempSync("/tmp/vakt-safe-");
    const f = join(tmp, "file.txt");
    writeFileSync(f, "x");
    expect(() => resolveLocalDirectory(f, testRoots(tmp))).toThrow("Not a directory");
    rmSync(tmp, { recursive: true });
  });
});

describe("assertSafeSkillName", () => {
  it("rejects traversal in name", () => {
    expect(() => assertSafeSkillName("../evil")).toThrow();
    expect(() => assertSafeSkillName("foo/bar")).toThrow();
  });

  it("accepts simple names", () => {
    expect(assertSafeSkillName("my-skill")).toBe("my-skill");
  });
});

describe("assertGitRemoteUrl", () => {
  it("accepts https remotes", () => {
    expect(() => assertGitRemoteUrl("https://github.com/org/repo.git")).not.toThrow();
  });

  it("rejects javascript urls", () => {
    expect(() => assertGitRemoteUrl("https://evil.com/$(rm -rf /)")).toThrow();
  });
});

describe("assertDockerResourceId", () => {
  it("rejects traversal-shaped ids", () => {
    expect(() => assertDockerResourceId("../../../etc/passwd")).toThrow();
  });

  it("accepts hex ids", () => {
    expect(() => assertDockerResourceId("abc123def456")).not.toThrow();
  });
});

describe("assertDockerApiPath", () => {
  it("rejects parent segments", () => {
    expect(() => assertDockerApiPath("/containers/../secrets")).toThrow();
  });
});

describe("assertNpmPackageName", () => {
  it("rejects path-like package names", () => {
    expect(() => assertNpmPackageName("@scope/../../etc")).toThrow();
  });

  it("strips npx -y prefix", () => {
    expect(assertNpmPackageName("-y @scope/pkg")).toBe("@scope/pkg");
  });
});

describe("assertOciReference", () => {
  it("rejects shell metacharacters", () => {
    expect(() => assertOciReference("img;rm -rf")).toThrow();
  });
});

describe("assertSafePath", () => {
  it("rejects relative paths", () => {
    expect(() => assertSafePath("relative")).toThrow();
  });
});
