-- ============================================================================
-- Phase 10 - H10: make patient search real, and make it indexed.
--
-- Two separate bugs hid behind one feature:
--   1. the HTTP layer sent `q` and the repository read `search`, so the ILIKE
--      branch was never taken (fixed in packages/shared/src/contracts.ts);
--   2. even once taken, `col ILIKE '%term%'` has a leading wildcard, so a btree
--      index cannot serve it - every keystroke was a sequential scan over the
--      clinic's patients.
--
-- pg_trgm + GIN is the canonical answer to a leading-wildcard ILIKE. The indexes
-- are PARTIAL on `deleted_at IS NULL` because that is the only set the search
-- predicate ever looks at, which keeps them small and keeps soft-deleted rows
-- out of the index entirely.
--
-- The extension is REQUIRED, not best-effort: silently falling back to a
-- sequential scan is how the previous "trigram index" claim came to exist in the
-- docs without an index behind it.
-- ============================================================================

DO $trgm$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION
      'pg_trgm could not be created by the migration role. Install it once as a superuser (CREATE EXTENSION pg_trgm;) and re-run the migration - patient search is not allowed to degrade to a sequential scan (phase 10 / H10).';
  END;
END
$trgm$;

-- One GIN index per searched column: the repository predicate is an OR over
-- these three, which the planner can serve as a bitmap OR and then intersect
-- with the clinic_id restriction.
CREATE INDEX IF NOT EXISTS patients_first_name_trgm_idx
  ON patients USING gin (first_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS patients_last_name_trgm_idx
  ON patients USING gin (last_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS patients_phone_trgm_idx
  ON patients USING gin (phone gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- The search always runs inside one clinic; this is the access path the planner
-- intersects the trigram bitmaps with.
CREATE INDEX IF NOT EXISTS patients_clinic_live_idx
  ON patients (clinic_id)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX patients_first_name_trgm_idx IS 'phase 10 H10: trigram support for ILIKE %term% patient search';
COMMENT ON INDEX patients_last_name_trgm_idx IS 'phase 10 H10: trigram support for ILIKE %term% patient search';
COMMENT ON INDEX patients_phone_trgm_idx IS 'phase 10 H10: trigram support for ILIKE %term% patient search';
