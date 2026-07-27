import type { ScalpRegionId } from '../../lib/scalpRegions';
// ایمپورت به‌عنوان asset (نه مسیر مطلق '/...'): Vite مسیر نهایی را خودش
// نسبت به base می‌سازد. با مسیر مطلق، در نسخهٔ بستهٔ Electron که صفحه با
// file:// لود می‌شود، مرورگر دنبال «ریشهٔ درایو» می‌گشت (file:///D:/...svg)
// و تصویر نواحی سر خراب/نامرئی می‌شد — در حالی که در حالت dev (http://localhost)
// همان مسیر درست کار می‌کرد.
import scalpRegionsVector from '../../assets/scalp-regions-vector.svg';

export type ScalpRegionMapProps = {
  selectedId: ScalpRegionId | null;
  assignedIds: Set<ScalpRegionId>;
  onSelect: (id: ScalpRegionId) => void;
  hint?: string;
};

type RegionDef = {
  id: ScalpRegionId;
  label: string;
  d: string;
};

/**
 * Paths follow the visible cyan borders in the 1024×1024 reference.
 * The underlying artwork is a true vector SVG generated from that exact image.
 */
const REGIONS: readonly RegionDef[] = [
  {
    id: 'frontal',
    label: 'Frontal',
    d: 'M175 395 C210 385 290 385 325 395 L345 490 C340 540 310 585 250 605 C190 585 160 540 155 490 Z',
  },
  {
    id: 'hairline',
    label: 'Hairline',
    d: 'M155 285 C205 260 300 260 350 285 C345 330 335 370 325 395 C285 385 215 385 175 395 C165 370 160 330 155 285 Z',
  },
  {
    id: 'rightTemporal',
    label: 'Right Temporal',
    d: 'M105 320 C120 300 135 290 155 285 C160 330 165 370 175 395 C165 430 160 485 155 545 C125 560 100 525 90 455 C85 395 90 350 105 320 Z',
  },
  {
    id: 'leftTemporal',
    label: 'Left Temporal',
    d: 'M350 285 C370 290 390 300 405 320 C420 350 425 395 420 455 C410 525 385 560 355 545 C350 485 345 430 325 395 C335 370 345 330 350 285 Z',
  },
  {
    id: 'crown',
    label: 'Vertex',
    d: 'M665 190 C705 160 775 160 815 190 C835 215 840 250 825 275 C805 300 780 315 740 315 C700 315 675 300 655 275 C640 250 645 215 665 190 Z',
  },
  {
    id: 'topMidscalp',
    label: 'Mid-scalp',
    d: 'M655 275 C685 305 705 315 740 315 C775 315 795 305 825 275 C845 340 850 410 825 485 C800 510 775 525 740 525 C705 525 680 510 655 485 C630 410 635 340 655 275 Z',
  },
  {
    id: 'occipital',
    label: 'Occipital',
    d: 'M655 505 C690 520 710 525 740 525 C770 525 790 520 825 505 C845 555 840 615 815 650 C785 675 695 675 665 650 C640 615 635 555 655 505 Z',
  },
  {
    id: 'rightParietal',
    label: 'Right Parietal',
    d: 'M575 285 C600 255 625 245 655 275 C635 340 630 410 655 485 L665 505 C645 555 610 570 580 525 C555 480 545 405 550 345 C555 315 560 300 575 285 Z',
  },
  {
    id: 'leftParietal',
    label: 'Left Parietal',
    d: 'M825 275 C855 245 880 255 905 285 C920 300 925 315 930 345 C935 405 925 480 900 525 C870 570 835 555 815 505 L825 485 C850 410 845 340 825 275 Z',
  },
] as const;

function regionClass(
  id: ScalpRegionId,
  selectedId: ScalpRegionId | null,
  assignedIds: Set<ScalpRegionId>,
): string {
  if (assignedIds.has(id)) return 'scalp-hotspot assigned';
  if (selectedId === id) return 'scalp-hotspot selected';
  return 'scalp-hotspot';
}

export default function ScalpRegionMap({
  selectedId,
  assignedIds,
  onSelect,
  hint,
}: ScalpRegionMapProps) {
  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-cyan-500/30 bg-black">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1024 1024"
        className="block w-full h-auto"
        role="img"
        aria-label="Scalp region map"
      >
        <defs>
          <filter id="hotspot-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <style>{`
            .scalp-hotspot {
              fill: rgba(59, 158, 255, 0.01);
              stroke: transparent;
              cursor: pointer;
              transition: fill 140ms ease;
            }
            .scalp-hotspot:hover:not(.assigned):not(.selected) {
              fill: rgba(0, 210, 255, 0.26);
            }
            .scalp-hotspot.selected {
              fill: rgba(251, 191, 36, 0.42);
              filter: url(#hotspot-glow);
            }
            .scalp-hotspot.assigned {
              fill: rgba(34, 197, 94, 0.38);
              cursor: not-allowed;
            }
          `}</style>
        </defs>

        {/* Exact vectorized artwork; no PNG is rendered by the app. */}
        <image href={scalpRegionsVector} width="1024" height="1024" />

        {REGIONS.map(region => {
          const assigned = assignedIds.has(region.id);
          return (
            <path
              key={region.id}
              d={region.d}
              className={regionClass(region.id, selectedId, assignedIds)}
              pointerEvents="all"
              onClick={event => {
                event.stopPropagation();
                if (!assigned) onSelect(region.id);
              }}
            >
              <title>{region.label}</title>
            </path>
          );
        })}
      </svg>

      <p className="px-2 py-1.5 text-center text-[10px] text-cyan-200/50">
        {hint || 'Click a region · Gold = selected · Green = uploaded'}
      </p>
    </div>
  );
}
