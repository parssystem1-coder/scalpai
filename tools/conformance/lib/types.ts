export interface Violation {
  rule: string;
  file: string;
  message: string;
  fix: string;
}

export interface RuleContext {
  root: string;
}

/**
 * A conformance rule is a machine-checkable counterpart of a bullet in
 * docs/engineering-rules.md. Every rule must ship with fixtures + a self-test
 * proving it detects its own violation (ADR-21).
 */
export interface Rule {
  name: string;
  /** engineering-rules.md section this rule enforces */
  source: string;
  check(ctx: RuleContext): Violation[] | Promise<Violation[]>;
}
