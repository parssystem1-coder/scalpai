# ClinicalDashboard Refactor: 5-Phase Breakdown Plan

**Status:** Phases 1-3 landed, Phase 4 not started, Phase 5 partial | **Owner:** @parssystem1-coder

> **Accuracy note (M5 blocker fix):** this file previously ticked Phase 4 and
> several accessibility claims that do not exist in the code. Every checkbox
> below is now either backed by a file in the repository or left open with the
> gap spelled out. A box may only be ticked together with the file, test or CI
> evidence that proves it.

## Overview

`apps/web/src/components/ClinicalDashboard.tsx` started as a monolithic
component (~111 KB at the time this plan was written, ~73 KB today). This
document outlines a 5-phase refactoring plan to decompose it into smaller,
testable, independently translatable units without changing behavior.

**Success Criteria:** No visual/functional change; only file structure and i18n integration.

---

## Phase 1: Extract Data & Constants — **done (reduced scope)**

**Goal:** Separate static data and protocol definitions from component logic.

### Files created

- `apps/web/src/data/dashboard-samples.ts`
  - `SAMPLE_PATIENTS` array (DEV-gated)
  - `SAMPLE_IMAGES` record (DEV-gated)
  - `Patient` and `TrichoscopyImage` interfaces
  - **Not created:** `SAMPLE_ANALYSES` and `DEMO_CLINIC_DATA` were planned but
    never needed; the dashboard derives analysis state at runtime.

- `apps/web/src/data/treatment-protocols.ts`
  - Protocol constants and their types

### Success Criteria

- [x] Both files export named constants
- [x] No JSX or React imports in these files
- [x] ClinicalDashboard still works after importing from these files
- [x] Type safety: all imports fully typed
- [x] No component-level logic in data files
- [x] Sample data stores ASCII ISO dates; localisation happens at render time
      via `formatDate()` (rules §9)

### Dependencies

- **Blocks:** Phase 2 (header/tabs extraction needs stable imports)
- **Blocked By:** None

---

## Phase 2: Extract Header & Tabs Navigation — **done, accessibility partial**

**Goal:** Move top-level UI (title, sync status, clinic selector, tab controls) into standalone components.

### Files created

- `apps/web/src/components/DashboardHeader.tsx`
  - Title + subtitle rendering, sync status indicator, clinic/version badges,
    modal launchers and logout
  - Props: `userEmail`, `isOnline`, `pendingCount`, `activeSection`,
    `onSectionChange`, the `onOpen*` launchers and `onLogout`

- `apps/web/src/components/DashboardTabs.tsx`
  - Section switcher with `desktop` and `mobile` variants
  - State lives in ClinicalDashboard; the component is pure presentational
  - Props: `activeSection: SectionId; onSectionChange: (id: SectionId) => void; variant?: "desktop" | "mobile"`

### Success Criteria

- [x] Both components are pure presentational (no data fetching)
- [x] Props-driven (ClinicalDashboard controls state)
- [x] Responsive layout maintained (desktop pill nav + mobile scroll bar)
- [x] Each control is a real `<button>`, so Tab/Enter/Space work
- [ ] **Open:** no `role="tablist"` / `role="tab"` / `role="tabpanel"`. The
      component is a scroll-spy navigation that uses `aria-label` +
      `aria-current`, which is the correct pattern for scrolling sections but
      is *not* the tabs pattern this plan promised. Pick one and implement it.
- [ ] **Open:** no arrow-key roving focus between the section buttons.

### Dependencies

- **Blocks:** Phase 3 (main content sections depend on section state)
- **Blocked By:** Phase 1

---

## Phase 3: Extract Main Content Sections — **done (contracts differ from plan)**

**Goal:** Split the three major content areas (patients list, scalp map, analytics) into independent sections.

### Files created

- `apps/web/src/components/sections/PatientListSection.tsx`
  - Patient cards, local search state, radar matrix and telemetry panel
  - Props: `patients`, `selectedPatient`, `onSelectPatient?`, `onAddPatient?`, `onNavigate?`

- `apps/web/src/components/sections/ScalpMapSection.tsx`
  - Thin wrapper that embeds `ScalpMap`
  - Props: `patientName`, `onZoneSelect?` (zones are owned by `ScalpMap`, not
    passed in as the plan assumed)

