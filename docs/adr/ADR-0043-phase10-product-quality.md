# ADR-0043 - Phase 10: claims must match code

- **Status:** accepted
- **Date:** 2026-09-07
- **Supersedes / relates to:** ADR-0036 (single deployment topology), ADR-0037
  (evidence-carrying gates), ADR-0041, ADR-0042
- **Weaknesses addressed:** H10, H13, M2, M3, M7/R13, M10, M11, M13, M18, M20
- **Weaknesses explicitly NOT addressed:** M1, M4/M16, M5, M14, M15, M19, L1, L2, R14

## Context

Phases 1-9 hardened the parts of the system that could be reasoned about in
isolation: tenancy, sessions, deployment, gates, PHI, sync, media, operations.
What was left was a different failure mode. The code did not lie to itself; it
lied to the reader. A search box that filtered nothing. A licence panel that
printed "Ed25519 Verified" from a literal. A desktop module that reported two
detected trichoscopes it had never spoken to. A Firebase key from an unrelated
scaffold sitting at the repository root. Every one of these looked finished.

A claim nobody can check is worse than a missing feature, because it removes the
reason to build the real thing.

## Decisions

### 1. A wire name belongs to the contract, not to the caller

`GET /patients?q=` passed the parsed query straight to `listPatients`, which read
`q.search`. The schema only ever produced `q.q`. The ILIKE branch was therefore
unreachable and patient search silently returned the unfiltered first page for
every clinic, for every release since it was written. Neither side was wrong on
its own, which is why no reviewer caught it.

`PaginationQuery` now owns the name: it accepts either spelling, trims once, maps
an empty term to `undefined` so a blank box cannot become `ILIKE '%%'`, and
publishes the SAME value under both keys. A call site can no longer pick the wrong
one.

And because the predicate has a leading wildcard, a btree index cannot serve it -
the "trigram index" the docs claimed did not exist. Migration `0015` creates
`pg_trgm` and three partial GIN indexes (`deleted_at IS NULL`), and **fails the
migration** if the extension cannot be created. A silent fall back to a sequential
scan is how the original claim survived.

### 2. An off-device computation must carry its own provenance

The golden rule (§3) is that image analysis never leaves the device. The price is
that the server sees only three numbers and a version string, and it cannot
recompute them. Before this phase a client could post any scores under any
`modelVersion` and the row was stored as "an analysis" that the product then
showed beside clinical data.

A submission now carries `provenance`: the sha256 of the exact RGBA buffer that
was analysed, that buffer's geometry, a reference to a **registered** model
manifest, and an explicit `diagnostic: false`. The API verifies the manifest
reference against its own registry, so an unknown model, an edited revision or a
`modelVersion` that disagrees with the manifest is a 400 rather than a stored
fact. The non-diagnostic label is a shared constant rendered next to the result
itself, so a score cannot appear without its scope.

This is deliberately **not** a signature over the pixels. The client is untrusted
by construction; claiming otherwise would repeat the mistake this ADR exists to
fix. What it buys is that every stored analysis is re-checkable against the
original image and pinned to an algorithm revision.

The digest is computed by a dependency-free SHA-256 in `@scalpai/shared`, pinned
against `node:crypto` across every padding boundary, because `crypto.subtle` is
async-only and absent on insecure origins while `node:crypto` cannot be bundled
for a browser.

### 3. A verdict comes from the server or it is not a verdict

Licence state was derived in the browser from a hard-coded claims object. An
unlicensed installation displayed a green tick, a `professional` tier and 120 days
remaining, and the "simulate clock tampering" button flipped a local boolean -
proving nothing about the guard it claimed to demonstrate.

`GET /license/status` now verifies a compact EdDSA JWS against a configured
Ed25519 public key and returns the verdict, the public claims and the fingerprint
of the key it used. `unlicensed` and `invalid_signature` are first-class states.
The panel renders that response and nothing else.

The verification lives in `apps/api/src/licensing` on `node:crypto` rather than
importing `@scalpai/licensing` into the API's dependency graph, because adding a
workspace dependency requires regenerating `package-lock.json`, which the lockfile
gate (correctly) refuses to accept as a hand edit. The parity that matters is
tested: the suite signs with `@scalpai/licensing#signLicense` and verifies through
the API service. Collapsing the two implementations is follow-up work for the pass
that can run `npm`.

