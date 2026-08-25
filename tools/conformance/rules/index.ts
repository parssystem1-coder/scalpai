import type { Rule } from "../lib/types.js";
import { dbAccess, encodingGuard, errorContract, featureGate, phiLogs, secrets, tenantSafety } from "./v1.js";

/**
 * v1 rule set (ADR-21 / playbook 1.8). Each rule ships with fixtures +
 * self-tests proving it detects its own violation.
 */
export const RULES: Rule[] = [
  tenantSafety,
  dbAccess,
  phiLogs,
  secrets,
  errorContract,
  featureGate,
  encodingGuard,
];
