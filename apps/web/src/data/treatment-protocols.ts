// Treatment protocols and clinical formulations
// Currently placeholder; can be extended with HARDCODED_PROTOCOLS if needed

export interface TreatmentProtocol {
  id: string;
  name: string;
  description: string;
  duration: string;
  frequency: string;
}

// Placeholder for future hardcoded protocols
export const TREATMENT_PROTOCOLS: TreatmentProtocol[] = [];
