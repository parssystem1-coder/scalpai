# ADR-0044 - Phase 10 (batch 2): delete the debt instead of registering it

- **Status:** accepted
- **Date:** 2026-09-08
- **Relates to:** ADR-0043 (phase 10 batch 1), ADR-0036 (npm is the only package
  manager), ADR-0037 (evidence-carrying gates)
- **Weaknesses addressed:** M4/M16, R14, PR #21/#23
- **Weaknesses still NOT addressed:** M1, M5b, M14, M15, L1, L2

## Context

ADR-0043 closed ten phase-10 items and was explicit about why it could not
close the rest. For M4/M16 and R14 the stated blocker was mechanical, not
intellectual: both change `package.json`, and `tools/ci/lockfile-review.sh`
fails any commit that edits a manifest without a `package-lock.json` generated
by npm. That gate is correct and must not be weakened, so the previous pass
registered two `package-call-site` exceptions and moved on.

An exception with an ADR is honest bookkeeping. It is not a fix. Two scaffold
packages nobody imports, a second copy of the audit anchor with a weaker
algorithm, 6.0MB of unreferenced JPEGs and four runtime dependencies declared
in the wrong manifest are all still defects; the only thing the exception
bought was that the rule stayed enabled.

This batch does the deletion for real. The lockfile is regenerated in the same
change by whoever runs npm; nothing here is hand-edited.

## Decisions

### 1. A package with no call-site gets deleted, not exempted

`@scalpai/ui` (47 bytes of source) and `@scalpai/notify` (51 bytes) have had no
import and no dependent manifest since they were created. The only places that
named them were `PROJECT_GRAPH.md` and `tools/graph/project-graph.json`, both
generated. Deleted, and both `package-call-site` entries are removed from
`exceptions.json`, so the rule now passes on merit.

The conformance rule stays exactly as written. If a future scaffold appears,
it fails again.

### 2. One audit anchor, and it is the one with a real Merkle tree

`ops/audit-anchor.ts` was the pre-phase-6 draft. It did this:

```ts
const combinedHashes = rows.map((r) => r.rowHash).join(":");
const merkleAnchorHash = createHash("sha256").update(combinedHashes).digest("hex");
```

A hash of concatenated hashes is not a Merkle root: it supports no inclusion
proof, which is the entire reason to build a tree. Its
`verifyAuditChainIntegrity` compared `prevHash` links and never recomputed a
row hash, so an attacker able to rewrite a row and its own `rowHash` passed
verification. Those are precisely the two unbacked claims H17 was raised
against, and phase 6 fixed them properly in `packages/db/src/audit-anchor.ts`
(`buildMerkleTree`, `merkleInclusionProof`, `SignedAuditAnchor`), exported from
`@scalpai/db` and covered by `audit-anchor.spec.ts`.

The `ops/` copy was never in any build graph - it imported
`../packages/db/src/tenant.js` across the workspace boundary with a relative
path - so it could rot without turning anything red. Deleted. Keeping a weaker
implementation of a security primitive next to the real one is an invitation
to import the wrong one.

### 3. The repository root has no `src/`

The workspace layout is `apps/*`, `packages/*`, `tools/*`. A root
`src/assets/images` held eight generator-named JPEGs (6.0MB) with zero
references anywhere in the tree: no component, stylesheet, manifest, doc or
test. Deleted. If a real sample fixture is wanted for **M1**, it belongs under
`apps/web/public` or a test fixture directory and gets recovered from history
deliberately, not inherited by accident.

### 4. A workspace root has no runtime

The root manifest declared `three`, `lucide-react`, `react` and `react-dom` in
`dependencies`, plus `@types/three` in devDependencies and
`@vitest/coverage-v8` in `dependencies`.

Every call-site is in `apps/web`: `three` in `LuxuryScalp3D.tsx` and
`LuxurySilkCanvas.tsx`, `lucide-react` in nineteen components and pages,
`react`/`react-dom` already declared by the app at `^19.2.0` against the root's
`^19.2.8`. npm hoisting made that work, which is why it was never noticed, and
it meant `apps/web` built against versions it did not declare while the two
ranges drifted apart.

All four now live in `apps/web`, `@types/three` sits beside its subject, and
`@vitest/coverage-v8` moved to root devDependencies - a coverage provider in
`dependencies` is a production shipping decision nobody made.

`jsdom` is also removed from `apps/web`: the test runner is root-level
(`vitest.config.ts`, no test script in the app), and declaring `^27` in the app
against `^30` at the root put two majors of the same DOM implementation in one
tree. This is what Dependabot #48 has been arguing with.

The regression test asserts the direction of the rule, not just the current
state: if any workspace other than `apps/web` starts importing `three` or
`lucide-react`, the gate fails rather than letting hoisting resolve it
silently. A companion assertion requires every `@scalpai/*` import in
`apps/web/src` to be declared by that workspace, for the same reason.

### 5. PR #21 and #23 were verified, not assumed

Both were already closed unmerged on 2026-09-06. `#21` ("Update
auth.service.ts") was +13/-12 on a single file against a base three commits
behind `main`; `#23` ("Fix formatting issue in auth.service.ts") had no
effective diff. The phase file's instruction to rebase or close is satisfied by
the closure. Nothing is reopened.

This item gets no assertion in `product.phase10.spec.ts` on purpose: that suite
is deliberately static analysis with no network, and the state of a pull request
is not in the working tree. Asserting it there would be the same category of
self-certified gate that ADR-0037 exists to prevent.

### 6. Two pieces of drift fixed in passing

Neither closes **L1**; both were found while doing the above and left
uncorrected would contradict this ADR:

- The phase file's header announced phase 7 as the frontier while phases 8 and 9
  were ticked in the same document.
- `PROJECT_GRAPH.md` said it was generated by `pnpm graph` in a repository where
  ADR-0036 makes npm the only package manager. The `package-manager` conformance
  rule does not scan root `.md` files, which is how it survived phase 5.

**L1/W01/W22/W23 stays open.** `docs/playbooks/*` and the `docs/tasks|gates`
archive still carry pnpm snippets and PASS marks with no evidence log.

## Consequences

- `package-lock.json` MUST be regenerated with
  `npm install --package-lock-only --legacy-peer-deps` and committed in this
  change, or `tools/ci/lockfile-review.sh` fails the branch. That is the gate
  working, not a problem to route around.
- `packages/ui`, `packages/notify` and `ops/audit-anchor.ts` are gone from `HEAD`
  and recoverable from history. The 6.0MB of images are gone from `HEAD` but
  remain in history; this is not a size reduction of an existing clone.
- Two `package-call-site` exceptions are removed. Any future scaffold fails
  conformance immediately.
- Phase 10 remains OPEN. Six items are still `[ ]`: M1, M5b, M14, M15,
  L1/W01/W22/W23 and L2. `product.phase10.spec.ts` asserts that count, so
  ticking a box without adding evidence turns the suite red.
- **M19 is now unblocked** by the same lockfile regeneration, but it is not done
  here: turning on type-aware ESLint, `react-hooks`, `jsx-a11y`,
  `no-floating-promises` and the strict TypeScript flags surfaces existing
  violations across the whole tree. That needs its own branch where the errors
  are read and fixed, not a config landed blind.
- Regenerating the graph (`npm run graph`) should now be a no-op against the
  hand-corrected files; if it is not, the generator is the source of truth.
