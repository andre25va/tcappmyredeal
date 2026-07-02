-- ─────────────────────────────────────────────────────────────────────────────
-- Form Brain Phase 4 — Link field_coordinates → form_template_fields
--
-- Adds form_field_id FK to field_coordinates.
-- Every coordinate row is now linked to its semantic field definition.
-- The null-label bug becomes structurally impossible:
--   labels, types, party, and hints all live in form_template_fields.
--   field_coordinates becomes pure pixel data + FK.
--
-- Existing label / section / group_key columns are kept as denormalized cache
-- (non-breaking). They will be deprecated in a future cleanup pass.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the FK column (nullable — some coords may not have a semantic match yet)
ALTER TABLE field_coordinates
  ADD COLUMN IF NOT EXISTS form_field_id uuid
    REFERENCES form_template_fields(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS field_coordinates_form_field_id_idx
  ON field_coordinates (form_field_id);

-- 2. Backfill: match on form_slug + field_key
--    form_template_fields has a UNIQUE(form_slug, field_key) constraint so the
--    sub-select will always return 0 or 1 row.
UPDATE field_coordinates fc
SET form_field_id = ftf.id
FROM form_template_fields ftf
WHERE ftf.form_slug = fc.form_slug
  AND ftf.field_key = fc.field_key
  AND fc.form_field_id IS NULL;

-- 3. Report how many rows were linked (shows up in migration output)
DO $$
DECLARE
  linked   int;
  unlinked int;
BEGIN
  SELECT COUNT(*) INTO linked   FROM field_coordinates WHERE form_field_id IS NOT NULL;
  SELECT COUNT(*) INTO unlinked FROM field_coordinates WHERE form_field_id IS NULL;
  RAISE NOTICE 'field_coordinates linked: %, still unlinked: %', linked, unlinked;
END;
$$;
