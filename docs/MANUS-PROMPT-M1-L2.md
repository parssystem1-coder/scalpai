# Prompt for Manus AI — Fix M1 & L2 (Phase 10 Remaining Items)

## Context

This is a ScalpAI v2 project (monorepo with npm workspaces + Turborepo). We have 2 remaining items in Phase 10 of our weaknesses roadmap that need to be fixed. The project is at `D:\scalpai`.

**Tech stack:** React 19 + Vite + Tailwind (apps/web), NestJS (apps/api), TypeScript 5.9, Vitest for testing.

---

## TASK 1: M1 — Remove SAMPLE data conformance exceptions

### Problem

Two conformance exceptions in `tools/conformance/exceptions.json` (lines 40-52) are still open. The `production-mocks` rule flags `ClinicalDashboard.tsx` and `NeuralSegmentationOverlay.tsx` because they import from files containing SAMPLE_ data.

**Current exceptions (to be REMOVED):**
```json
{
  "rule": "production-mocks",
  "file": "apps/web/src/components/ClinicalDashboard.tsx",
  "adr": "ADR-0043",
  "reason": "SAMPLE_PATIENTS/SAMPLE_IMAGES demo data: still the OPEN half of phase 10 M1..."
},
{
  "rule": "production-mocks",
  "file": "apps/web/src/components/NeuralSegmentationOverlay.tsx",
  "adr": "ADR-0043",
  "reason": "SAMPLE_DETECTIONS overlay data: open half of phase 10 M1, to be replaced by real detections"
}
```

### What needs to happen

1. **Extract types from `dashboard-samples.ts`** into a new file `apps/web/src/data/dashboard-types.ts`:
   - Move the `Patient` interface
   - Move the `TrichoscopyImage` interface
   - Move any other type definitions that components need
   - Keep `SAMPLE_PATIENTS` and `SAMPLE_IMAGES` data arrays in `dashboard-samples.ts` (they are already gated behind `import.meta.env.DEV`)

2. **Update imports in components** to use `dashboard-types.ts` instead of `dashboard-samples.ts` for type-only imports:
   - `apps/web/src/components/ClinicalDashboard.tsx` line 33: change `import type { TrichoscopyImage } from "../data/dashboard-samples"` to `import type { TrichoscopyImage } from "../data/dashboard-types"`
   - `apps/web/src/components/sections/PatientListSection.tsx` line 7: change `import type { Patient } from "../../data/dashboard-samples.js"` to `import type { Patient } from "../../data/dashboard-types"`
   - Check all other files that import types from `dashboard-samples.ts` and update them

3. **Update `dashboard-samples.ts`** to import types from `dashboard-types.ts` instead of defining them inline (so the type definitions live in one place)

