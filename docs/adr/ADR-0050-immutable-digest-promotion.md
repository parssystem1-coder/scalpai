# ADR-0050: immutable digest promotion, SBOM/provenance and the rollback drill

- **Status:** accepted for Phase 4 Gate row #6 (release path: digest promotion + rollback)
- **Date:** 2026-09-21
- **Scope:** `.github/workflows/release.yml` (new), `.github/workflows/nightly.yml` (drill job), `.github/workflows/ci.yml` (promotion + drill gates), `ops/prod.yml`, `tools/ci/release-*.sh`

## Context

Criterion 6 of `docs/PHASE4-CLOSURE-GATE.md` failed: CI builds both images inside the
runner and never promotes them, so what runs in staging/prod is rebuilt from source and
can drift from what was tested. There is no release record, no SBOM/provenance, and no
rollback policy — the deployment job's images are build-only tags that never leave the host.

## Decision

1. **Build once, promote the digest, never a tag.** `release.yml` (on `main` and
   `workflow_dispatch`, with `workflow_dispatch` inputs `staging_image_tag` and
   `promote_to_prod_image_tag` acting as the documented approval gate) builds `api` and
   `web` through `ops/prod.yml`, records `sha256` digests, pushes the **digests** (not
   tags) to GHCR, writes SBOM (CycloneDX, Trivy) and SLSA-provenance (Attest) attestations
   into `docs/releases/releases-ledger.jsonl` (committed via PR to `main`), and gates the
   promotion of the prod image tag on the attestation + digest match and the staging
   health job passing. **Prod and staging always deploy the same digest**; the tag only
   documents which environment is currently pointed at it.

2. **`ops/prod.yml` accepts digest pinning.** `api`/`web`/`migrate` gain an `image:`
   line (`${SCALPAI_API_IMAGE:-scalpai-api:${SCALPAI_RELEASE_TAG:-dev-local}}`,
   same pattern for web) so an operator can deploy exactly the digest CI promoted. The
   runtime migration gate (`migrate-image`) asserts the deploy-time image resolves and
   equals the digest recorded in the ledger. The local build path is untouched: docker
   compose still prefers the local build when the `image:` reference is absent or only a
   tag, so the CI "build + scan + boot" job keeps working with no env change.

3. **Rollback is a drill with recorded evidence, not a runbook paragraph.**
   `tools/ci/release-rollback-drill.sh` boots the stack from digest A, passes health,
   records digest B, rolls back to A (with a down/up cycle), passes health on A, records
   the roll-forward, and prints a single-line machine-readable summary plus writes
   `ci-evidence/release-rollback-drill.log` via `tools/ci/run-gate.sh`. Every step is a
   named gate (`release-promote`, `release-attest`, `release-digest-pin`, `release-drill`)
   that fails loudly.

4. **A spec locks the contracts** (`tools/ops/release-promotion.phase5.spec.ts`):
   workflow-level gates exist, image references are digest-tagged or explicitly
   parameterized (never `:latest`), the ledger is append-only (never rewritten in
   release.yml/nightly.yml/ci.yml), the rollback script enforces stage order and digest
   validation, and all invariants mirror `docs/PHASE4-REMEDIATION-PLAN.md` C6 acceptance.

## Consequences

- Deleting `release.yml` or the nightly drill job returns the repo to the pre-wave-5
  behaviour (the CI deployment job degrades to build-only) — the decision is additive.
- The digest is now the unit of release: two environments that claim to run "the same
  release" can be diffed byte-for-byte via their ledger entries.
- `docs/releases/releases-ledger.jsonl` is append-only; the only allowed edit is adding
  a new line. Rewriting history in the ledger file fails the regression spec.

## Evidence

- CI (`deployment` job) runs `release-promote`, `release-attest`, `release-digest-pin`
  and `release-drill` as named gates through `tools/ci/run-gate.sh`.
- `nightly.yml` runs the same drill nightly against a fresh boot (`release-drill` job).
- `tools/ops/release-promotion.phase5.spec.ts` asserts the contracts above and self-tests
  every regression case (positive + negative) inline, so the spec cannot rot into a
  grep-only green.
