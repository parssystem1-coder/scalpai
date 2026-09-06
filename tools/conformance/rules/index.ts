import type { Rule } from "../lib/types.js";
import {
  dbAccess,
  encodingGuard,
  errorContract,
  featureGate,
  phiLogs,
  platformBoundaries,
  secrets,
  tenantSafety,
} from "./v1.js";
import { packageCallSite, packageManager, productionMocks } from "./v2.js";

/**
 * v1 + v2 rule set (ADR-21 / ADR-0037, playbook 1.8). Each rule ships with
 * fixtures + self-tests proving it detects its own violation.
 */
export const RULES: Rule[] = [
  tenantSafety,
  dbAccess,
  phiLogs,
  secrets,
  errorContract,
  featureGate,
  platformBoundaries,
  encodingGuard,
  packageCallSite,
  productionMocks,
  packageManager,
];
