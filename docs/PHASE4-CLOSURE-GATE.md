# Phase 4 Closure Gate — mandatory reference before Phase 5 entry

**Date:** 2026-09-13  
**Status:** Gate OPEN — all criteria below must PASS before Phase 5 may start  
**Source documents:** Technical Audit Report (root), Phase 4 Closure Plan (root), L2 Playbook (`docs/playbooks/phase10-L2-clinical-dashboard-refactor.md`), ROADMAP (`docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md`), Weaknesses Ledger (`docs/WEAKNESSES-V2-10-PHASES.md`), My Deep Analysis (this session)

---

## Executive Summary

Phase 4 is **NOT CLOSED**. The audit identified 9 blocking findings (P4-B01..P4-B09) and 13 remediation items (P4-R01..P4-R13). My deep code analysis confirms and extends these findings, particularly around the ClinicalDashboard refactor (L2) which remains incomplete despite documentation claiming otherwise.

**Gate Rule:** No work on Phase 5 (Aftercare, Messaging, Billing, Portal) may begin until every item in Section 1 below shows `PASS` with independent evidence (commit + test + CI log).

---

## Section 1 — Blocking Findings (P4-B01..P4-B09) — MUST PASS

| ID | Audit Finding | My Analysis | Evidence Required | Status |
|---|---|---|---|---|
| **P4-B01** | Dashboard uses local state + synthetic IDs for patient/media | **CONFIRMED**: `useDashboardRecords` creates patients with `Date.now()`; `useImageUpload` converts to Data URL; no API/outbox path | Integration test: login → create patient → upload → disconnect → reconnect → refresh → same data visible. No `Date.now()` IDs in `real` path. | ❌ FAIL |
| **P4-B02** | Analysis/capture/PDF use synthetic data; claim "Verified/Signed" without provenance | **CONFIRMED**: `useDashboardAnalysis` uses fixed array + `Math.random()`; capture can submit sample; PDF via `window.print()` with "Verified/Signed" labels | Negative test: report without image/hash/review/report ID must be rejected. No "Verified"/"Signed"/"Prescription" in production path without server proof. | ❌ FAIL |
| **P4-B03** | No branch protection / required checks on `main` | **CONFIRMED**: GitHub ruleset empty; CI exists but not enforced as required check | GitHub API shows ruleset with required `gate report`, review=1, up-to-date branch, no force push, no bypass for admins | ❌ FAIL |
| **P4-B04** | Two Moderate Fastify advisories in runtime | **CONFIRMED**: `npm audit --omit=dev` reports Moderate | `npm audit --audit-level=high --omit=dev` exits 0; or documented time-boxed risk acceptance with owner | ❌ FAIL |
| **P4-B05** | Offline PHI may persist plaintext in IndexedDB | **PARTIAL**: Outbox scopes to clinic/user but encryption envelope not verified; name/phone may enter envelope | IndexedDB inspection after mutation: name/phone ciphertext only. Logout/principal change destroys key. PutObject without encryption fails. | ❌ FAIL |
| **P4-B06** | Release path: local build, no digest promotion/rollback | **CONFIRMED**: CI builds in runner, no registry promotion, no SBOM/provenance/signing, no rollback policy | Release record: commit SHA, digest, migration set, approver, CI link. Staging→prod promotes same digest. Rollback drill in staging. | ❌ FAIL |
| **P4-B07** | Docs contradict: PROGRESS says Phase 4 done, ROADMAP says open | **CONFIRMED**: `WEAKNESSES-V2-10-PHASES.md` header says 10 phases closed; `ROADMAP` shows Phase 4 not started but checklist says done; `PROGRESS.md` unchecked | Single status ledger (this file) with evidence links; all doc files updated to match reality | ❌ FAIL |
| **P4-B08** | No auto-lock on authenticated dashboard | **CONFIRMED**: `AutoLock` component exists but not wrapped on dashboard route | E2E: inactivity timeout triggers lock on all protected routes; refresh/history/tab-close cleans up | ❌ FAIL |
| **P4-B09** | Offline consent enqueues to invalid entity; no PWA SW | **NEEDS VERIFICATION**: `DigitalConsentModal` uses sync outbox; need to verify entity validity and SW presence | Offline consent persists, survives logout/reconnect, syncs on reconnect. Or explicit feature gate if not supported. | ❌ FAIL |

---

## Section 2 — L2 ClinicalDashboard Refactor Deep Analysis (vs Audit P4-R01..P4-R13)

### 2.1 Modal Extraction (Audit P4-R06, L2 Phase 4c)

