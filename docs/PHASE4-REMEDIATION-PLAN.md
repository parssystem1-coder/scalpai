# Phase 4 Remediation Plan

**Date:** 2026-09-13
**Companion to:** `docs/PHASE4-CLOSURE-GATE.md` (that document is the gate; this one is the work order. The gate file is NOT modified by this plan.)
**Verified against:** `main` @ `600c092854120a763f251baf5ad6da5119d17aeb`
**Method:** every claim below was read out of the code, not out of a document. Where the gate document and the code disagree, the code wins and the difference is called out.

> **Line reference convention.** Line numbers are for the commit above and are anchored to a named symbol or a quoted snippet so they survive small edits. Approximate ranges are prefixed with `~`.

---

## 0. Executive summary - what independent verification changed

The gate document's direction is correct: Phase 4 is not closed. But three of its statements are wrong or stale, and one problem it never mentions is the most serious thing in the repository.

| # | Gate document says | Code says | Impact |
|---|---|---|---|
| 1 | Modal extraction 2/9, no focus trap, Escape on 2 | **Confirmed** - `components/modals/` holds exactly `AddPatientModal.tsx` and `PhotoLightbox.tsx` | none, claim stands |
| 2 | Area keys "NOT DONE", `photo.area` interpolated raw | **Partially done**: `dashboard.galleryVision.areas.*` exists in `i18n.ts` (fa+en) and `areaLabel()` is wired into the area tabs, the HUD and the drop hint. Two call sites still leak raw | criterion 11 is smaller than stated |
| 3 | `dir="rtl"` hardcoded in 7 files | **8 files, ~10 occurrences** - the list misses `components/FeatureErrorBoundary.tsx`, and `App.tsx` carries 3, not 1 | criterion 10 is bigger than stated |
| 4 | *(not mentioned)* | **`ClinicalDashboard.tsx:41` is a comment listing the exact string literals the M1b and M5 specs grep for.** Those specs `readFileSync` the source and `toContain` those strings, so they pass on the comment while the code they describe lives elsewhere or nowhere | **the M1/M5 green evidence is not evidence** - see F01 |

Everything else in Sections 1-9 of the gate document that touches the web app was confirmed. The infrastructure claims (B03/B04/B06: ruleset, digests, advisories) were not re-verified here - they live in GitHub settings, registries and `npm audit` output rather than in the tree - so this plan takes them as stated and specifies the evidence each one needs.

---

## 1. Additional findings (not in the gate document)

### P0 - false evidence and fabricated clinical data

**F01 - A token-manifest comment satisfies the M1b and M5 grep assertions.**
`apps/web/src/components/ClinicalDashboard.tsx:41` is a single-line comment enumerating: `dataProvider.mode="demo"`, `<DemoWatermark mode={dataProvider.mode} surface="dashboard" />`, `dataMode={dataProvider.mode}`, `dashboard.galleryVision.thumbAlt`, `dashboard.lightbox.imageAlt`, `dashboard.galleryVision.tagChip`, `<FeatureErrorBoundary>`, `<Suspense>`, `lazy(() => import("./LuxuryScalp3D"))`, `contentVisibility: "auto"`, `useState<Patient | null>(null)`, `dashboard.emptyState.title`, and all five `dashboard.dividers.*` keys.

Both guard specs are text greps over that one file:

- `apps/web/src/__tests__/m1b-runtime-wiring.spec.ts` reads the file with `readFileSync` and asserts `toContain("<DemoWatermark mode={dataProvider.mode} surface=\"dashboard\" />")`. The real render is in `DashboardShell.tsx:31` - correct behaviour, but the assertion is satisfied by the comment, so it stays green even if the shell stops rendering it.
- `m5-blockers.spec.ts` asserts `useState<Patient | null>(null)`, `dashboard.emptyState.title`, `thumbAlt`, `imageAlt`, `tagChip`, `dividers.aiEngine`, `dividers.hologram` are present in that file. After L2, **none of those exist in the file's code**: patient state moved to `useDashboardRecords.ts:38`, the empty state to `sections/EmptyRosterSection.tsx`, the alt/tag keys to `sections/TrichoscopyGallerySection.tsx`. Only the comment keeps them green.

This is the highest-priority item in the plan. Until it is fixed, "M1 green" and "M5 green" in `docs/WEAKNESSES-V2-10-PHASES.md` are unfounded, and gate criterion 2 ("negative test + grep") is built on the same grep style.

