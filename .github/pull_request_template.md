## What and why

<!-- One paragraph. What was broken or missing, and what this changes. Link the
     WEAKNESSES id (e.g. H10, M13) or the ADR if there is one. -->

## Evidence

<!-- docs/WEAKNESSES-V2-10-PHASES.md accepts exactly four things as proof that a
     line is closed. A PR that ticks a box without them will be sent back. -->

- [ ] **Fix** - the code change, not a doc edit
- [ ] **Regression test** - fails before this change, passes after. Name it:
- [ ] **Gate output** - the relevant `ci-evidence/*.log` / job is green
- [ ] **Completion report** - what is closed, and what is deliberately left open

## Checks run locally

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run conformance`
- [ ] `npm run scan:secrets`
- [ ] `npm run e2e:smoke` (if a user-facing path changed)

## Risk

- [ ] Migration included (forward-only, idempotent, re-runnable)
- [ ] New env var - documented in `.env.example` AND fails closed when absent
- [ ] Touches tenancy, auth, PHI or the audit chain
- [ ] Touches `ops/` or a Dockerfile
- [ ] `package.json` changed -> `package-lock.json` regenerated with `npm`

## Claims check

- [ ] Nothing in this PR states a capability the code does not have
- [ ] No demo/sample payload reaches a production render path without a gate
- [ ] No credential, key or token is committed
- [ ] Any tick added to `docs/WEAKNESSES-V2-10-PHASES.md` is backed by the
      evidence above; anything still open stayed `[ ]`
