# ADR-0041 — Resumable uploads, atomic metering and measured storage

- **Status:** accepted
- **Date:** 2026-09-07
- **Phase:** 8 (مدیا، آپلود و سهمیه)
- **Addresses:** WEAKNESSES H7, H11, H12, C1, M22, L4

## Context

Phase 8's items were all variations of the same failure: something was *called*
safe without anything mechanically making it so.

- **Resume was not resume.** The client kept `uploadId`, part count and ETags in
  `localStorage`, and "resuming" asked the API to initiate a *new* multipart
  upload for the same file. Every byte was re-sent and the previous upload was
  abandoned inside the bucket, paying rent forever.
- **Presigned URLs were minted all at once** with a 15 minute TTL, so the tail of
  a 50MB upload on a slow uplink met expired URLs and had no way to ask again.
- **`totalParts` was arithmetic on a client-supplied size** and the completion
  body had no schema at all (`@Body() body: { uploadId, parts }`).
- **The 50MB ceiling was a zod field**, while the server happily buffered whatever
  the bucket actually held before anything checked a size.
- **Quota was read-then-write** on a counter whose period was computed in fixed
  UTC, so two concurrent requests could both spend the last slot and a clinic's
  month rolled over on the wrong day.
- **`storage_mb` was compared against nothing**: no code ever measured the bucket,
  and `gallery_items` did not even store the size it accepted on the wire.
- **Nothing bounded concurrent decoding.** Twenty accepted uploads inside one rate
  window were twenty concurrent sharp pipelines.

## Decision

1. **The server owns the upload.** `upload_sessions` holds `uploadId`, part size,
   part count and an expiry, with RLS and a CHECK that `total_parts` equals
   `ceil(size / part_size)`. The browser keeps a pointer in the scoped Dexie
   database; the parts that exist are answered by `ListParts` against the bucket.
2. **Part URLs are minted in windows of 16** and can be re-requested at any point,
   including after a signature expires mid-flight.
3. **Completion is verified against the bucket** — part count, presence and byte
   size — and the ETag sent to `CompleteMultipartUpload` comes from the bucket.
   A client-supplied ETag is compared, not trusted, and is optional because a
   cross-origin PUT cannot always read the header.
4. **Reads are bounded.** `HeadObject` first, magic bytes from a 32-byte range
   read, decode from a stream behind a byte cap.
5. **Metering is atomic and clinic-local.** `fn_usage_consume` locks the counter
   row and answers allowed/refused in one statement; the period comes from
   `fn_clinic_period_start(clinics.timezone)`. Refusals refund.
6. **Storage is a stock, not a flow.** `fn_storage_reserve` locks the clinic's
   `storage_usage` row and compares measured bytes + open reservations + this
   request against the plan ceiling. `reconcileStorage` re-bases the total from a
   real bucket scan, and a bucket lifecycle rule aborts incomplete multipart
   uploads.
7. **Expensive work is admitted, not queued forever.** A process-wide semaphore
   fronts every decode; past its queue the answer is 429.
8. **An override replaces the ceiling it addresses.** A metric may be written with
   more than one plan key (`storage_bytes` or `storage_mb`, `uploads_per_month` or
   `uploads`) and the resolver takes the first usable key in priority order, so a
   plain `{ ...plan, ...overrides }` merge let a clinic override lose to the plan's
   sibling key while looking applied. `mergePlanLimits` retires every sibling key
   of a metric the override touches, and it is the only place the two are combined.
9. **A metered endpoint validates before it meters.** Nest runs guards before
   pipes, so `@Quota` cannot see a parsed body: on `POST
   patients/:pid/gallery/uploads` it answered 403 QUOTA_EXCEEDED to a `sizeBytes`
   over the 50MB contract, telling the client to buy a bigger plan for a file no
   plan accepts. The slot and the bytes are taken atomically inside the handler's
   transaction anyway (decision 5/6), so the decorator came off that route rather
   than the contract moving into a guard that runs too early to be right.

## Consequences

- `getUsage`/`incrementUsage` are **deleted**, not deprecated: metering has one
  door (`repos/quota.repo.ts`). A `@Quota` decorator with an unknown metric now
  throws at request time instead of silently disabling the limit.
- `init-multipart` / `complete-multipart` are **removed** rather than kept as
  shims — keeping them would have left a second, unbounded way in.
- The mock storage driver grows real per-part objects with content-addressed
  ETags, so CI exercises resume instead of an append-only fiction.
- A clinic's plan `storage_mb` becomes enforceable, which means an existing tenant
  over its (previously unmeasured) ceiling will start being refused. That is the
  intended behaviour, and `GET /privacy/storage/usage` exists so it can be seen
  before it bites.
- The resolved entitlement is cached per clinic with a TTL (ADR-0034), so a plan
  or override written **outside** `EntitlementService` — a migration-role UPDATE, a
  test fixture, a support script — is invisible until the TTL expires. Such a
  write must call `invalidate(clinicId)`, otherwise an enforced ceiling and a
  stale one are indistinguishable from the outside.
- Quota is per clinic and cumulative, which makes an integration suite that shares
  one clinic order-dependent unless it clears `usage_counters`, `upload_sessions`
  and `storage_usage` between cases. `media.phase8.spec.ts` does that per test.
