# eslint-sonarjs (local package)

Runs the SonarJS rules and type-aware checks that previously lived in root `eslint.config.mjs` against `src/`,
plus vakt-specific `no-restricted-syntax` guards for Bun compiled binaries.

This package pins **TypeScript 6** for `@typescript-eslint/parser` because TypeScript 7 is not yet supported by
typescript-eslint. The repository root keeps **TypeScript 7** for typechecking via oxlint-tsgolint.

From the repository root:

```sh
bun run lint:sonarjs
```

The root `lint:sonarjs` script runs `npm ci --ignore-scripts` in this directory when needed, then `run.mjs`.