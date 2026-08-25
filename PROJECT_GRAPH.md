# Project Graph

**Generated** by `pnpm graph` from commit `7e376bc` (working tree dirty). **Do not hand-edit** — every row is parsed from source.

Descriptive only: answers *what exists*. Correctness is the conformance harness's job (ADR-21).

**At a glance:** 5 apps · 9 packages · 4 internal dependency edges

## Modules

| module | kind | dir | depends on |
|---|---|---|---|
| `@scalpai/analysis-core` | package | `packages/analysis-core` | — |
| `@scalpai/analysis-engine` | package | `packages/analysis-engine` | — |
| `@scalpai/app-admin` | app | `apps/admin` | — |
| `@scalpai/app-api` | app | `apps/api` | `@scalpai/analysis-core`, `@scalpai/db`, `@scalpai/shared` |
| `@scalpai/app-desktop` | app | `apps/desktop` | — |
| `@scalpai/app-portal` | app | `apps/portal` | — |
| `@scalpai/app-web` | app | `apps/web` | `@scalpai/shared` |
| `@scalpai/db` | package | `packages/db` | — |
| `@scalpai/education` | package | `packages/education` | — |
| `@scalpai/licensing` | package | `packages/licensing` | — |
| `@scalpai/notify` | package | `packages/notify` | — |
| `@scalpai/shared` | package | `packages/shared` | — |
| `@scalpai/sync-client` | package | `packages/sync-client` | — |
| `@scalpai/ui` | package | `packages/ui` | — |