| Item | Audit Expectation | My Deep Analysis | Status |
|---|---|---|---|
| All modals in `components/modals/` | Yes | **Only 2/9**: `PhotoLightbox`, `AddPatientModal` extracted. 7 remain in root `components/` | ❌ FAIL |
| Escape-to-close on all modals | Yes | **Only 2/10** have Escape handler (`PhotoLightbox`, `AddPatientModal`) | ❌ FAIL |
| Focus trap on all modals | Yes | **0/10** have focus trap | ❌ FAIL |
| Focus restore on close | Yes | **Only 2/10** restore focus (`PhotoLightbox`, `AddPatientModal`) | ❌ FAIL |
| `WorkflowTimeline` exists | Not required | Does NOT exist anywhere (correct — was planned but not built) | ✅ PASS |
| `HologramSection` extracted with lazy 3D | Yes | **YES** — `sections/HologramSection.tsx` wraps `LuxuryScalp3D` with `lazy()` + `Suspense` | ✅ PASS |

### 2.2 Accessibility & i18n (Audit P4-R12, L2 Phase 4d/5)

| Item | Audit Expectation | My Deep Analysis | Status |
|---|---|---|---|
| `dir="rtl"` removed from hardcoded locations | Yes | **Still hardcoded** in: `App.tsx`, `LandingPage.tsx`, `RegisterForm.tsx`, `ProPlansView.tsx`, `DemoBanner.tsx`, `BeforeAfterCompareModal.tsx`, `index.html` | ❌ FAIL |
| Area keys translated (`galleryVision.areaLabel`, `lightbox.title`) | Yes | **NOT DONE** — `photo.area` ("vertex") interpolated raw | ❌ FAIL |
| `userEmail` hardcoded in ClinicalDashboard | Yes | **STILL HARDCODED** — `tricho@scalpai.clinic` | ❌ FAIL |
| Automated locale-switch check | Yes | **NOT EXISTS** — no conformance rule or test | ❌ FAIL |
| ClinicalDashboard integration spec | Yes | **NOT EXISTS** | ❌ FAIL |
| Reduced-motion support | Yes | **NOT VERIFIED** | ❌ FAIL |

### 2.3 Type Safety & Lint (Audit P4-R01)

| Item | Audit Expectation | My Deep Analysis | Status |
|---|---|---|---|
| `useConditionMapping` zero `any` / zero lint suppression | Yes | **HAS `any` and suppression** — needs typed `ConditionKey` contract | ❌ FAIL |

### 2.4 Performance & Bundle (Audit P4-R04, L2 Phase 4d)

| Item | Audit Expectation | My Deep Analysis | Status |
|---|---|---|---|
| 3D rendering performance measured before/after | Yes | **NO `performance.mark/measure`** anywhere in codebase | ❌ FAIL |
| Bundle budget within policy | Yes | **PASS** — 241KB gzip vs 307KB ceiling (65KB headroom) | ✅ PASS |
| `PHI_KEY_RING` template complete | Yes | **NEEDS VERIFICATION** — preflight validation missing | ⚠️ UNKNOWN |

---

## Section 3 — Infrastructure & CI (Audit P4-B03, P4-R03, P4-R04, P4-R07, P4-R10, P4-R11, P4-R13)

| Item | Requirement | Status |
|---|---|---|
| GitHub ruleset on `main` (required checks, review, up-to-date, no admin bypass) | **MISSING** | ❌ FAIL |
| E2E upload against real MinIO/S3 (not mock) | Lane missing | ❌ FAIL |
| `PHI_KEY_RING` preflight validation in template | Schema + placeholder fail-closed missing | ❌ FAIL |
| Caddy proxy trust limited to CIDR + CSP Report-Only | Not implemented | ❌ FAIL |
| Backup health checks RPO/stale alert | Only cron alive check | ❌ FAIL |
| Logging rotation/retention + Caddy validate | Policy missing | ❌ FAIL |
| Node version pinned in CI/README/devcontainer | Node 22.23.2 → 26.8 in API Dockerfile only | ⚠️ PARTIAL |

---

## Section 4 — Security & Secrets (Audit P4-B04, P4-R05)

| Item | Requirement | Status |
|---|---|---|
| Fastify/Nest advisory Moderate remediated or accepted | 2 Moderate advisories remain | ❌ FAIL |
| Firebase credentials revoked/rotated + evidence | Historical creds deleted but rotation unproven | ❌ FAIL |

---

## Section 5 — Coverage & Testing (Audit P4-R02, P4-B07)

| Domain | Coverage Threshold Required | Current Status |
|---|---|---|
| Privacy / retention / storage | Line + branch + function ≥ 80% per-domain | ❌ NOT MEASURED |
| Sync / offline / outbox | Line + branch + function ≥ 80% | ❌ NOT MEASURED |
| Dashboard integration / hooks / components | Line + branch + function ≥ 80% | ❌ NOT MEASURED |
| `npm test` runs clean on fresh clone | Must pass without local Postgres/Redis | ❌ FAIL (needs services) |

