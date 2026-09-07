# ScalpAI v2

Self-hosted clinical trichology platform: patient records, trichoscopy imaging,
on-device scalp analysis, digital consent and multi-device offline sync.

> **Scope.** The analysis engine is **assistive and non-diagnostic**. It produces
> heuristic scores next to an image and records an expert's review; it does not
> diagnose, and no output of this system may be presented as a diagnosis.

---

## What is in here

| Path                    | What it is                                                        |
| ----------------------- | ----------------------------------------------------------------- |
| `apps/api`              | NestJS + Fastify API. Owns tenancy, RLS context, audit, storage.   |
| `apps/web`              | React + Vite clinical app (Persian-first, RTL).                   |
| `apps/desktop`          | Desktop shell **contract only** - no Electron main process exists. |
| `apps/admin`, `apps/portal` | Scaffolds.                                                    |
| `packages/db`           | Drizzle schema, SQL migrations, repositories, PHI crypto, audit.   |
| `packages/shared`       | Wire contracts (zod), dates, PHI helpers, analysis provenance.    |
| `packages/analysis-engine` / `analysis-core` | The on-device heuristic engine.       |
| `packages/sync-client`  | Offline queue, Dexie storage, push/pull.                          |
| `packages/licensing`    | Ed25519 licence signing/verification primitives.                  |
| `tools/`                | Conformance harness, secret scan, bundle budget, CI gates.        |
| `ops/`                  | The one supported deployment: Docker Compose + Caddy (ADR-0036).  |
| `docs/`                 | ADRs, playbooks, and the phase plan in `WEAKNESSES-V2-10-PHASES.md`. |

**npm is the only package manager** (ADR-0036). `pnpm`/`yarn` in an executable
surface fails the conformance gate.

---

## Run it from scratch

### Prerequisites

- Node.js 22+ and npm 10.9+
- Docker + Docker Compose (PostgreSQL **17**, MinIO, Redis)
- `libvips` is built from source by `sharp` during install, so a C++ toolchain is
  needed on Linux (`build-essential`, `python3`, `libvips-dev`).

### 1. Install

```bash
npm ci
```

`npm ci` only - never `npm install` in CI or in a container. The lockfile is a
gate (`tools/ci/lockfile-review.sh`).

### 2. Configure

```bash
cp .env.example .env
```

Then fill it in. Nothing has a production fallback: a missing `JWT_SECRET`,
`APP_ROLE_PASSWORD` or storage credential is a **boot failure**, by design
(phase 1 / phase 4).

Two database URLs, on purpose:

- `MIGRATE_DATABASE_URL` - owner credentials, used ONLY by the migrator.
- `DATABASE_URL` - the `scalpai_app` role (`NOSUPERUSER`, `NOBYPASSRLS`). The
  runtime never gets owner rights.

### 3. Bring up the infrastructure and migrate

```bash
docker compose -f ops/dev.yml up -d      # postgres + minio + redis
npm run db:migrate
npm run db:seed                          # demo clinic + roles, dev only
```

The migrator creates the `scalpai_app` and `scalpai_auth` roles, applies
`packages/db/sql/*.sql` in order, and re-asserts the tenancy/privacy grants after
every file. Patient search needs the `pg_trgm` extension; migration `0015` creates
it and fails loudly if the migration role may not.

### 4. Run

```bash
npm run dev                              # web on :3000
npm run dev --workspace=@scalpai/app-api # api on :3001
```

Default dev credentials come from the seed and are gated to `NODE_ENV != production`.

---

## Checks

```bash
npm run typecheck        # turbo: every workspace
npm run build            # turbo: every workspace
npm run lint
npm test                 # vitest; integration suites need the dev database up
npm run test:coverage
npm run conformance      # architecture rules (tools/conformance)
npm run scan:secrets     # every tracked file
npm run budget:bundle    # initial payload budget from the real Vite manifest
npm run e2e              # playwright, full suite
npm run e2e:smoke        # the subset CI runs on every PR
```

A green gate has to carry its own evidence: `tools/ci/run-gate.sh` writes the
command, the full output and the exit code to `ci-evidence/<gate>.log`, and the
`gate` job refuses a PASS with no log (ADR-0037).

---

## Deploy

One supported topology (ADR-0036): API, web, PostgreSQL, MinIO, Redis and Caddy
on a single host via Docker Compose. Caddy terminates TLS with ACME on a real
domain; there is no `auto_https off` path.

```bash
npm run ops:validate     # compose config -q, refuses missing secrets
npm run ops:up           # build + up + --wait
npm run ops:backup       # postgres + MinIO, age-encrypted, off-site WORM
npm run ops:restore-drill
```

Full procedure and the incident/rotation/restore runbook: `docs/ops/`.

---

## Security and privacy posture

- **Tenancy** - PostgreSQL RLS plus an explicit `clinic_id` predicate in every
  repository. Cross-tenant reads are covered by tests per table.
- **PHI at rest** - clinical notes are AES-256-GCM with a key ring and AAD
  binding; plaintext never reaches the mutation ledger or the offline database.
- **Audit** - append-only, hash-chained per clinic, with a Merkle anchor and
  inclusion proofs. The app role has `UPDATE`/`DELETE` revoked in SQL.
- **Logs** - structured, request-id correlated and PHI-scrubbed.
- **Analysis** - runs on the device. Every submission carries the sha256 of the
  pixels it analysed and a reference to a registered model manifest, which the
  API verifies before storing (ADR-0043).

To report a vulnerability, read [SECURITY.md](SECURITY.md). Do not open an issue.

---

## Contributing

Conventional commits (commitlint + husky). Every PR fills in
`.github/pull_request_template.md`, and anything that closes a line in
`docs/WEAKNESSES-V2-10-PHASES.md` needs the four pieces of evidence that file
asks for: the fix, a regression test, gate output, and a short completion report.

## Licence

[MIT](LICENSE).