**F02 - Two dividers asserted by the spec are never rendered.** `ClinicalDashboard.tsx` renders `SectionDivider` three times (`dividers.patients`, `dividers.scalpMap`, `dividers.trichoscopy`). `dividers.aiEngine` and `dividers.hologram` appear only in the F01 comment: the AI and hologram sections have no divider.

**F07 - Focus restore in `AddPatientModal` is actively broken, not merely missing.** In `modals/AddPatientModal.tsx` the effect is:

```ts
useEffect(() => {
  if (isOpen) { returnFocus.current = document.activeElement as HTMLElement | null; firstRef.current?.focus(); }
  returnFocus.current?.focus();   // <- also runs on OPEN
}, [isOpen]);
```

The restore call sits outside the `if`, so opening the dialog focuses the first field and then immediately throws focus back to the trigger. Keyboard users land outside the open dialog. `modals/PhotoLightbox.tsx` has the correct `if/else` shape.

**F09 - The analysis pipeline fabricates its output, in the real path.** `hooks/useDashboardAnalysis.ts:41-63` builds a flat 128x128 RGBA buffer of the constant colour `(225,185,175,255)`, feeds it to `createEngine().analyze()`, then overwrites the clinically meaningful fields with `Math.random()`: `anagenRatio`, `hairCaliber` microns, `matrixHydration` and all three `follicularUnits` buckets, plus a hardcoded `tensorConfidence: 98.2`. `INITIAL_ANALYSIS` (line 19) ships fixed scores before any run. Nothing here is gated by `dataProvider.mode`, so it behaves identically in the real path. Confirms and sharpens P4-B02.

**F10 - Uploads never leave the browser.** `hooks/useImageUpload.ts:37-56`: `FileReader.readAsDataURL` makes the base64 string the `TrichoscopyImage.url`, held in React state only. `density` and `thickness` are `Math.random()`, `qualityScore` is hardcoded `99`, the id is `upload-${Date.now()}`. No presign, no PUT, no outbox enqueue. The gallery then renders `quantumClarity` from that hardcoded 99. Confirms P4-B01/B02.

**F11 - Real and synthetic patients are merged into one list with no provenance marker.** `hooks/useDashboardRecords.ts:76` mints `pat-` + a **4-digit** `Date.now()` slice - collision-prone as well as synthetic - and `addPatient` only mutates local state plus bus events. There is no `POST /patients`. Meanwhile lines 40-52 query the real `/patients?limit=50` and **merge** API rows with local rows into `patientList`. A clinician cannot tell which rows are persisted. That mixing is worse than either a pure demo or a pure real path.

### P1 - enforcement gaps, accessibility, i18n regressions

**F03 - `dir="rtl"` census.** 8 files, ~10 occurrences: `apps/web/index.html:2`; `src/App.tsx` x3 (`RouteFallback`, the `/plans` wrapper, the toast body); `src/pages/LandingPage.tsx`; `src/components/RegisterForm.tsx`; `src/components/ProPlansView.tsx`; `src/components/DemoBanner.tsx`; `src/components/BeforeAfterCompareModal.tsx`; and **`src/components/FeatureErrorBoundary.tsx`**, which the gate list misses.

**F04 - `App.tsx` still hardcodes Persian UI copy**, contradicting the M5/M5c "no hardcoded Persian left" claim: the `RouteFallback` aria-label and its visible twin, the logout toast pair, the `FeatureErrorBoundary` title and description, the back button, and the plan-activated toast pair. None route through `t()`.

**F05 - `NeuralSegmentationOverlay.tsx` carries untranslated copy and unprovable device claims**: `alt="Trichoscopy Microscopic View"`, the header literal `AI TRICHO-VISION HUD - 4K`, and the footer `Tensor-Model: v4.8`. The last two assert resolution and model version with nothing behind them - the same class of problem as P4-B02, on a surface that otherwise correctly renders `DemoWatermark` and defaults `detections = []`.

**F06 - Area translation is 3/5 wired.** Localised: the area tab buttons, the HUD `areaName`, the drop hint, all via `areaLabel()` from `ClinicalDashboard.tsx:61`. Still raw: the `sections/TrichoscopyGallerySection.tsx` photo chip (`t("dashboard.galleryVision.areaLabel", { area: photo.area })`), and `modals/PhotoLightbox.tsx`, which is never given an `areaLabel` prop (its props are `previewPhotoModal`, `selectedPatient`, `photosByPatient`, `onClose`, `onDeletePhoto`, `onCompare`, `onInspectHud`) and therefore cannot localise anything area-shaped.

