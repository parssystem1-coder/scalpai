# ClinicalDashboard Refactor: 5-Phase Breakdown Plan

**Status:** Planning | **Owner:** @parssystem1-coder | **Target Completion:** Phase 1-3 by EOQ

## Overview

`apps/web/src/components/ClinicalDashboard.tsx` is a monolithic 111 KB component. This document outlines a 5-phase refactoring plan to decompose it into smaller, testable, independently translatable units without changing behavior.

**Success Criteria:** No visual/functional change; only file structure and i18n integration.

---

## Phase 1: Extract Data & Constants

**Goal:** Separate static data and protocol definitions from component logic.

### Files to Create

- `apps/web/src/data/dashboard-samples.ts`
  - `SAMPLE_PATIENTS` array
  - `SAMPLE_ANALYSES` array
  - `DEMO_CLINIC_DATA` object
  - All TypeScript interfaces for sample data

- `apps/web/src/data/treatment-protocols.ts`
  - `HARDCODED_PROTOCOLS` array
  - Protocol TypeScript definitions
  - Symptom-to-protocol mapping logic (if any)

### Success Criteria

- [x] Both files export named constants
- [x] No JSX or React imports in these files
- [x] ClinicalDashboard still works after importing from these files
- [x] Type safety: all imports fully typed
- [x] No component-level logic in data files

### Size Reduction

- **Before:** 111 KB (ClinicalDashboard.tsx)
- **After:** ~100 KB (ClinicalDashboard.tsx) + 11 KB (data files)

### Dependencies

- **Blocks:** Phase 2 (header/tabs extraction needs stable imports)
- **Blocked By:** None

---

## Phase 2: Extract Header & Tabs Navigation

**Goal:** Move top-level UI (title, sync status, clinic selector, tab controls) into standalone components.

### Files to Create

- `apps/web/src/components/DashboardHeader.tsx`
  - Title + subtitle rendering
  - Sync status indicator (online/offline badge)
  - Active clinic selector
  - Language toggle (if any)
  - Props: `clinicName: string; isOnline: boolean; onClinicChange?: (clinicId: string) => void`

- `apps/web/src/components/DashboardTabs.tsx`
  - Tab buttons: Patients | Scalp Map | Analytics
  - Active tab state management (pass through props, no local state)
  - Accessibility: `role="tablist"`, `aria-selected`, etc.
  - Props: `activeTab: 'patients' | 'scalpMap' | 'analytics'; onTabChange: (tab: string) => void`

### Success Criteria

- [x] Both components are pure presentational (no data fetching)
- [x] Props-driven (ClinicalDashboard controls state)
- [x] Full keyboard navigation (tabs accessible via arrow keys)
- [x] ARIA roles correct (`tablist`, `tabpanel`)
- [x] Responsive layout maintained

### Size Reduction

- **Before:** 100 KB (ClinicalDashboard.tsx)
- **After:** ~75 KB (ClinicalDashboard.tsx + subtree)

### Dependencies

- **Blocks:** Phase 3 (main content sections depend on tab state)
- **Blocked By:** Phase 1 (needs stable data imports)

---

## Phase 3: Extract Main Content Sections

**Goal:** Split the three major content areas (patients list, scalp map, analytics) into independent sections.

### Files to Create

- `apps/web/src/components/sections/PatientListSection.tsx`
  - Patient card grid rendering
  - Click handler: navigate to patient detail or open editor
  - Search/filter state (local to this section, or lifted?)
  - Props: `patients: Patient[]; onSelectPatient?: (id: string) => void`

- `apps/web/src/components/sections/ScalpMapSection.tsx`
  - Embeds `ScalpMap` component
  - Zone selection state
  - Heatmap metric toggle (density, erythema, sebum)
  - Props: `zones: ZoneClinicalData[]; onZoneSelect?: (zone: ZoneClinicalData) => void`

- `apps/web/src/components/sections/AnalyticsSection.tsx`
  - Chart rendering (waveform, radar, before-after)
  - Date range picker (if any)
  - Aggregation by clinic, cohort, etc.
  - Props: `data: AnalyticsData; dateRange?: [Date, Date]`

### Success Criteria

- [x] Each section is independently renderable
- [x] Props clearly define the data contract
- [x] No cross-section state coupling (each manages own filter/sort)
- [x] Responsive grid layout preserved
- [x] Embedded 3D/visualization components (ScalpMap, charts) still render

### Size Reduction

- **Before:** 75 KB (ClinicalDashboard.tsx + header/tabs)
- **After:** ~40 KB (ClinicalDashboard.tsx, main sections in separate files)

### Dependencies

- **Blocks:** Phase 4 (modals depend on state from these sections)
- **Blocked By:** Phase 2 (needs tab state management from parent)

---

## Phase 4: Extract Modal & Side Panels

**Goal:** Move 3D education, workflow timeline, and hologram rendering into separate modal components.

### Files to Create

- `apps/web/src/components/modals/EducationSection.tsx`
  - 3D visualization (interactive follicle, hair growth stages)
  - Educational text/captions
  - Close button
  - Props: `isOpen: boolean; onClose: () => void`

- `apps/web/src/components/modals/WorkflowTimeline.tsx`
  - Step-by-step care pathway
  - Expandable sections per step
  - Milestone badges
  - Props: `steps: WorkflowStep[]; currentStep?: number`

- `apps/web/src/components/modals/HologramSection.tsx`
  - 3D hologram rendering (luxury scalp model)
  - Mode toggle (silk/follicle/scan)
  - Marker selection
  - Props: `initialMode?: VisualMode; markers?: Marker[]`

### Success Criteria

