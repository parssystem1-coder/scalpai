/**
 * FIXTURE - an MCP tool registered with no field whitelist, which is an open
 * door onto whatever the underlying query happened to select. For this product
 * that means PHI.
 *
 * The COMPLIANT tool below it is deliberate: the rule has to discriminate
 * between the two, not just count definitions.
 */
const defineTool = <T>(tool: T): T => tool;

/** Seeded violation: no whitelist, so any column can leave the registry. */
export const patientsSearch = defineTool({
  name: "patients.search",
  description: "search patients by name",
  handler: async (): Promise<unknown[]> => [],
});

/** Compliant: every field this tool may return is named. */
export const patientsSummary = defineTool({
  name: "patients.summary",
  description: "counts only",
  fieldWhitelist: ["id", "createdAt"],
  handler: async (): Promise<unknown[]> => [],
});
