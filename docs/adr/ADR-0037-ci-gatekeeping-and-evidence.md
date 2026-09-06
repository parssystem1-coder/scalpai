# ADR-0037: CI gatekeeping, recorded evidence and security scanning

- Status: accepted
- Date: 2026-09-06
- Phase: 5 (CI/CD، تست و گیت‌کیپینگ واقعی)
- Supersedes nothing. Extends ADR-21 (conformance harness), ADR-22 (project graph) and ADR-0036 (npm-only, deployment topology).

## Context

The phase 5 audit found the pipeline claiming more than it did: a job named after
work it did not perform, a coverage number that only covered four packages, a
Playwright suite that could not start (a hardcoded API port and selectors that
never existed), `npm audit`/CodeQL/Dependabot absent, images built but never
scanned, a bundle budget derived from filename prefixes instead of the real
payload, and gate reviews that were signed off from the same prose they were
supposed to verify.

A green checkmark that nobody can trace back to a command is worse than no
checkmark: it converts an unknown into a false certainty.

## Decision

1. **Evidence, not assertions.** Every gate runs through `tools/ci/run-gate.sh`,
   which records the command line, the full output and the exit code in
   `ci-evidence/<gate>.log`. The wrapper always propagates the wrapped exit code.
2. **One place may say PASS.** The `gate` job downloads every evidence artifact
   and runs `tools/ci/gate-report.ts`. It fails when a required gate has no log,
   no recorded command, or a non-zero exit, and a failed re-run always beats an
   earlier green log for the same gate. `REQUIRED_GATES` and `ci.yml` are kept in
   parity by a test, so a silently dropped gate is a red build.
3. **Job names describe work.** `lockfile`, `verify`, `security`, `e2e-smoke`,
   `deployment`, `gate`.
4. **Coverage beyond the logic packages.** `apps/api/src` and the web
   auth/transport/offline paths are measured. The API and web floors (40%) are a
   RATCHET: raise them as suites grow, never lower them to make a build green.
   The API bootstrap and Nest modules are excluded because their real proof is
   the `deployment` job booting the stack from an empty database.
5. **e2e is a gate again.** `@smoke` runs on every PR against a real API + web
   stack; the full tagged suite runs nightly with 30-day artifacts. Removing e2e
   from the PR gate is not an option; the only sanctioned reduction is the tag
   filter, which is visible in `package.json`.
6. **Supply chain.** `npm audit --audit-level=high --omit=dev`, a repository-wide
   secret scan (`tools/secret-scan.ts`), CodeQL and Dependabot. CodeQL carries
   exactly one explicit condition: code scanning requires Advanced Security on a
   private repository, so it runs on public repositories or when the repository
   variable `ENABLE_CODEQL` is `true`. That condition lives in the workflow, not
   in a comment.
7. **Images are scanned.** `tools/ci/image-scan.sh` resolves the image compose
   actually built (`docker compose images -q`), prints the full HIGH+CRITICAL
   report and fails on fixable CRITICAL findings. Raising `BLOCKING_SEVERITY` to
   HIGH is the documented ratchet.
8. **The lockfile is a review event.** `tools/ci/lockfile-review.sh` refuses a
   foreign lockfile, an old lockfile format, a `package.json` change without its
   lockfile, and any dependency resolved outside `registry.npmjs.org`.
9. **The bundle budget measures the browser's work.** `tools/bundle-budget.ts`
   reads the Vite manifest and walks the STATIC import graph from every entry;
   `dynamicImports` are excluded, so a lazy chunk that becomes static is caught
   immediately. No manifest means a failed gate, never a comfortable 0 B.
10. **New conformance rules (M14).** `package-call-site`, `production-mocks` and
    `package-manager`, each with a self-test. Known legacy hits are registered in
    `tools/conformance/exceptions.json` against this ADR - visible debt with an
    owner (phase 10 M1/M2/M4), not a disabled rule.
11. **Runner hygiene.** Concurrency cancellation for superseded runs, and an
    explicit `retention-days` on every uploaded artifact.

## Consequences

- A PR is only green when 20 recorded gates are green. Expect the first runs to
  surface real findings (advisories, image CVEs, e2e gaps): that is the point.
- Evidence bundles are downloadable for 14 days (30 for the merged bundle and the
  nightly run), so a gate review can quote a command and its output instead of
  paraphrasing a document.
- The conformance exceptions list is now the honest inventory of phase 10 debt.
- Every threshold in this ADR is a floor. Lowering one requires a new ADR.
