# ADR-0046: M19 - strict TypeScript flags and type-aware ESLint

- Status: accepted (implementation in progress on `feat/phase10-batch1-debt-removal`)
- Date: 2026-09-08
- Supersedes: nothing. Extends ADR-0037 (CI gatekeeping) and ADR-0044 (phase 10 debt removal).

## Context

Phase 10 item **M19** was the last piece of type-safety debt: `strict: true` was
on, but every flag that catches the interesting bugs was off, ESLint ran without
type information (so `no-floating-promises` could not exist), React hook and
accessibility rules were absent, and **every workspace excluded its own specs
from the compiler**. A spec could reference a field that no longer exists and
the gate stayed green.

ADR-0044 removed the lockfile blocker. This ADR records the shape of the fix.

## Decision

1. **Strict flags in one place.** `tooling/tsconfig/base.json` adds
   `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`,
   `noFallthroughCasesInSwitch`, `allowUnreachableCode: false` and
   `allowUnusedLabels: false`. No workspace redefines strictness locally;
   the regression suite asserts that.

2. **Two projects per workspace, one purpose each.** The build project
   (`tsconfig.json`) keeps excluding specs, because `dist/` must ship sources,
   not tests. A sibling `tsconfig.typecheck.json` extends it with
   `exclude: []` and `noEmit: true`, and the `typecheck` script points at it.
   Specs are now compiled on every gate run and nothing extra is emitted.

3. **`tools/`, `e2e/` and the root configs get a project too**
   (`tsconfig.repo.json`, run by `typecheck:repo` after the turbo pass). Those
   directories hold the conformance harness and the regression suites that
   assert the gates themselves; leaving them uncompiled would have made
   "specs are typechecked" a half-truth.

4. **Type-aware ESLint is scoped, not global.** `recommendedTypeChecked` plus
   `projectService` applies to `apps/*/src` and `packages/*/src`, with
   `no-floating-promises`, `no-misused-promises`, `await-thenable` and
   `require-await` as errors. Everything else (config files, `tools/`, `e2e/`,
   specs) stays on the syntax-only layer. Reason: the project service demands
   that every linted file belong to a tsconfig project, and a global glob would
   fail the run with resolution errors instead of finding real bugs. Specs are
   in the typecheck project, which the service does not read - the compiler,
   not the linter, is their gate.

5. **React rules where React lives.** `react-hooks` and `jsx-a11y` are
   registered for `apps/*/src/**/*.tsx`: the full `jsx-a11y` recommended set,
   plus `rules-of-hooks` (error) and `exhaustive-deps` (warn).

## Deliberately deferred

- **`exactOptionalPropertyTypes`.** It does not report mistakes, it demands API
  shape changes (`prop?: T` vs `prop?: T | undefined`) across DTOs and props.
  It lands as its own change once the flags above are green, not bundled here.
- **The rest of the `react-hooks` v7 compiler ruleset** (`purity`,
  `set-state-in-effect`, ...). It belongs with the **L2** dashboard
  decomposition; enabling it on a 110KB component today produces a wall of
  errors nobody will read.
- **`noUnusedLocals` / `noUnusedParameters`.** ESLint already owns unused
  identifiers with the `^_` convention. Two enforcers with different escape
  hatches is churn, not safety.

## Consequences

- `npm run typecheck` now compiles roughly twice as many files. Expect the first
  runs after this change to be red: that is the point, the errors are the work.
- `npm run lint` requires the two new plugins, so `package-lock.json` must be
  regenerated (`npm install --package-lock-only --legacy-peer-deps`) or
  `tools/ci/lockfile-review.sh` correctly rejects the branch.
- M19 stays OPEN in `docs/WEAKNESSES-V2-10-PHASES.md` until a green
  `typecheck` + `lint` + `conformance` run is recorded. Config landing is not
  evidence of a clean compile.

## Evidence

- `tools/quality/typesafety.phase10-m19.spec.ts` - asserts the flags, the two
  projects per workspace, the repo project, the root gate wiring and the ESLint
  layers.
- CI: the `verify` job already runs `typecheck` and `lint` through
  `tools/ci/run-gate.sh`, so both produce evidence logs (ADR-0037).
