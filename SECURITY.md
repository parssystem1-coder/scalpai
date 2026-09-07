# Security policy

ScalpAI stores protected health information: patient identity, clinical notes,
trichoscopy imagery and signed consent forms. Treat every finding as sensitive.

## Reporting a vulnerability

**Do not open a public issue or pull request for a security problem.**

Use GitHub's private vulnerability reporting on this repository
(Security -> Report a vulnerability). If that is unavailable, contact the
repository owner directly and ask for a private channel before sending details.

Please include:

- what you can reach and what you can read or change;
- the smallest reproduction you have (a request, a token, a query);
- the commit or deployed version you tested;
- whether any real patient data was involved.

If you reached real patient data, say so in the first message. That changes the
response from a fix to a breach procedure.

### What to expect

| Stage                          | Target      |
| ------------------------------ | ----------- |
| Acknowledgement                | 3 days      |
| Initial assessment + severity  | 7 days      |
| Fix or documented mitigation for critical/high | 30 days |

We will tell you when a fix ships and credit you unless you prefer otherwise.

## In scope

- Tenant isolation: reading or writing another clinic's rows or objects.
- Authentication and session handling: token forgery, refresh replay, privilege
  escalation between `owner` / `trichologist` / `receptionist`.
- PHI exposure: plaintext clinical notes, unauthenticated object access,
  PHI in logs, audit-chain tampering.
- Storage: reaching an object outside your clinic's key prefix, path traversal.
- Quota, rate limit and licence bypass.
- Anything that makes the audit log rewritable.

## Out of scope

- Findings that require the deployer to ignore the documented configuration -
  for example running with `STORAGE_DRIVER=mock` in production (the code refuses
  it) or supplying a weak `JWT_SECRET` (boot fails).
- Missing hardening on a `docs/`-only surface, or on the dev seed credentials,
  which are gated to non-production builds.
- Volumetric denial of service against your own instance.
- Reports produced only by a scanner, with no reachable impact shown.

## Deployer responsibilities

This is self-hosted software. The following are yours, and no upstream fix
substitutes for them:

- rotate `JWT_SECRET`, the app role password, storage credentials and the licence
  key ring per the runbook in `docs/ops/`;
- keep backups encrypted, off-site and restore-tested - `npm run ops:restore-drill`
  exists so that this is provable rather than assumed;
- run the API behind TLS with the shipped Caddy configuration;
- apply your jurisdiction's rules for clinical data and for software that is
  explicitly **not** a medical device.

## Known-disclosed material

A Firebase web configuration (API key, OAuth client id) from an unrelated scaffold
was committed to this repository before phase 10 and removed in
`fix(phase10)!: delete the committed Firebase web config`. Removal from `HEAD` is
not removal from history: that key and client must be considered disclosed, and
must be rotated and revoked at the provider.