- [x] Each modal can be opened/closed independently
- [x] No data fetching within modals (all props-driven)
- [x] 3D rendering performance not degraded
- [x] Keyboard escape to close
- [x] Focus management (focus trap on open, restore on close)

### Size Reduction

- **Before:** 40 KB (ClinicalDashboard.tsx + sections)
- **After:** ~20 KB (ClinicalDashboard.tsx as orchestrator)

### Dependencies

- **Blocks:** Phase 5 (i18n touches all components)
- **Blocked By:** Phase 3 (modals triggered by section actions)

---

## Phase 5: i18n Completion & Testing

**Goal:** Integrate i18n into all dashboard-related components and add unit tests.

### Tasks

#### 5a. i18n Keys Addition

Add to `apps/web/src/i18n.ts` under `dashboard` namespace:

```typescript
dashboard: {
  // Header
  title: "Clinical Trichology Dashboard",
  activeClinic: "Active Clinic",
  syncStatus: "Sync Status",
  syncOnline: "Online",
  syncOffline: "Offline",
  
  // Tabs
  patientsTab: "Patients Directory",
  scalpMapTab: "Scalp Map",
  analyticsTab: "Analytics & Reports",
  
  // Sections
  patientsList: {
    title: "Patient Registry",
    noPatients: "No patients registered",
    addPatient: "Add New Patient",
    searchPlaceholder: "Search by name or phone",
  },
  scalpMap: {
    title: "Scalp Zone Analysis",
    zoneInfo: "Zone: {{name}}",
    severity: "Severity: {{level}}",
  },
  analytics: {
    title: "Clinical Metrics",
    dateRange: "Date Range",
    export: "Export Report",
  },
  
  // Modals
  education: {
    title: "Hair Growth Education",
    close: "Close",
  },
  workflow: {
    title: "Care Pathway",
    step: "Step {{number}}",
  },
  hologram: {
    title: "3D Scalp Visualization",
    modes: "Visualization Modes",
  },
}
```

#### 5b. Component Updates

Each component (`DashboardHeader`, `DashboardTabs`, `PatientListSection`, etc.):

```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();

// Replace hardcoded strings:
// Before: <h1>Clinical Trichology Dashboard</h1>
// After:  <h1>{t('dashboard.title')}</h1>
```

#### 5c. Unit Tests

- `apps/web/src/components/__tests__/DashboardHeader.spec.tsx`
- `apps/web/src/components/__tests__/DashboardTabs.spec.tsx`
- `apps/web/src/components/__tests__/PatientListSection.spec.tsx`
- `apps/web/src/components/__tests__/ScalpMapSection.spec.tsx`
- `apps/web/src/components/__tests__/AnalyticsSection.spec.tsx`
- `apps/web/src/components/__tests__/ClinicalDashboard.integration.spec.tsx`

**Coverage Target:** ≥80% for each component.

### Success Criteria

- [x] All hardcoded strings in dashboard components moved to i18n
- [x] Each component has `useTranslation()` hook
- [x] Persian digits rendered with `faNum()` where needed
- [x] Unit tests pass: `npm run test:web`
- [x] Type checking passes: `npm run typecheck:repo`
- [x] No English fallback strings leak into Persian UI

### Dependencies

- **Blocks:** None (final phase)
- **Blocked By:** Phase 4 (all components must exist)

---

## Dependency Graph

```
Phase 1 (Data & Constants)
   ↓
Phase 2 (Header & Tabs)
   ↓
Phase 3 (Content Sections)
   ↓
Phase 4 (Modals & Panels)
   ↓
Phase 5 (i18n & Tests)
```

**Sequential execution recommended.** Parallel work only possible if:
- Phase 1 is complete (data APIs stable)
- Phase 2 and 3 can overlap once Phase 1 is done (both consume the same data)

---

## Timeline Estimate

| Phase | Effort | Timeline | Owner |
|-------|--------|----------|-------|
| 1 | 2-3 hrs | Day 1 | @parssystem1-coder |
| 2 | 3-4 hrs | Day 2 | @parssystem1-coder |
| 3 | 4-5 hrs | Days 3-4 | @parssystem1-coder |
| 4 | 3-4 hrs | Day 5 | @parssystem1-coder |
| 5 | 4-6 hrs | Days 6-7 | @parssystem1-coder |
| **Total** | **16-22 hrs** | **1-2 weeks** | |

---

## Success Checklist

- [ ] Phase 1: Data extraction complete, ClinicalDashboard imports both files
- [ ] Phase 2: Header & Tabs extracted, tab state flows through props
- [ ] Phase 3: Sections extracted, content renders in active tab
- [ ] Phase 4: Modals extracted, modal open/close works
- [ ] Phase 5: i18n keys added, all components use `useTranslation()`, tests green
- [ ] No visual regression (screenshots match before/after)
- [ ] No console errors or warnings
- [ ] Bundle size reduced (check with `npm run build`)
- [ ] Lighthouse score maintained (≥90)

---

## Post-Refactor Benefits

1. **Maintainability:** Each component ≤30 KB, single responsibility
2. **Testability:** 5 independently testable sub-components
3. **Reusability:** Sections (PatientList, ScalpMap) usable in other pages
4. **i18n Ready:** All strings centralized, easy to translate
5. **Performance:** Lazy-loadable modals reduce initial bundle
6. **Collaboration:** Parallel work possible on different phases

---

## References

- [ClinicalDashboard.tsx](../../apps/web/src/components/ClinicalDashboard.tsx) (current, pre-refactor)
- [WEAKNESSES-V2-10-PHASES.md](./WEAKNESSES-V2-10-PHASES.md) (context: M5 is related i18n completion)
- [i18n.ts](../../apps/web/src/i18n.ts) (translation source)

---

**Last Updated:** 2026-09-09 | **Status:** Ready for Phase 1 kickoff
