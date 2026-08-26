# Project Graph

**Generated** by `pnpm graph` from commit `6e9af36` (working tree dirty). **Do not hand-edit** — every row is parsed from source.

Descriptive only: answers *what exists*. Correctness is the conformance harness's job (ADR-21).

**At a glance:** 5 apps · 9 packages · 10 internal dependency edges

## Modules

| module | kind | dir | depends on |
|---|---|---|---|
| `@scalpai/analysis-core` | package | `packages/analysis-core` | — |
| `@scalpai/analysis-engine` | package | `packages/analysis-engine` | `@scalpai/analysis-core`, `@scalpai/shared` |
| `@scalpai/app-admin` | app | `apps/admin` | — |
| `@scalpai/app-api` | app | `apps/api` | `@scalpai/analysis-core`, `@scalpai/db`, `@scalpai/shared`, `@scalpai/sync-client` |
| `@scalpai/app-desktop` | app | `apps/desktop` | — |
| `@scalpai/app-portal` | app | `apps/portal` | — |
| `@scalpai/app-web` | app | `apps/web` | `@scalpai/analysis-engine`, `@scalpai/shared` |
| `@scalpai/db` | package | `packages/db` | `@scalpai/sync-client` |
| `@scalpai/education` | package | `packages/education` | — |
| `@scalpai/licensing` | package | `packages/licensing` | — |
| `@scalpai/notify` | package | `packages/notify` | — |
| `@scalpai/shared` | package | `packages/shared` | — |
| `@scalpai/sync-client` | package | `packages/sync-client` | `@scalpai/shared` |
| `@scalpai/ui` | package | `packages/ui` | — |
