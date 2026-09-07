# Phase 10 completion report

Date: 2026-09-07
Branch: `feat/phase10-product-quality-docs-debt`
Base: `main`

## Closed in this branch

- **H10**: patient search accepts `q` and `search` consistently, trims blank input, and has partial `pg_trgm` GIN indexes in migration `0015`.
- **H13**: on-device analysis submits image SHA-256, pixel geometry, registered model manifest data, and an explicit non-diagnostic flag. The API rejects unknown models, manifest drift, model-version mismatches, malformed digests, and diagnostic claims.
- **M2**: licence status is verified server-side with Ed25519. The UI no longer invents a green state; `unlicensed` is explicit.
- **M3**: the desktop module no longer fabricates UVC devices or claims hardware support. It exposes a bridge contract and reports unavailable until a real bridge exists.
- **M7/R13**: deleted unrelated Firebase/applet scaffold files, widened secret scanning to the missed config surfaces, and documented rotation/revocation requirements.
- **M10**: signature canvas preserves its bitmap across real resizes and has a pure regression-tested resize plan.
- **M11**: SPA shell loading is async, cached, negatively cached, and excluded for API and asset 404s.
- **M13**: future relative timestamps use future tense and date formatting accepts an IANA clinic timezone.
- **M18**: removed third-party font CDN usage and reduced the declared family set to two self-hosted families with fallbacks.
- **M20**: added README, MIT LICENSE, SECURITY.md, CODEOWNERS, PR template, and reproducible run instructions.

## Evidence added

- Shared SHA-256 and provenance unit suites.
- Pagination, date/timezone, signature resize, licence verification, SPA fallback, and phase-10 static regression suites.
- ADR-0043 documents the decisions and the explicit non-closures.

## Still open

The phase-level checkbox remains open because these are not honestly complete: **M1**, **M4/M16**, **M5**, **M14**, **M15**, **M19**, **L1**, **L2**, and **R14**. The largest blocker is the 110KB dashboard's inline sample data and component decomposition; package/lockfile cleanup also needs a real npm-generated lockfile rather than a hand edit.

The open items remain `[ ]` in `docs/WEAKNESSES-V2-10-PHASES.md` by design. Ticking the phase while those claims remain would make the next automated run skip real work.