**F08 - No focus trap anywhere.** Both extracted modals have `role="dialog"`, `aria-modal="true"`, Escape and first-element focus. Neither cycles Tab inside the dialog, so focus escapes into the page behind. The 7 root modals have none of the four.

**F14 - `AutoLock` has zero call sites.** `components/AutoLock.tsx` is correct in isolation (passive listeners, single fire, cleanup), but `App.tsx` never mounts it and `ProtectedRoute.tsx` does not wrap children with it. Confirms P4-B08.

**F15 - `REQUIRED_GATES` is in sync; the enforcement hole is elsewhere.** `tools/ci/gate-report.ts` lists 26 gates and every one is recorded by a `run-gate.sh` step in `ci.yml` - no drift. The added `backup-freshness` gate verifies the RPO evidence in `last-run.json`; the remaining gap is that **no gate exists for accessibility, locale parity, dashboard integration or performance marks**, so criteria 9-12 have no path to enforcement even after the code is fixed. And `ci.yml` cannot grant itself required-check status; that is the repo ruleset (P4-B03).

**F17 - `ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md` contradicts itself inside one file.** Its Phase 4 section says `**NOT STARTED**` and "`apps/web/src/components/modals/` does not exist" (it does, with 2 files), while the Success Checklist near the end ticks `- [x] Phase 4: Modals extracted into components/modals/, focus/Escape handled` and `- [x] Phase 5: ... no hardcoded direction`. `m5-blockers.spec.ts` only guards four specific strings in this file, so the contradiction passes CI.

**F18 - `WEAKNESSES-V2-10-PHASES.md` claims all ten phases closed**, M1 and L2 included, on the same day the gate document declares Phase 4 red. Its L2 evidence (904 to 300 lines, 741 tests green) is true about the line count and false about the outcome: 7 of 9 modals never moved, and the tests certifying M1/M5 are the greps in F01.

### P2 - hygiene, perf, debt

**F12 - `useConditionMapping.ts`** confirms the gate claim and adds detail: a 4-rule `eslint-disable` on line 2 (`no-explicit-any`, `no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-member-access`), the whole props object typed `any` on line 3, `CONDITION_MATCHERS` rebuilt on every render inside the hook body, `aiResult.scores.redness` dereferenced with no guard (throws if `aiResult` is ever nullable), match priority silently dependent on `Object.entries` order, and the only `TODO` in `apps/web/src` ("Migrate DB to store ConditionKey instead of free-text Persian strings").

**F13 - the DEV guard in `data/dashboard-samples.ts` is a ternary**, so the literals stay in the module graph and removal is proven only by the separate `production-stripping` gate. Both exported collections are mutable (`Patient[]`, not readonly or frozen).

**F16 - `tools/conformance/exceptions.json` holds 10 live exceptions** (5 `tenant-safety`, 1 `ops-file-conventions`, 4 `architecture-call-sites`), all ADR-referenced. Two problems: indentation breaks from the 6th entry onward (hand-merged), and there is **no `expires` or `owner` field**, so a time-boxed exception is indistinguishable from a permanent one. The claim that the `production-mocks` exceptions were removed is **true** - verified absent.

**F19 - `ClinicalPdfReportModal.tsx` hardcodes clinical metadata into the patient-facing artifact**: medical licence `IR-148920-TRICH`, the areas string `Frontal, Mid-scalp, Vertex, Temporal, Occiput` regardless of what was captured, and the lens spec `20x / 50x Polarized Epiluminescence`.

**F20 - zero `performance.mark` / `performance.measure` repo-wide** (criterion 12 confirmed), and animations (`animate-pulse`, `animate-fadeIn`, the laser scan line) are unconditional - no `prefers-reduced-motion` branch on the dashboard surfaces.

**F21 - only two `eslint-disable` blocks exist repo-wide**: `useConditionMapping.ts` (F12) and `modals/PhotoLightbox.tsx` (`jsx-a11y/no-noninteractive-element-interactions`, `jsx-a11y/click-events-have-key-events`), the latter hiding a click-only backdrop.

**F22 - search caveat.** GitHub code search returns zero hits for `TODO`/`FIXME`/`HACK` under `apps/web/src`, yet a `TODO` demonstrably exists in `useConditionMapping.ts`. The index is unreliable for this, so the marker sweep in the CI table below must be a local `rg` run, never a search-API result.

