import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, describe } from "bun:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const oxlintConfig = join(repoRoot, ".oxlintrc.json");
const oxlintExecutable = join(repoRoot, "node_modules", ".bin", "oxlint");
const eslintExecutable = join(repoRoot, "node_modules", ".bin", "eslint");

type CommandResult = {
  status: number;
  output: string;
};

function execCommand(command: string, args: readonly string[], cwd: string): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    status: result.status ?? 1,
    output: `${stdout}${stderr}`,
  };
}

function outputContainsRuleId(output: string, ruleId: string): boolean {
  if (output.includes(ruleId)) {
    return true;
  }
  const slash = ruleId.indexOf("/");
  if (slash === -1) {
    return output.includes(`(${ruleId})`) || output.includes(ruleId);
  }
  const plugin = ruleId.slice(0, slash);
  const rule = ruleId.slice(slash + 1);
  return output.includes(`${plugin}(${rule})`);
}

function assertLintReportsRule(result: CommandResult, expectedRuleId: string): void {
  expect(result.status).toBe(1);
  expect(outputContainsRuleId(result.output, expectedRuleId)).toBe(true);
}

function runOxlintOnFile(filePath: string): CommandResult {
  return execCommand(oxlintExecutable, ["-c", oxlintConfig, filePath], repoRoot);
}

function runEslintOnFile(filePath: string): CommandResult {
  return execCommand(
    eslintExecutable,
    [filePath, "--report-unused-disable-directives-severity", "error"],
    repoRoot,
  );
}

function writeTempOxlintSource(source: string, fileName: string): { filePath: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), "gate-self-ox-"));
  const filePath = join(tempDir, fileName);
  writeFileSync(filePath, source, "utf8");
  return {
    filePath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

/** ESLint flat config only lints files under the repo base path (not system tmpdir). */
function writeTempEslintSource(source: string, fileName: string): { filePath: string; cleanup: () => void } {
  const tempDir = mkdtempSync(join(repoRoot, "scripts", "gate-self-"));
  const filePath = join(tempDir, fileName);
  writeFileSync(filePath, source, "utf8");
  return {
    filePath,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

const consistentTypeAssertionsRule = "typescript/consistent-type-assertions";

describe("gate self-tests (oxlint escape hatches)", () => {
  test.each([
    ["explicit any", "export const value: any = 1;\n", "any.ts", "typescript/no-explicit-any"],
    [
      "ts-ignore",
      "// @ts-ignore\nexport const value: unknown = 1;\n",
      "ts-ignore.ts",
      "typescript/ban-ts-comment",
    ],
    [
      "non-null assertion",
      "declare const maybe: string | undefined;\nexport const forced = maybe!;\n",
      "non-null.ts",
      "typescript/no-non-null-assertion",
    ],
    [
      "upcast as",
      "export const widened = \"x\" as string;\n",
      "as-upcast.ts",
      consistentTypeAssertionsRule,
    ],
    [
      "double cast",
      "export const forced = (\"s\" as unknown) as number;\n",
      "as-double.ts",
      consistentTypeAssertionsRule,
    ],
    [
      "definite-assignment field",
      "export class Holder {\n  value!: number;\n}\n",
      "definite-field.ts",
      "osloer/no-definite-assignment",
    ],
  ] as const)("rejects %s", (_label, source, fileName, ruleId) => {
    const { filePath, cleanup } = writeTempOxlintSource(source, fileName);
    try {
      assertLintReportsRule(runOxlintOnFile(filePath), ruleId);
    } finally {
      cleanup();
    }
  });
});

describe("gate self-tests (allowed type constructs)", () => {
  test("allows as const and satisfies under the blanket assertion ban", () => {
    const { filePath, cleanup } = writeTempOxlintSource(
      'export const modes = ["a", "b"] as const;\nexport const config = { port: 1 } satisfies { port: number };\n',
      "allowed-constructs.ts",
    );
    try {
      const result = runOxlintOnFile(filePath);
      expect(result.status).toBe(0);
    } finally {
      cleanup();
    }
  });
});

const consistentTypeAssertionsEslintRule = "@typescript-eslint/consistent-type-assertions";

describe("gate self-tests (eslint escape hatches)", () => {
  test.each([
    ["upcast as", 'export const widened = "x" as string;\n', consistentTypeAssertionsEslintRule],
    [
      "definite-assignment field",
      "export class Holder {\n  value!: number;\n}\n",
      "no-restricted-syntax",
    ],
  ] as const)("rejects %s", (_label, source, ruleId) => {
    const { filePath, cleanup } = writeTempEslintSource(source, "eslint-probe.ts");
    try {
      assertLintReportsRule(runEslintOnFile(filePath), ruleId);
    } finally {
      cleanup();
    }
  });
});