---

## Section 6 — Release Engineering (Audit P4-B06, P4-R03, P4-R04, P4-R10, P4-R11)

| Requirement | Evidence Needed | Status |
|---|---|---|
| Immutable image promotion + SBOM/provenance/signing | Release record: SHA, digest, migration set, approver, CI link | ❌ FAIL |
| Staging→prod promotes same digest | `prod.yml` uses same digest, no local build | ❌ FAIL |
| Migration integrity (advisory lock, checksum, expand/contract) | Concurrent/modified migration tests pass | ❌ FAIL |
| Rollback application/schema drill in staging | Drill executed and recorded | ❌ FAIL |
| `PHI_KEY_RING` preflight validation | Schema + placeholder fail-closed + secure generation guide | ❌ FAIL |
| Caddy ingress validation + proxy smoke | `caddy validate` + header test in CI | ❌ FAIL |
| Backup freshness alert (RPO, stale=fail) | `last-run.json` with RPO check | ❌ FAIL |

---

## Section 7 — Gate 5 Exit Criteria (from Audit Section 5)

| Gate Domain | Minimum Criterion | Status |
|---|---|---|
| Local dev bootstrap | Documented command; preflight for env/services; `test:unit` + `test:integration` separated | ❌ FAIL |
| Test coverage per-domain | Privacy/retention/storage/sync/dashboard each have line+branch+function ≥80% | ❌ FAIL |
| E2E suite | Login→dashboard reference; real MinIO/S3; upload/resume/tenant-negative; consent; lock; negative report | ❌ FAIL |
| Performance baseline | Versioned baselines for login, patient, gallery, upload, dashboard; Web Vitals + memory/DOM budget | ❌ FAIL |
| Operations drill | Caddy ingress, monitoring scrape/alert, backup freshness, restore drill, release/rollback drill | ❌ FAIL |
| Documentation | Single status ledger with evidence; roadmap/refactor/progress without contradictions | ❌ FAIL |
| Independent gate review | External GATE_REVIEW with PASS + links to commit, CI logs, tests | ❌ FAIL |

---

## Section 8 — Consolidated Remediation Plan (Waves from Audit + L2 Phases)

### Wave 1 — Data Path Integrity (maps to P4-B01, P4-B02, L2 Phase 4c)
- [ ] Decision: dashboard API-first OR demo/read-only
- [ ] Patient/media CRUD → API/query/outbox single path
- [ ] Remove synthetic analysis/capture/PDF from production OR full provenance
- [ ] Authenticated shell with AutoLock + cleanup

**Exit:** E2E login→create→upload→disconnect→reconnect→refresh→logout passes; no synthetic IDs/labels in `real` path.

### Wave 2 — Data Protection & Security (maps to P4-B04, P4-B05, P4-R05)
- [ ] ADR for offline PHI + implementation
- [ ] Encryption policy for media/identifiers (bucket policy + health fail-closed)
- [ ] Fastify/Nest remediation + lockfile update
- [ ] Proxy trust + CSP Report-Only + Firebase closure evidence

**Exit:** Independent security review + audit runtime + secret scan + negative tests green.

### Wave 3 — Release Engineering (maps to P4-B06, P4-R03, P4-R04, P4-R10, P4-R11)
- [ ] GitHub ruleset + release policy enforced
- [ ] Immutable image promotion + SBOM/provenance/signing
- [ ] Migration checksum/advisory lock + expand/contract policy
- [ ] `PHI_KEY_RING` preflight + Caddy validation + logging + backup freshness

**Exit:** Staging deploy with promoted digest, migration, Caddy ingress, rollback drill recorded.

### Wave 4 — Dashboard Completion (maps to P4-R01, P4-R06, P4-R08, P4-R12, L2 Phases 4a-4d)
- [ ] `ConditionKey` + `useConditionMapping` typed (zero `any`, zero suppression)
- [ ] Shared dialog primitive (focus trap/restore, semantic labels) for ALL modals
- [ ] Sync/error/analysis state machine (real data only, redacted)
- [ ] Consent sync or feature gate; PWA policy decision
- [ ] i18n/RTL/motion completion (fa/en parity, reduced-motion)

**Exit:** Dashboard integration suite + accessibility suite + locale parity suite mandatory in CI.