---

## 2. The 13 gate criteria, expanded

Each entry: **files/anchors, fix, test that must pass, acceptance.** Effort is one engineer, in hours. `R:` is the rollback strategy.

### C1 - Dashboard API-first path verified by E2E - P0 - 24-32h

- **Files:** `hooks/useDashboardRecords.ts:36-92` (local state, synthetic id line 76, merge at 40-52); `hooks/useImageUpload.ts:31-56`; `hooks/usePhotoMutations.ts`; `data/dashboard-data-provider.ts`; `offline/SyncProvider.tsx`; `api/client.ts`.
- **Fix:** decide once and record it in an ADR: (a) API-first, or (b) read-only demo. For (a): `addPatient` becomes a react-query mutation against `POST /patients` with the outbox as the offline path, and the server returns the id - delete the `Date.now()` generator entirely. Uploads go presign, PUT, confirm, storing the returned object key rather than a data URL. Drop the merge in `patientList`: render exactly what the query plus outbox returns, with a pending badge (`components/PendingBadge.tsx` already exists) on un-synced rows. For (b): the dashboard becomes `mode="demo"` only, `DemoWatermark` non-optional, and every mutation control is removed.
- **Test:** new `e2e/dashboard-persistence.spec.ts` tagged `@smoke`: login, create patient, upload, go offline, reload, reconnect, reload, and the same patient and image are present with server ids. Plus a unit assertion that no module under `apps/web/src/hooks/` derives an id from `Date.now()`.
- **Acceptance:** the E2E passes against real Postgres + MinIO in CI; no id construction from `Date.now()` remains; a fresh browser profile sees the created records.
- **R:** ship behind `VITE_DASHBOARD_DATA_SOURCE=api|demo`, default `demo` until the E2E is green for three consecutive nightlies, then flip the default in a one-line, trivially revertible commit.

### C2 - No synthetic clinical claims in production - P0 - 16-20h

- **Files:** `hooks/useDashboardAnalysis.ts:19-27,41-63` (F09); `hooks/useImageUpload.ts:44-48` (F10); `components/ClinicalPdfReportModal.tsx` (F19); `components/NeuralSegmentationOverlay.tsx` (F05).
- **Fix:** delete every `Math.random()` from the analysis and upload hooks. `AnalyticsData` becomes a discriminated union - `{ state: "empty" } | { state: "pending" } | { state: "ready", provenance: { imageHash, modelVersion, reportId, signedAt } }` - and `AnalyticsSection` renders the empty state instead of inventing numbers. Remove the hardcoded licence, areas and lens strings from the PDF modal: take them from the report payload or omit the row. Replace the HUD resolution and model-version literals with values from the model manifest, or drop them.
- **Test:** `apps/web/src/__tests__/no-synthetic-clinical.spec.ts` as an **AST rule, not a grep**: no `Math.random` in any module under `hooks/` or `components/sections/`, and no numeric literal assigned to `tensorConfidence`, `qualityScore`, `density` or `thickness`. Plus negative render tests: `AnalyticsSection` given `state: "ready"` without `provenance` fails at the type level and renders the unverified state at runtime; `ClinicalPdfReportModal` refuses any "Verified/Signed" label without `reportId` and signature.
- **Acceptance:** `npm test` green with the new spec; a manual PDF export for a patient with no server analysis contains no verification language anywhere.
- **R:** four independent commits (analysis, upload, PDF, overlay). Reverting any one restores that surface without touching the others.

### C3 - GitHub ruleset enforced on `main` - P0 - 2h

- **Files:** none in-tree (repo settings), plus a note in `docs/ops/DEPLOYMENT.md`.
- **Fix:** ruleset on `main` with required status check = the `gate` job (the only job that re-reads evidence), 1 approving review, branches up to date, no force-push, no deletion, **no admin bypass**.
- **Test:** a throwaway PR with a deliberately broken `typecheck` must be unmergeable; a direct push to `main` must be rejected.
- **Acceptance:** the ruleset JSON from the GitHub API attached to the gate document, showing the four rules and an empty bypass list.
- **R:** rulesets are settings - delete to revert, zero code impact. Keep the JSON export so it can be re-applied verbatim.

### C4 - Fastify audit clean or accepted - P1 - 4-8h

