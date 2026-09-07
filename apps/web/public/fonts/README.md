# Self-hosted fonts (WEAKNESSES M18)

This directory is where the two brand faces live. It is intentionally empty in
git: font binaries are redistributable, but they are not source, and a clinical
repository should not carry a megabyte of blobs that nothing verifies.

## Why not a CDN

`apps/web/index.html` used to preconnect to `fonts.googleapis.com` /
`fonts.gstatic.com` and load five families. For this product that is a defect,
not a convenience:

- the first paint of a page that renders PHI made a request to a third party;
- a self-hosted or air-gapped install rendered with fallback fonts and a long
  layout shift, or hung on the stylesheet;
- five display families is ~400KB of payload for two that are actually used.

The `@font-face` rules in `index.html` therefore resolve in this order:

1. `local(...)` - a copy already installed on the machine;
2. the vendored file in this directory;
3. the platform stack (`system-ui` / Georgia).

So an empty directory is a supported state: the app renders correctly, just
without the brand face. Nothing breaks and nothing calls out to the internet.

## Vendoring the files

Drop exactly these two variable-weight files here:

| File                             | Family           | Licence  |
| -------------------------------- | ---------------- | -------- |
| `Vazirmatn-Variable.woff2`       | Vazirmatn        | OFL 1.1  |
| `PlayfairDisplay-Variable.woff2` | Playfair Display | OFL 1.1  |

Both are SIL Open Font License 1.1, which permits redistribution inside a
self-hosted deployment. Record the exact upstream release and the sha256 of each
file in the deployment runbook so an image rebuild is reproducible.

Any addition here must keep the family count at two. `tools/conformance` fails
the build on a third-party font host appearing in `apps/web`, so the CDN cannot
come back by accident.
