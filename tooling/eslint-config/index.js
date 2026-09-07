import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * Phase 10 M19 (ADR-0046). Two layers, on purpose:
 *
 *   1. SYNTAX-ONLY for every linted file (config files, tools/, e2e/, specs).
 *   2. TYPE-AWARE for workspace sources, where the rules that actually catch
 *      correctness bugs live: no-floating-promises, no-misused-promises,
 *      await-thenable, require-await.
 *
 * The type-aware layer is scoped instead of global because `projectService`
 * requires every linted file to belong to a tsconfig project. Only
 * apps/<app>/src and packages/<pkg>/src are in one; specs live in the
 * tsconfig.typecheck.json project (which projectService does not pick up, it
 * reads the nearest tsconfig.json), and tools/, e2e/ and the flat-config files
 * are covered by tsconfig.repo.json. Widening the glob without widening the
 * projects would fail the lint run with "file not found in any project" instead
 * of finding a single real bug.
 */

// This file lives at <repo>/tooling/eslint-config/index.js.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const TYPED_FILES = [
  "apps/*/src/**/*.ts",
  "apps/*/src/**/*.tsx",
  "packages/*/src/**/*.ts",
  "packages/*/src/**/*.tsx",
];
const TYPED_IGNORES = ["**/*.spec.ts", "**/*.spec.tsx"];
const REACT_FILES = ["apps/*/src/**/*.tsx"];

const typeAware = tseslint.configs.recommendedTypeChecked.map((entry) => ({
  ...entry,
  files: TYPED_FILES,
  ignores: TYPED_IGNORES,
}));

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.opencode/**",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...typeAware,
  {
    files: TYPED_FILES,
    ignores: TYPED_IGNORES,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: REPO_ROOT,
      },
    },
    rules: {
      // A dropped promise in a clinical write path is data loss, not a style nit.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
    },
  },
  {
    files: REACT_FILES,
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // The two rules that encode the hook contract. The rest of the v7
      // compiler ruleset (purity, set-state-in-effect, ...) is deliberately a
      // follow-up: it lands together with the L2 dashboard decomposition,
      // not as a wall of errors on a 110KB component.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
];