- **Files:** `package-lock.json`, `apps/api/package.json`, the `audit:ci` script.
- **Fix:** run `npm audit --omit=dev` and bump Fastify/Nest transitively. If no fix exists, write `docs/adr/ADR-00xx-fastify-moderate-acceptance.md` with a named owner, the affected paths, why the advisory is not reachable, and a review date within 30 days. Then tighten the gate to `--audit-level=moderate` for runtime deps so the next moderate is not silently absorbed.
- **Test:** `npm run audit:ci` exits 0, and a regression spec asserts the gate script uses `--omit=dev` and the level the ADR claims.
- **Acceptance:** `ci-evidence/audit.log` with `exit=0`, or the ADR linked from the gate document with a future review date.
- **R:** revert the lockfile bump and re-run `npm ci`. The ADR path has nothing to roll back.

### C5 - Offline PHI encryption verified - P0 - 16-24h

- **Files:** `apps/web/src/offline/` (Dexie schema, outbox, `SyncProvider`), the `phi-crypto` package, and `hooks/useImageUpload.ts` - data URLs currently make PHI images resident in memory and in any state snapshot.
- **Fix:** every outbox payload field carrying identifiers (name, phone, notes) passes through the envelope before it is written; the key is derived per principal and dropped on logout or principal change; `putObject` without an envelope throws rather than warns.
- **Test:** `e2e/offline-phi.spec.ts` - create a patient offline, read the IndexedDB rows via `page.evaluate`, assert no plaintext name or phone substring; log out and assert the key material and rows are gone; a unit test asserts the store rejects an unencrypted put.
- **Acceptance:** the E2E artifact shows ciphertext-only rows, the logout assertion passes, and the negative put test fails closed.
- **R:** land behind `OFFLINE_PHI_ENVELOPE=on|off` with a one-way re-encryption migration; `off` keeps reading both shapes for one release, so a rollback loses no queued mutation.

### C6 - Release promotion immutable + rollback drill - P1 - 24-32h

- **Files:** `.github/workflows/ci.yml` (the `deployment` job builds images on the runner and never pushes), `ops/prod.yml`, `tools/ci/image-scan.sh`, new `.github/workflows/release.yml`.
- **Fix:** build once, push to a registry by digest, and record `{commit, digest, migration set, approver, CI run URL}` as a release artifact with SBOM, provenance and signature. Staging and prod both deploy the **same digest** (`image: repo@sha256:...`, never a tag, never a local build). Add a rollback runbook step that redeploys the previous digest against the contract-safe schema.
- **Test:** new gates `release-digest` and `rollback-drill` recorded through `run-gate.sh`, plus a regression spec asserting `ops/prod.yml` has no `build:` for `api`/`web` on the prod path and no `:latest`.
- **Acceptance:** a staging deploy whose digest equals the CI-built digest, and a recorded rollback drill (previous digest live, health green, data intact).
- **R:** the drill is the rollback path. The new workflow is additive, so deleting `release.yml` returns to today's behaviour.

### C7 - Docs single source of truth - P1 - 6-8h

- **Files:** `docs/WEAKNESSES-V2-10-PHASES.md` (F18), `docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md` (F17), `docs/PROGRESS.md`, `docs/phase10-completion-report.md`, `docs/playbooks/phase10-L2-clinical-dashboard-refactor.md`. **Not** `docs/PHASE4-CLOSURE-GATE.md`.
- **Fix:** the gate document is the ledger; every other file links to it instead of restating status. Un-tick the Roadmap Success Checklist rows that contradict that same file's Phase 4 section. In the Weaknesses ledger, reopen M1, M5 and L2 with pointers to F01, F06 and F17 and the reason.
- **Test:** a conformance rule `doc-status-consistency`: no file may tick a phase the gate document lists as FAIL, and no two files may state a different status for the same phase id.
- **Acceptance:** the rule runs inside the existing `conformance` gate, red before the doc edits and green after.
- **R:** docs only - revert the single commit.

### C8 - Auto-lock on all protected routes - P1 - 6-8h

- **Files:** `components/AutoLock.tsx` (correct, unused - F14), `components/ProtectedRoute.tsx`, `App.tsx` (four protected routes today: `/dashboard`, `/patients`, `/patients/:pid/gallery`, `/patients/:pid/gallery/:gid`).
- **Fix:** mount `AutoLock` **inside `ProtectedRoute`**, not per route, so any future protected route inherits it by construction. `onLock` calls `clearAccessToken()`, purges the offline key, and navigates to `/login` with `replace: true`. Timeout comes from config, not a literal.
- **Test:** `e2e/auto-lock.spec.ts` with a shortened timeout: idle on each protected route redirects to `/login`, the token is gone from memory, and back/forward does not restore the session. Unit test: `ProtectedRoute` renders `AutoLock` - asserted on the rendered tree, not on source text.
- **Acceptance:** E2E green for every protected route, and a new protected route added in the fixture is locked with no extra wiring.
- **R:** single-component revert. `AutoLock` renders `null`, so removing the mount cannot break layout.

