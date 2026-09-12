# Deployment

M14a fixture (ADR-0037). This document deliberately carries no
`# OPERATIONS: <purpose>` header line, which is exactly what
`ops-file-conventions` reports.

Do not fix it: `tools/quality/product.phase10.spec.ts` asserts the rule still
catches this file, and the harness reports itself if it stops.
