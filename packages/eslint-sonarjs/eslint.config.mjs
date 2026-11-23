import path from "node:path";
import { fileURLToPath } from "node:url";

import tsParser from "@typescript-eslint/parser";
import tseslint from "@typescript-eslint/eslint-plugin";
import sonarjs from "eslint-plugin-sonarjs";

import { buildSonarjsTypeScriptFlatRules } from "./sonarjs-rules.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const recommended = sonarjs.configs.recommended;
const sonarTsRules = buildSonarjsTypeScriptFlatRules();

const tsFiles = ["src/**/*.ts"];

const sonarPlugins = {
  ...recommended.plugins,
  "@typescript-eslint": tseslint,
};

const testIgnores = ["**/*.test.ts", "dist/**", "coverage/**", "node_modules/**"];

/** Bun compiled-binary safety (eslint AST selectors; no oxlint equivalent). */
const vaktProductionRules = {
  "no-restricted-syntax": [
    "error",
    {
      selector: "TSAsExpression > TSAsExpression",
      message:
        "Double type assertions (`as unknown as T`) are banned. Parse with Zod or narrow with a type guard.",
    },
    {
      selector:
        "MemberExpression[object.type='MetaProperty'][object.meta.name='import'][object.property.name='meta'][property.name='dir']",
      message:
        "import.meta.dir is '/$bunfs/root' in compiled Bun binaries. Use a static import for bundled assets.",
    },
    {
      selector:
        "MemberExpression[property.name='pathname'][object.type='NewExpression'][object.callee.name='URL'] > NewExpression > MemberExpression[object.type='MetaProperty'][object.meta.name='import'][object.property.name='meta'][property.name='url']",
      message:
        "new URL(..., import.meta.url).pathname resolves into /$bunfs in compiled Bun binaries. Use a static import for bundled assets or Bun.main for self-exec paths.",
    },
  ],
};

export default [
  {
    ignores: testIgnores,
  },
  {
    name: "sonarjs/shift-left-ts",
    files: tsFiles,
    plugins: sonarPlugins,
    rules: sonarTsRules,
    settings: recommended.settings ?? {},
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: repoRoot,
      },
    },
  },
  {
    name: "vakt/bun-binary-safety",
    files: ["src/**/*.ts"],
    rules: vaktProductionRules,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: repoRoot,
      },
    },
  },
];