### C9 - 7 modals extracted + focus trap/restore/Escape on all - P1 - 20-28h

- **Files to move** into `components/modals/`: `DigitalConsentModal.tsx`, `LicenseDiagnosticsModal.tsx`, `SyncInspectorModal.tsx`, `EducationModal.tsx`, `GuidedCaptureModal.tsx`, `ClinicalPdfReportModal.tsx`, `BeforeAfterCompareModal.tsx`, plus `ConsentCertificateModal.tsx`, which the gate count omits but is also a modal in root. **Already there:** `AddPatientModal.tsx`, `PhotoLightbox.tsx`. Call sites: `ClinicalDashboard.tsx` ~214-296 and `sections/EmptyRosterSection.tsx:5-6`.
- **Fix:** build `components/modals/Dialog.tsx` - one primitive owning `role="dialog"`, `aria-modal`, a labelled title, Escape, **Tab cycling inside the dialog**, focus-first-on-open and focus-restore-on-close. Fix F07 during the migration (`if/else`, not an unconditional restore). Every modal renders through it, and the `jsx-a11y` disable in `PhotoLightbox` (F21) gets deleted rather than inherited.
- **Test:** `components/modals/__tests__/dialog-a11y.spec.tsx`, parameterised over **every** file in `components/modals/`: open it, assert focus lands inside, Tab from the last focusable returns to the first, Escape closes, focus returns to the trigger. A structural test asserts `components/` root contains no `*Modal.tsx`.
- **Acceptance:** the parameterised suite covers 10/10 modals with zero skips; the structural test is red today and green after the move.
- **R:** move files in one commit, re-point imports in the next; reverting both restores the tree. Behaviour risk concentrates in `Dialog.tsx`, which keeps an `enableFocusTrap` prop defaulting to `true` for a per-modal opt-out.

### C10 - `dir="rtl"` removed from the hardcoded files - P1 - 8-10h

- **Files (F03):** `index.html:2`; `App.tsx` x3; `pages/LandingPage.tsx`; `RegisterForm.tsx`; `ProPlansView.tsx`; `DemoBanner.tsx`; `BeforeAfterCompareModal.tsx`; `FeatureErrorBoundary.tsx`.
- **Fix:** direction belongs to `documentElement`, which `i18n.ts` already owns. Remove every attribute; where a subtree genuinely needs an override, use logical CSS (`text-align: start`, `ms-*`/`me-*`). `index.html` may keep a static `lang`/`dir` for first paint only if `i18n.ts` corrects it on boot, and that must be documented in `i18n.ts`.
- **Test:** widen `m5-blockers.spec.ts` from one file to a **directory walk** over `apps/web/src/**/*.tsx` plus `index.html`, asserting zero `dir="rtl"` with an explicit ADR-referenced allowlist if `index.html` stays. Add a locale-parity render test: mounting the dashboard with `lng="en"` yields `documentElement.dir === "ltr"` and no element carries an inline `dir`.
- **Acceptance:** the walk is red today (8 files) and green after; switching locale flips the whole app, including the error boundary and the compare modal.
- **R:** one commit per file, each a pure attribute deletion, individually revertible if review screenshots show a layout regression.

### C11 - Area keys translated - P1 - 4-6h

- **Files (F06):** `i18n.ts` (`dashboard.galleryVision.areas.*`, fa+en, exists); `ClinicalDashboard.tsx:61` (`areaLabel`); `sections/TrichoscopyGallerySection.tsx` (chip passes raw `photo.area`); `modals/PhotoLightbox.tsx` (no `areaLabel` prop).
- **Fix:** stop threading a function through props. Export `useAreaLabel()` from `i18n.ts` and call it in the two leaf components, which also removes `areaLabel` from three prop lists. The chip becomes `t("...areaLabel", { area: areaLabel(photo.area) })`, and the lightbox title and filmstrip use the same helper.
- **Test:** `sections/__tests__/area-label.spec.tsx` renders the gallery and the lightbox with `lng="fa"` and `lng="en"`, asserting the literal `vertex` never appears in the fa output and the fa area string does. Add an i18n-completeness assertion: every value of `TrichoscopyImage["area"]` has a key in both locales.
- **Acceptance:** no raw area token renders in either locale across all four surfaces (tabs, HUD, chip, lightbox).
- **R:** additive helper - reverting the two call sites restores the raw chip without touching the keys.

