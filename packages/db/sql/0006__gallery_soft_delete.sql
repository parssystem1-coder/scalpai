-- 0006__gallery_soft_delete.sql
-- Slice M4: engineering-rules §4 — business tables carry soft-delete.
-- gallery_items was missed in 0001 (analyses are append-only by policy, §8).

ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