Clock rollback is detected against a per-process high-water mark, and the code says
so. A durable anti-tamper anchor belongs with the audit anchors; promising one here
would be another unbacked claim.

### 4. Self-hosted means self-hosted

`apps/web/index.html` opened with preconnects to `fonts.googleapis.com` and
`fonts.gstatic.com` and pulled five families. For a self-hosted clinical product
that is a third-party request on the first paint of a page that renders PHI, an
install that degrades on an air-gapped network, and ~400KB of display faces for
two that are used.

The CDN is gone. Two families remain, declared with `@font-face` that resolves
`local()` -> the vendored file under `/fonts` -> the platform stack, so an empty
`public/fonts` directory is a supported state: correct rendering, no brand face, no
outbound request. The binaries are vendored per
`apps/web/public/fonts/README.md` rather than committed, and the tailwind stack was
corrected to stop naming families nothing loads any more.

### 5. Say what the code does, and only that

- `apps/desktop` exports the IPC **contract** a shell would implement and answers
  `available: false` until a bridge exists. The fabricated device list is deleted.
- The root `firebase-applet-config.json` (live-format Google API key, OAuth client
  id) and `metadata.json` (`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`) are deleted.
  **The key and OAuth client must be rotated and revoked** - removal from `HEAD` is
  not removal from history.
- README, LICENSE, SECURITY.md, CODEOWNERS and a PR template exist, so "clone it
  and run it" and "how do I report a vulnerability in a system holding PHI" have
  written answers.

### 6. Two defects that were simply bugs

- **M10** Assigning `canvas.width` clears the bitmap, and the signature pad did it
  on every resize event. A tablet rotation or an on-screen keyboard erased a
  signature the patient had already given, and the consent modal submitted the
  blank canvas. The pad now snapshots, resizes, and redraws scaled - and treats a
  resize that does not change the backing store as a no-op. The decision is a pure
  function so it is testable without a canvas implementation.
- **M11** The SPA fallback ran two `existsSync` calls and a synchronous
  `readFileSync` of `index.html` on the event loop for every 404, forever - and
  answered HTML for missing `/api` routes and missing asset chunks, turning a
  broken deploy into a white screen with a 200. It is now read once, cached
  (including the negative answer), primed off the request path, and restricted to
  requests that are plausibly client-side routes.
- **M13** `formatRelativeTime` clamped the elapsed time to zero, so every
  future-dated value - a booking, a licence expiry, a quota period end - rendered
  as "چند لحظه پیش". Both formatters also accept an IANA `timeZone`, so the
  clinic's day boundary decides the date instead of the viewer's browser;
  `clinics.timezone` has been the server's source of truth since phase 8.

## What this phase did NOT close

Stated plainly, because the phase file's own rule is that only real closures are
ticked:

- **M1** `ClinicalDashboard.tsx` (110KB) and `NeuralSegmentationOverlay.tsx` still
  define `SAMPLE_*` payloads inline. Separating them is bound up with **L2** (the
  decomposition of that component) and is not a change worth making blind.
- **M4/M16, R14** deleting the `packages/ui` / `packages/notify` scaffolds and
  moving root dependencies into their workspaces both change `package.json`, which
  requires a regenerated `package-lock.json`. A hand-edited lockfile is exactly
  what `tools/ci/lockfile-review.sh` exists to reject.
- **M19** type-aware ESLint is reachable, but `eslint-plugin-react-hooks` and
  `eslint-plugin-jsx-a11y` are new devDependencies - same lockfile constraint.
- **M5, M14, M15, L1** untouched in this pass.

The corresponding lines in `docs/WEAKNESSES-V2-10-PHASES.md` stay `[ ]`, and the
phase-level box stays open. Two conformance exceptions remain registered against
this ADR for the same reason, so the rules stay ENABLED rather than weakened.

## Consequences

- Patient search works and is indexed; `pg_trgm` becomes a deployment prerequisite.
- Every new analysis is refused unless it can say what produced it. Rows written
  before this change have no provenance and must not be read as if they did.
- A self-hosted install makes no third-party request to render.
- The disclosed Firebase credentials must be rotated at the provider; this repo
  cannot do that for you.
- Phase 10 remains open. `tools/quality/product.phase10.spec.ts` keeps the closed
  half closed.