- `apps/web/src/components/sections/AnalyticsSection.tsx`
  - Metric cards, protocol panel and the AI rerun action
  - Props: `data`, `patientName`, `isAnalyzing`, `onRunAnalysis`,
    `onOpenEducation`, `onOpenPdfReport`, `onNavigate` (no date-range picker
    exists; that was never built)

### Success Criteria

- [x] Each section is independently renderable
- [x] Props clearly define the data contract
- [x] No cross-section state coupling (search state is local)
- [x] Responsive grid layout preserved
- [x] Embedded 3D/visualization components (ScalpMap, charts) still render

### Dependencies

- **Blocks:** Phase 4
- **Blocked By:** Phase 2

---

## Phase 4: Extract Modal & Side Panels — **NOT STARTED**

**Goal:** Move 3D education, workflow timeline, and hologram rendering into separate modal components.

**Reality check:** `apps/web/src/components/modals/` does not exist. The
modals that do exist (`EducationModal.tsx`, `GuidedCaptureModal.tsx`,
`ClinicalPdfReportModal.tsx`, `BeforeAfterCompareModal.tsx`,
`DigitalConsentModal.tsx`, `LicenseDiagnosticsModal.tsx`,
`SyncInspectorModal.tsx`) sit flat in `components/` and predate this plan.
Their open/close state is owned by `hooks/useDashboardModals.ts`. The
fullscreen photo lightbox and the add-record form are still inline in
`ClinicalDashboard.tsx`.

### Files to create

- `apps/web/src/components/modals/WorkflowTimeline.tsx` — does not exist in any form
- `apps/web/src/components/modals/HologramSection.tsx` — the hologram is still an
  inline `<section>` in ClinicalDashboard wrapping the lazy `LuxuryScalp3D`
- Extract the inline lightbox and add-record form out of ClinicalDashboard

### Success Criteria

- [x] Each existing modal can be opened/closed independently (via `useDashboardModals`)
- [x] Existing modals are props-driven for open/close state
- [ ] Modal files live under `components/modals/`
- [ ] Lightbox and add-record form extracted from ClinicalDashboard
- [ ] `WorkflowTimeline` / `HologramSection` extracted
- [ ] **Open:** no `Escape`-to-close handler on the dashboard modals
- [ ] **Open:** no focus trap on open and no focus restore on close
- [ ] 3D rendering performance measured before/after (no measurement exists)

### Dependencies

- **Blocks:** Phase 5 (i18n touches all components)
- **Blocked By:** Phase 3

---

## Phase 5: i18n Completion & Testing — **partial (M5)**

**Goal:** Integrate i18n into all dashboard-related components and add unit tests.

### Tasks

#### 5a. i18n Keys Addition

Keys live in `apps/web/src/i18n.ts` under the `dashboard` namespace, in both
`fa` and `en`: `header.*`, `tabs.*`, `dividers.*`, `emptyState.*`,
`patientList.*`, `galleryVision.*`, `analytics.*`, `hologram.*`,
`addPatient.*`, `lightbox.*`, `toasts.*`, `photoDates.*`, `caliper.*`, `ai.*`.

Two helpers are exported next to them:

- `faNum(value)` — shapes ASCII digits into Persian numerals for display only
- `formatDate(isoDate, locale?)` — renders a stored `YYYY-MM-DD` as Jalali for
  `fa` and ISO for other locales, with ASCII digits so `faNum()` stays the only
  numeral shaper

#### 5b. Component Updates

Each dashboard component resolves copy through `useTranslation()`.

#### 5c. Unit Tests

Existing:

- `apps/web/src/components/__tests__/DashboardHeader.spec.tsx`
- `apps/web/src/components/__tests__/DashboardTabs.spec.tsx`
- `apps/web/src/components/__tests__/PatientListSection.spec.tsx`
- `apps/web/src/components/__tests__/ScalpMapSection.spec.tsx`
- `apps/web/src/components/__tests__/AnalyticsSection.spec.tsx`
- `apps/web/src/__tests__/m5-blockers.spec.ts` (regression guard for the five
  M5 blockers)