### C12 - 3D performance marks exist - P2 - 6-8h

- **Files (F20):** `sections/HologramSection.tsx` (lazy `LuxuryScalp3D` + `Suspense`), `components/LuxuryScalp3D.tsx`, new `apps/web/src/perf/marks.ts`, `tools/perf/`.
- **Fix:** `mark("hologram:mount:start")` before the lazy chunk resolves, `mark("hologram:first-frame")` in the 3D component's first `requestAnimationFrame`, then `measure("hologram:ttfr", ...)`; same pair around `ScalpMap`. Emit through one thin module so it can no-op in tests and honour `prefers-reduced-motion` at the same time.
- **Test:** a unit test asserting the marks are created on mount (fake `performance`), plus a Playwright `@perf` test reading `performance.getEntriesByName("hologram:ttfr")` and comparing against a **committed** baseline JSON, in the style of `tools/bundle-budget.policy.json`.
- **Acceptance:** a versioned baseline exists, the `@perf` lane runs nightly, and a 20% regression fails it.
- **R:** marks are inert observation code - deleting `perf/marks.ts` and its call sites is a clean revert.

### C13 - External GATE_REVIEW PASS - P1 - 8h, after C1-C12

- **Files:** new `docs/gates/GATE_REVIEW-phase4.md`.
- **Fix:** a reviewer who did not write the code re-runs each criterion's acceptance step and links commit, CI run and test name per row. The review must explicitly restate F01: no criterion may be signed off on a source-text grep.
- **Test:** the `gate` job additionally requires `docs/gates/GATE_REVIEW-phase4.md` to exist with a `verdict: PASS` front-matter field and a CI run URL per criterion.
- **Acceptance:** all 13 rows PASS with independent evidence, and the gate document's Section 10 flips to GREEN in the same commit.
- **R:** not applicable (document), but the verdict must be revocable - a `verdict: REVOKED` entry with a reason keeps the audit trail honest.

---

## 3. Priority ordering

**P0 - do not ship, do not enter Phase 5 (~60-80h).** F01 (grep-satisfying comment), then C2 (synthetic clinical output), C1 (data path), C5 (offline PHI), C3 (ruleset), and F07 (broken focus restore - cheap and user-visible). F01 comes first because until the guard specs are behavioural, every other green is unverifiable.

**P1 - required for gate closure (~80-100h).** C6 release promotion, C8 auto-lock, C9 modal extraction plus the dialog primitive, C10 direction, C11 area keys, C7 docs, C4 advisories, and with them F03, F04, F05, F06, F08, F14, F15, F17, F18.

**P2 - closes the debt the gate ignores (~24-32h).** C12 perf marks, F12 `useConditionMapping` typing, F13 sample-data hardening, F16 exception expiry, F19 PDF metadata, F20 reduced-motion, F21 lint-disable removal, F22 marker sweep in CI.

**Suggested waves:** W1 = F01 + C2 + C1. W2 = C5 + C3 + C4. W3 = C9 + F07 + F08 + C10 + C11. W4 = C6 + C8 + C12. W5 = C7 + C13 + remaining P2. W3 can run in parallel with W2 - different surfaces, no shared files.

---

## 4. Rollback strategy - the general rules

1. **One concern per commit.** Every item above is scoped so a single `git revert` restores prior behaviour without a follow-up fix.
2. **Flags for anything that changes what a clinician sees:** `VITE_DASHBOARD_DATA_SOURCE` (C1), `OFFLINE_PHI_ENVELOPE` (C5), `enableFocusTrap` (C9). Flags are deleted in a dedicated cleanup commit once the gate is green, never left as permanent forks.
3. **Data changes are expand/contract.** The offline envelope reads both shapes for one release, so no queued mutation is lost by a rollback.
4. **Never revert a test to green a build.** If a new guard spec fails, the code is wrong. Reverting a guard requires an ADR - this is exactly the failure mode F01 documents.
5. **Infra rollback is a redeploy, not a rebuild** (C6): the previous digest is always deployable, and the drill proves it.

---

## 5. CI gate requirements

