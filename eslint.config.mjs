/*
 * ESLint configuration, following the GDS Way JavaScript linting guidance:
 * https://gds-way.digital.cabinet-office.gov.uk/manuals/programming-languages/js.html#linting
 *
 * The GDS page names two ways to adopt the StandardJS conventions: the
 * `standard` CLI, or ESLint directly with `eslint-config-standard`. This
 * repository is TypeScript, which `standard`/`standardx` cannot parse, so we
 * take the ESLint route the page explicitly offers: `eslint-config-standard`
 * for the plain-.mjs scripts under scripts/, and `typescript-eslint`
 * (type-checked, wired to each package's own tsconfig) for .ts sources and
 * tests. `eslint-config-prettier` is loaded LAST on every file, per the same
 * page ("the eslint-config-prettier ensures there'll be no conflicts between
 * the rules of ESLint and the formatting of Prettier"): formatting belongs to
 * prettier (`pnpm format`), correctness to the linter (`pnpm lint`).
 *
 * Linting is read-only by design. Never run eslint with --fix from `lint`.
 */
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: rootDir });

// The StandardJS rule set, as published by eslint-config-standard. Its three
// rule-source plugins (import, n, promise) are devDependencies here.
const standard = compat.extends("eslint-config-standard");

export default tseslint.config(
  {
    // Build output, installed modules and the local pnpm store are never
    // sources. README-only packages have nothing to lint.
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/lib/",
      "**/build/",
      "**/.pnpm-store/",
      "**/.dsh/",
      "packages/aidos/**",
      "packages/blocks/**",
      "packages/cli/**",
      "packages/plugins/**",
    ],
  },

  // Plain JavaScript: the StandardJS conventions.
  ...standard.map((entry) => ({ ...entry, files: ["**/*.mjs", "**/*.js"] })),

  // TypeScript: typescript-eslint with type information, which is what makes
  // no-floating-promises possible. projectService reuses each package's own
  // tsconfig rather than creating a second source of truth.
  ...tseslint.configs.recommendedTypeChecked.map((entry) => ({
    ...entry,
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      ...entry.languageOptions,
      parserOptions: {
        // Files that sit outside every package tsconfig (the vitest configs
        // and the website tests) still get full type-aware parsing through a
        // default project.
        projectService: {
          allowDefaultProject: [
            "vitest.config.ts",
            "packages/tokens/vitest.config.ts",
            "website/vitest.config.ts",
          ],
        },
        tsconfigRootDir: rootDir,
      },
    },
  })),

  // Unused variables are a correctness smell, not a formatting choice.
  // A promise nobody awaits is a swallowed failure.
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        // A leading underscore marks a deliberately unused binding.
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
    },
  },

  // Formatting rules off, everywhere, always last. Verified with
  // `npx eslint-config-prettier eslint.config.mjs`; see REPORT.
  eslintConfigPrettier,
);