4. **For `NeuralSegmentationOverlay.tsx`**: The `SAMPLE_DETECTIONS` usage needs to be either:
   - Removed entirely (if it's only used for demo/overlay text), OR
   - Gated behind `import.meta.env.DEV` like the other SAMPLE_ data, OR
   - Moved to a separate demo-only file with proper gating

5. **Remove the two exceptions** from `tools/conformance/exceptions.json` (lines 40-52)

6. **Run the conformance check** to verify the rule passes:
   ```bash
   npx tsx tools/conformance/run.ts
   ```

7. **Run production-stripping** to verify no SAMPLE_ data in production output:
   ```bash
   npm run build
   npm run production:strip
   ```

8. **Run tests** to verify nothing breaks:
   ```bash
   npx vitest run apps/web/src/__tests__/m5-blockers.spec.ts
   npx vitest run apps/web/src/components/__tests__/
   ```

### Files involved
- `apps/web/src/data/dashboard-samples.ts` — extract types out
- `apps/web/src/data/dashboard-types.ts` — NEW file for type definitions
- `apps/web/src/components/ClinicalDashboard.tsx` — update import
- `apps/web/src/components/sections/PatientListSection.tsx` — update import
- `apps/web/src/components/NeuralSegmentationOverlay.tsx` — fix SAMPLE_DETECTIONS
- `tools/conformance/exceptions.json` — remove 2 exceptions
- Any other files importing types from dashboard-samples

---

## TASK 2: L2 — Extract modals and inline sections from ClinicalDashboard

### Problem

`apps/web/src/components/ClinicalDashboard.tsx` is still 1,417 lines. Phase 4 of the dashboard refactor has NOT been started. The following are still inline in ClinicalDashboard:

1. **Fullscreen photo lightbox** (~270 lines) — the entire lightbox modal with zoom, pan, rotation controls
2. **Add-patient form** (~85 lines) — the inline add patient modal
3. **Hologram/3D section** (~60 lines) — the 3D scalp model section

### What needs to happen

#### Step 1: Create `apps/web/src/components/modals/` directory

#### Step 2: Extract Lightbox into its own component
- Create `apps/web/src/components/modals/PhotoLightbox.tsx`
- Move the entire lightbox JSX from ClinicalDashboard (look for `{previewPhotoModal && (` block, roughly lines 1251-1523)
- Include all state and handlers related to lightbox: `lightboxZoom`, `lightboxPan`, `lightboxRotation`, `isLightboxPanning`, `handleLightboxWheel`, `handleLightboxMouseDown`, `handleLightboxMouseMove`, `handleLightboxMouseUp`, `handleLightboxDoubleClick`, `handleLightboxTouchStart`, `handleLightboxTouchMove`, `handleLightboxTouchEnd`, `resetLightboxZoom`
- Pass necessary props: `previewPhotoModal`, `selectedPatient`, `onClose`, `onDeletePhoto`, `onCompare`, `onInspectHud`, photo data
- Use `useTranslation()` for all strings

#### Step 3: Extract Add Patient Modal
- Create `apps/web/src/components/modals/AddPatientModal.tsx`
- Move the add-patient form JSX from ClinicalDashboard (look for the add patient modal block)
- Pass necessary props: `isOpen`, `onClose`, `onAddPatient` callback

#### Step 4: Extract Hologram/3D Section
- Create `apps/web/src/components/modals/HologramSection.tsx` OR keep it as `components/sections/HologramSection.tsx`
- Move the 3D model section (look for `<section id="section-3d-model"` block)
- This uses `React.lazy` for `LuxuryScalp3D` — keep the lazy loading

#### Step 5: Update ClinicalDashboard.tsx
- Import the new extracted components
- Replace inline JSX with component references
- Move related state/hooks to the new components or pass as props
- ClinicalDashboard should shrink to approximately 800-900 lines

#### Step 6: Ensure all modal components follow these patterns
- Use `useTranslation()` for ALL user-facing strings
- Accept `isOpen`/`onClose` props for modals
- Use `role="dialog"` and `aria-modal="true"` on modal containers
- Add `Escape` key handler to close modals
- Add focus trap (at minimum: focus first focusable element on open, return focus on close)

### Files to create
- `apps/web/src/components/modals/PhotoLightbox.tsx`
- `apps/web/src/components/modals/AddPatientModal.tsx`
- `apps/web/src/components/sections/HologramSection.tsx` (or `modals/`)

### Files to modify
- `apps/web/src/components/ClinicalDashboard.tsx` — remove extracted code, add imports
- `apps/web/src/components/DashboardShell.tsx` — if any shared chrome was affected

### Verification
```bash
# TypeCheck must pass
npx turbo typecheck

# Lint must pass  
npm run lint

# All tests must pass
npx vitest run

# Build must succeed
npm run build
```

---

## IMPORTANT NOTES

1. **DO NOT change any business logic** — only move code between files
2. **DO NOT change the visual appearance** — same classes, same layout
3. **Keep all existing data-testid attributes** — tests depend on them
4. **Keep all existing CSS classes** — Tailwind classes must remain identical
5. **Import types from `dashboard-types.ts`** (created in Task 1) not from `dashboard-samples.ts`
6. **All new components must use `useTranslation()`** from `react-i18next` for strings
7. **Run `npx vitest run` after changes** to verify no test regressions
8. **Run `npx turbo typecheck`** to verify TypeScript correctness
9. **ClinicalDashboard.tsx should be under 1000 lines** after extraction

---

## ACCEPTANCE CRITERIA

### For M1:
- [ ] `tools/conformance/exceptions.json` has NO `production-mocks` exceptions for ClinicalDashboard or NeuralSegmentationOverlay
- [ ] `npx tsx tools/conformance/run.ts` passes with exit code 0
- [ ] `npm run production:strip` passes (no SAMPLE_ in production build)
- [ ] All tests in `apps/web/src/__tests__/` and `apps/web/src/components/__tests__/` pass

### For L2:
- [ ] `apps/web/src/components/modals/` directory exists with extracted components
- [ ] `ClinicalDashboard.tsx` is under 1000 lines
- [ ] `npx turbo typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npx vitest run` passes (all 745+ tests)
- [ ] No visual regression (same CSS classes, same structure)