Add to `REQUIRED_GATES` in `tools/ci/gate-report.ts` and to `.github/workflows/ci.yml` via `run-gate.sh`. Today's 25 gates are in sync (F15), so this is pure addition.

| new gate | command | blocks criterion |
|---|---|---|
| `a11y-dialog` | `npm run test -- modals/__tests__/dialog-a11y` | C9 |
| `locale-parity` | `npm run test -- locale-parity` (dir walk + fa/en render) | C10, C11 |
| `dashboard-integration` | `npm run test -- ClinicalDashboard.integration` | C1, C2 |
| `no-synthetic-clinical` | AST rule over `hooks/` + `components/` | C2 |
| `code-markers` | local `rg` for TODO/FIXME/HACK with an ADR allowlist (F22) | P2 |
| `doc-status-consistency` | new conformance rule | C7 |
| `perf-baseline` | `@perf` Playwright lane vs committed baseline | C12 |
| `release-digest`, `rollback-drill` | release workflow | C6 |

Two structural rules the pipeline needs regardless:

- **No gate may be satisfied by source text alone.** Behavioural assertions (render, act, assert) for behaviour; source scanning only for *absence* rules ("no `dir=\"rtl\"`", "no `Math.random`") where a grep is genuinely the right tool. F01 is what happens when a presence claim is greppable.
- **`gate` is the only required status check**, and it stays `if: always()` reading `ci-evidence/` so a missing log is red. That property is already correct in `gate-report.ts` - do not weaken it.

---

## Appendix - verification log

| Target | Result |
|---|---|
| `ClinicalDashboard.tsx` | 13,404 B, ~300 lines. Renders 7 root modals inline plus 2 from `modals/`. Hardcoded `userEmail = "tricho@scalpai.clinic"` at line 53. Token comment at line 41 (F01). 3 dividers rendered, 2 asserted but absent (F02). |
| `components/modals/` | 2 files: `AddPatientModal.tsx`, `PhotoLightbox.tsx`. Gate claim confirmed. |
| `hooks/` | 10 hooks plus `l2b-hooks.spec.tsx`. `useConditionMapping.ts` has `any`, 4 lint disables, and the only web `TODO` (F12). |
| `DemoWatermark.tsx` | Renders. Returns `null` unless `mode === "demo"`, otherwise a `role="status"` banner. Correct. |
| `DashboardShell.tsx` | Renders `<DemoWatermark mode={dataMode} surface="dashboard" />` at line 31. Correct. |
| `data/dashboard-samples.ts` | DEV-guarded on both exports via `import.meta.env.DEV ? ... : []`. Ternary, not import-time exclusion (F13). |
| `NeuralSegmentationOverlay.tsx` | Zero `SAMPLE_*` imports, confirmed. `detections = []` default, keyboard-accessible markers. Untranslated alt plus unprovable HUD claims (F05). |
| `components/sections/` | 7 files. `HologramSection` uses `lazy` + `Suspense` + `FeatureErrorBoundary` + `contentVisibility` - the gate's PASS is confirmed. |
| `m1b-runtime-wiring.spec.ts` | 2 tests, pure `readFileSync` + `toContain`. Satisfied by the F01 comment. |
| `m5-blockers.spec.ts` | 5 describes. Mostly source greps; the `formatDate`/i18n assertions are genuinely behavioural. 7 assertions rest on the F01 comment. |
| `tools/conformance/exceptions.json` | 10 exceptions, all ADR-referenced, no expiry, broken indentation (F16). `production-mocks` entries confirmed removed. |
| `.github/workflows/ci.yml` | 7 jobs: `lockfile`, `verify`, `security`, `e2e-smoke`, `backup-restore`, `deployment`, `gate`. Every gate flows through `run-gate.sh`. |
| `tools/ci/gate-report.ts` | 25 `REQUIRED_GATES`, exactly matching the workflow. No a11y, i18n, integration or perf gate (F15). |
| `ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md` | Phase 4 "NOT STARTED" vs Success Checklist "[x] Phase 4" - self-contradictory (F17). |
| `WEAKNESSES-V2-10-PHASES.md` | Header claims all 10 phases closed, M1 and L2 complete (F18). |
| `performance.mark` | 0 occurrences repo-wide (F20). |
| `eslint-disable` | 2 occurrences repo-wide (F21). |
| `dir="rtl"` | 8 files, ~10 occurrences (F03). |

**END OF REMEDIATION PLAN**
