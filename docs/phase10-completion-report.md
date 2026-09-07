# Phase 10 completion report

Phase 10 is delivered in batches because its items have unrelated blast radii.
This report is cumulative: each batch appends, nothing is rewritten.

---

## Batch 1 — claims vs. code (ADR-0043)

Date: 2026-09-07
Branch: `feat/phase10-product-quality-docs-debt`
Base: `main`

### Closed

- **H10**: patient search accepts `q` and `search` consistently, trims blank input, and has partial `pg_trgm` GIN indexes in migration `0015`.
- **H13**: on-device analysis submits image SHA-256, pixel geometry, registered model manifest data, and an explicit non-diagnostic flag. The API rejects unknown models, manifest drift, model-version mismatches, malformed digests, and diagnostic claims.
- **M2**: licence status is verified server-side with Ed25519. The UI no longer invents a green state; `unlicensed` is explicit.
- **M3**: the desktop module no longer fabricates UVC devices or claims hardware support. It exposes a bridge contract and reports unavailable until a real bridge exists.
- **M7/R13**: deleted unrelated Firebase/applet scaffold files, widened secret scanning to the missed config surfaces, and documented rotation/revocation requirements.
- **M10**: signature canvas preserves its bitmap across real resizes and has a pure regression-tested resize plan.
- **M11**: SPA shell loading is async, cached, negatively cached, and excluded for API and asset 404s.
- **M13**: future relative timestamps use future tense and date formatting accepts an IANA clinic timezone.
- **M18**: removed third-party font CDN usage and reduced the declared family set to two self-hosted families with fallbacks.
- **M20**: added README, MIT LICENSE, SECURITY.md, CODEOWNERS, PR template, and reproducible run instructions.

### Evidence

- Shared SHA-256 and provenance unit suites.
- Pagination, date/timezone, signature resize, licence verification, SPA fallback, and phase-10 static regression suites.
- ADR-0043 documents the decisions and the explicit non-closures.

---

## Batch 2 — dead code and dependency ownership (ADR-0044)

Date: 2026-09-08
Branch: `feat/phase10-batch1-debt-removal`
Base: `main`

### Closed

- **M4/M16**: `@scalpai/ui` and `@scalpai/notify` deleted (no import, no dependent
  manifest, since creation). The duplicate `ops/audit-anchor.ts` deleted — it
  hashed concatenated row hashes and called the result a Merkle root, and its
  chain verifier never recomputed a row hash; `packages/db/src/audit-anchor.ts`
  is the real implementation. The root `src/assets/images` tree deleted (8 files,
  6.0MB, zero references). **Both `package-call-site` exceptions removed from
  `tools/conformance/exceptions.json`** — the rule now passes on merit rather
  than by registration.
- **R14**: root `dependencies` removed entirely. `three` and `lucide-react` moved
  to `apps/web` (their only call-sites), `react`/`react-dom` dropped from the root
  as duplicates of the app's own declaration, `@types/three` moved beside its
  subject, `@vitest/coverage-v8` moved from `dependencies` to root
  `devDependencies`, and `jsdom` removed from `apps/web` so one major of one DOM
  implementation exists in the tree.
- **PR #21 / #23**: verified already closed unmerged on 2026-09-06. #21 was
  +13/-12 on one file against a base three commits behind `main`; #23 had no
  effective diff.

### Evidence

- `tools/quality/product.phase10.spec.ts`: new `M4/M16` and `R14` blocks. The R14
  block asserts the *rule*, not the snapshot — a `three`/`lucide-react` import
  from any workspace other than `apps/web` fails the gate instead of being
  resolved silently by npm hoisting.
- `npm run conformance` passes with two fewer registered exceptions.
- ADR-0044.

### Required on the machine that runs npm

This batch edits three manifests, so the lockfile must be regenerated in the
same change:

```bash
npm install --package-lock-only --legacy-peer-deps
npm ci
npm run typecheck && npm run build
npm run test && npm run conformance
bash tools/ci/lockfile-review.sh
```

`tools/ci/lockfile-review.sh` fails a manifest change without a lockfile change,
and a hand-edited lockfile is exactly what it exists to reject.

---

## Still open

The phase-level checkbox stays `[ ]`. Remaining items, none of which are
honestly complete:

- **M1** — `SAMPLE_*` payloads still inline in `ClinicalDashboard.tsx` (110KB) and
  `NeuralSegmentationOverlay.tsx`. Bound up with L2; two `production-mocks`
  exceptions remain registered against ADR-0043 so the rule stays enabled.
- **M5** — i18n incomplete: hardcoded Persian/English, LTR login, fake alerts.
- **M14** — conformance coverage for `.tsx`, `ops`, JSON/YAML and architectural
  call-sites.
- **M15** — bundle budget against a real import graph.
- **M19** — type-aware ESLint, `react-hooks`, `jsx-a11y`, `no-floating-promises`,
  and the TypeScript strict flags. Now unblocked on the lockfile, but it is a
  wide change: turning these on surfaces existing violations across the tree, so
  it needs its own branch with the errors actually read rather than a config
  landed blind.
- **L1/W01/W22/W23** — `docs/playbooks/*` and the `docs/tasks|gates` archive still
  carry `pnpm` snippets and PASS marks with no evidence log. ADR-0044 corrected
  the phase-file header and `PROJECT_GRAPH.md` in passing; that is not the item.
- **L2** — decomposition of the dashboard and a standard style system.

Ticking the phase while those claims remain would make the next automated run
skip real work.
