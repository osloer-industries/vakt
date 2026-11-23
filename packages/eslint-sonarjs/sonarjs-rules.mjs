/** @typedef {import("eslint").Linter.RuleEntry} RuleEntry */

/** Type-aware rules (TypeScript sources only). @type {Readonly<Record<string, RuleEntry>>} */
const sonarTypeScriptTypeAwareRules = {
  "@typescript-eslint/require-await": "error",
  "@typescript-eslint/prefer-regexp-exec": "error",
};

/** SonarJS rules previously enforced via root `eslint.config.mjs` (parity with pre–TS 7 lint). */
const vaktSonarjsRules = {
  "sonarjs/cognitive-complexity": ["error", 15],
  "sonarjs/no-inverted-boolean-check": "error",
  "sonarjs/no-ignored-return": "error",
  "sonarjs/no-identical-functions": "error",
  "sonarjs/prefer-single-boolean-return": "error",
  "sonarjs/prefer-immediate-return": "error",
  "sonarjs/no-small-switch": "error",
};

export function buildSonarjsTypeScriptFlatRules() {
  return {
    ...vaktSonarjsRules,
    ...sonarTypeScriptTypeAwareRules,
  };
}