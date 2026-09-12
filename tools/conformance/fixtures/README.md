# Conformance fixtures (ADR-21 / ADR-0037)

Each directory here is a **miniature repository root** that seeds exactly the
violations one rule must catch:

| directory | rule | seeded violations |
|---|---|---|
| `ops-file-conventions/` | `ops-file-conventions` | ops document with no `OPERATIONS` header, shell script with no strict mode, compose file with no `services:`, credential literal in an ops file |
| `config-schema-validation/` | `config-schema-validation` | workspace manifest with no `scripts`, tsconfig that loosens `strict`, missing `.env.example`, Vite config with no `build.manifest`, non-npm `packageManager` |

Two things use them:

1. **The harness itself.** Every `npm run conformance` re-runs each rule against
   its own fixture and reports the RULE when the seeded violation stops firing.
   A rule that was quietly gutted turns CI red instead of going green.
2. **`tools/quality/product.phase10.spec.ts`**, which asserts the fixtures exist
   and that every seeded file is still named in the output.

**Do not "fix" the files in here.** They are broken on purpose. `walk.ts` ignores
every directory named `fixtures`, so nothing in this tree is ever reported
against the real repository - and nothing in here is ever built, typechecked as
part of a workspace, or shipped.