### Wave 5 — Quality Gate & Documentation (maps to P4-B07, Gate 5 Exit)
- [ ] Single status ledger (this file) with evidence links
- [ ] All docs updated: WEAKNESSES, ROADMAP, PROGRESS, playbooks consistent
- [ ] Clean clone bootstrap documented + preflight
- [ ] Per-domain coverage thresholds enforced in CI
- [ ] Real-storage E2E (MinIO/S3) + upload/resume/tenant-negative
- [ ] Performance baselines versioned
- [ ] Operations drill (Caddy, monitoring, backup, restore, rollback)
- [ ] External GATE_REVIEW with PASS + evidence links

---

## Section 9 — Comparison Matrix: Audit vs My Analysis vs L2 Playbook

| Area | Audit Report | My Deep Analysis | L2 Playbook Claim | Reality |
|---|---|---|---|---|
| Modal extraction | Implicit in P4-R06 | **2/9 extracted** | Phase 4c: extract gallery/lightbox/modal host | **INCOMPLETE** |
| Focus trap/restore | P4-R06 | **0/10 modals** | Phase 4d: shared dialog primitive | **MISSING** |
| Escape-to-close | P4-R06 | **2/10 modals** | Not explicit | **INCOMPLETE** |
| `WorkflowTimeline` | Not mentioned | **Does not exist** | Phase 4c: extract | **NOT BUILT** |
| `HologramSection` | Not mentioned | **EXTRACTED + lazy** | Phase 4c: extract | **DONE** |
| `dir="rtl"` hardcoded | P4-R12 | **7 files** | Phase 5: i18n completion | **INCOMPLETE** |
| Area key translation | P4-R12 | **NOT DONE** | Phase 5 | **INCOMPLETE** |
| `userEmail` hardcoded | P4-R12 | **STILL HARDCODED** | Phase 5 | **INCOMPLETE** |
| Performance marks 3D | P4-R04 | **NONE** | L2d: bundle verification | **MISSING** |
| `useConditionMapping` types | P4-R01 | **HAS `any`** | Not explicit | **INCOMPLETE** |
| WorkflowTimeline | Not mentioned | **NOT EXISTS** | Phase 4c | **NOT BUILT** |

---

## Section 10 — Gate Decision

**GATE STATUS: 🔴 RED — DO NOT ENTER PHASE 5**

### Minimum Viable Closure (must all be GREEN)

| # | Criterion | Evidence Type |
|---|---|---|
| 1 | Dashboard API-first path verified by E2E | CI log + test artifact |
| 2 | No synthetic clinical claims in production | Negative test + grep |
| 3 | GitHub ruleset enforced on `main` | GitHub API screenshot |
| 4 | Fastify audit clean or accepted | `npm audit` log + ADR if accepted |
| 5 | Offline PHI encryption verified | IndexedDB inspection + logout test |
| 6 | Release promotion immutable + rollback drill | CI log + staging drill artifact |
| 7 | Docs single source of truth | All markdown files consistent |
| 8 | Auto-lock on all protected routes | E2E video/log |
| 9 | 7 modals extracted to `modals/` + focus trap/restore/Escape on all | Component files + accessibility test |
| 10 | `dir="rtl"` removed from 7 hardcoded files | Grep clean |
| 11 | Area keys translated | i18n keys + component usage |
| 12 | 3D performance marks exist | `performance.mark` in code + measurement report |
| 13 | External GATE_REVIEW PASS | Signed review doc |

---

## Appendix A — File References for Verification

| Path | Purpose |
|---|---|
| `apps/web/src/components/ClinicalDashboard.tsx` | Root component (300 lines after refactor) |
| `apps/web/src/components/modals/` | Target directory for ALL modals |
| `apps/web/src/hooks/useDashboardModals.ts` | Central modal state (needs Escape/focus) |
| `apps/web/src/hooks/useConditionMapping.ts` | Has `any` + suppression |
| `apps/web/src/i18n.ts` | Central i18n + `faNum`/`formatDate` |
| `apps/web/src/components/DemoWatermark.tsx` | Renders only when `mode="demo"` |
| `apps/web/src/data/dashboard-samples.ts` | DEV-gated sample data |
| `.github/workflows/ci.yml` | CI pipeline (must have ruleset enforcement) |
| `tools/ci/gate-report.ts` | Gate evidence verification |
| `docs/WEAKNESSES-V2-10-PHASES.md` | Must reflect actual status |
| `docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md` | Must reflect actual status |
| `docs/PROGRESS.md` | Must reflect actual status |

---

## Appendix B — Change Log

| Date | Author | Change |
|---|---|---|
| 2026-09-13 | AI Assistant | Created from audit report + deep analysis synthesis |

---

**END OF GATE DOCUMENT**

*This document is the single source of truth for Phase 4 closure. No Phase 5 work may begin until every item in Section 1 shows PASS with independent evidence.*