-- Migration: checklist_template_items_add_required_by
-- Adds required_by column to tag who mandates each checklist item
-- Values: state | mls | brokerage | team | optional
ALTER TABLE checklist_template_items
  ADD COLUMN IF NOT EXISTS required_by text
  CHECK (required_by IN ('state', 'mls', 'brokerage', 'team', 'optional'));
