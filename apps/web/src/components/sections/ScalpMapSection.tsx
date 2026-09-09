import React from "react";
import { useTranslation } from "react-i18next";
import ScalpMap, { type ZoneClinicalData } from "../ScalpMap.js";

export interface ScalpMapSectionProps {
  /** Display name of the patient the live scalp map belongs to. */
  patientName: string;
  /**
   * Fired when the clinician dives under the skin of a zone.
   * ClinicalDashboard uses it to drive the 3D education modal.
   */
  onZoneSelect?: (zone: ZoneClinicalData) => void;
}

/**
 * SECTION 2 — Live scalp map hero + "dive under skin" transition.
 *
 * Zone clinical data and heatmap metric toggles stay inside `ScalpMap`
 * itself, so this wrapper only owns layout and the zone-select bridge.
 *
 * Phase 5: the wrapper carries no copy of its own, so i18n here is the
 * accessible name of the landmark (`dashboard.scalpMap.title`).
 */
export const ScalpMapSection: React.FC<ScalpMapSectionProps> = ({
  patientName,
  onZoneSelect,
}) => {
  const { t } = useTranslation();

  return (
    <section
      id="section-scalp-map"
      className="scroll-mt-28 space-y-6"
      aria-label={t("dashboard.scalpMap.title")}
    >
      <ScalpMap
        patientName={patientName}
        onDiveUnderSkin={(zone: ZoneClinicalData) => onZoneSelect?.(zone)}
      />
    </section>
  );
};

export default ScalpMapSection;
