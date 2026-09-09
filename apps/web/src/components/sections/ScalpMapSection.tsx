import React from "react";
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
 */
export const ScalpMapSection: React.FC<ScalpMapSectionProps> = ({
  patientName,
  onZoneSelect,
}) => {
  return (
    <section id="section-scalp-map" className="scroll-mt-28 space-y-6">
      <ScalpMap
        patientName={patientName}
        onDiveUnderSkin={(zone: ZoneClinicalData) => onZoneSelect?.(zone)}
      />
    </section>
  );
};

export default ScalpMapSection;