Missing:

- `apps/web/src/components/__tests__/ClinicalDashboard.integration.spec.tsx`

**Coverage target:** the ≥80% per-component goal has never been measured; CI
enforces the repo-wide thresholds from `vitest.config`, not a per-component one.

### Success Criteria

- [x] Each dashboard component uses the `useTranslation()` hook
- [x] Persian digits rendered with `faNum()` where needed
- [x] Section dividers, image `alt` text and tag chips resolve through `t()`
- [x] Direction is no longer hardcoded in the dashboard: `dir="rtl"` was removed
      from the dashboard root and the lightbox, so direction follows
      `documentElement.dir`, which `i18n.ts` owns
- [x] Stored dates are ASCII ISO and localised at render time
- [ ] **Open (M5):** `dir="rtl"` still hardcoded outside the dashboard —
      `App.tsx`, `pages/LandingPage.tsx`, `RegisterForm.tsx`, `ProPlansView.tsx`,
      `DemoBanner.tsx`, `BeforeAfterCompareModal.tsx` and `index.html`
- [ ] **Open (M5):** area keys leak raw into copy — `galleryVision.areaLabel`
      and `lightbox.title` interpolate `photo.area` (`"vertex"`) instead of the
      translated area name
- [ ] **Open (M5):** `ClinicalDashboard`'s default `userEmail` is a hardcoded
      literal (`tricho@scalpai.clinic`)
- [ ] **Open:** no automated check that a locale switch leaves no untranslated
      literal behind (a conformance rule would catch regressions properly)
- [ ] ClinicalDashboard integration spec

### Dependencies

- **Blocks:** None (final phase)
- **Blocked By:** Phase 4 for the extraction work; the i18n work is independent

---

## Dependency Graph

```
Phase 1 (Data & Constants)      done
   ↓
Phase 2 (Header & Tabs)         done, a11y gaps
   ↓
Phase 3 (Content Sections)      done
   ↓
Phase 4 (Modals & Panels)       not started
   ↓
Phase 5 (i18n & Tests)          partial
```

**Sequential execution recommended.** The i18n work does not actually depend on
Phase 4 and has been progressing ahead of it.

---

## Timeline Estimate

| Phase | Effort | Status | Owner |
|-------|--------|--------|-------|
| 1 | 2-3 hrs | done | @parssystem1-coder |
| 2 | 3-4 hrs | done (a11y open) | @parssystem1-coder |
| 3 | 4-5 hrs | done | @parssystem1-coder |
| 4 | 3-4 hrs | not started | @parssystem1-coder |
| 5 | 4-6 hrs | partial | @parssystem1-coder |

---

## Success Checklist

- [x] Phase 1: Data extraction complete, ClinicalDashboard imports both files
- [x] Phase 2: Header & Tabs extracted, section state flows through props
- [x] Phase 3: Sections extracted, content renders per section
- [ ] Phase 4: Modals extracted into `components/modals/`, focus/Escape handled
- [ ] Phase 5: every dashboard string translated, tests green, no hardcoded direction
- [ ] No visual regression (no before/after screenshot evidence exists)
- [ ] No console errors or warnings (unverified)
- [ ] Bundle size measured with `npm run build` (see `tools/bundle-budget.ts`; M15 is still open)
- [ ] Lighthouse score measured (never run)

---

## Post-Refactor Benefits

1. **Maintainability:** each extracted component has a single responsibility
2. **Testability:** sections are independently testable
3. **Reusability:** sections usable in other pages
4. **i18n Ready:** strings centralised in `i18n.ts`
5. **Performance:** the 3D stage is already lazy-loaded via `React.lazy`
6. **Collaboration:** parallel work possible across sections

---

## References

- [ClinicalDashboard.tsx](../apps/web/src/components/ClinicalDashboard.tsx)
- [WEAKNESSES-V2-10-PHASES.md](./WEAKNESSES-V2-10-PHASES.md) (M5 tracks the i18n work, L2 the decomposition)
- [i18n.ts](../apps/web/src/i18n.ts) (translation source)

---

**Last Updated:** 2026-09-10 | **Status:** Phase 4 open, Phase 5 partial — M5 blockers closed
