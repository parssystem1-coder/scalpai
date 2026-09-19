export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  createdAt?: string;
  /** ISO `YYYY-MM-DD`. Localise with `formatDate()` before display. */
  lastVisit?: string;
  scalpCondition?: string;
  hairDensity?: number;
  anagenRatio?: number;
  keratinHealth?: number;
  sebumBalance?: number;
  microcirculation?: number;
  stemCellVitality?: number;
}

export interface TrichoscopyImage {
  id: string;
  patientId: string;
  url: string;
  area: "vertex" | "temple" | "frontal" | "occiput";
  /** ISO `YYYY-MM-DD` for stored frames; freshly captured frames carry a label. */
  date: string;
  /** Clinical metrics are optional by contract: they exist only after a real
   *  server-side analysis. `undefined` means "not measured", never "zero". */
  density?: number;
  thickness?: string;
  qualityScore?: number;
  tags?: string[];
  notes?: string;
}
