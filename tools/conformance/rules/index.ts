import type { Rule } from "../lib/types.js";

/**
 * Phase 0 scaffold: rule registry is intentionally empty.
 * Phase 1 task 1.8 fills it with the six v1 rules (ADR-21):
 *   tenant-safety · db-access · phi-logs · feature-gate · error-contract · secrets
 * Every added rule must come with fixtures + a self-test in this folder.
 */
export const RULES: Rule[] = [];
