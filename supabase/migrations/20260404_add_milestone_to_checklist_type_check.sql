-- Fix: add 'milestone' to checklist_templates.checklist_type CHECK constraint
-- The MLS Templates tab inserts checklist_type = 'milestone' but the old constraint
-- only allowed 'dd' | 'compliance' | 'general', causing silent insert failures.
ALTER TABLE checklist_templates
  DROP CONSTRAINT checklist_templates_checklist_type_check,
  ADD CONSTRAINT checklist_templates_checklist_type_check
    CHECK (checklist_type = ANY (ARRAY['dd','compliance','general','milestone']));
