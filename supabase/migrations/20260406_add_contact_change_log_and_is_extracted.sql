-- Migration: add contact_change_log table + is_extracted to deal_participants
-- Applied: prod (alxrmusieuzgssynktxg) + staging (lestdpwifhlvkbsgaxgj)

-- Add is_extracted to deal_participants
ALTER TABLE deal_participants
  ADD COLUMN IF NOT EXISTS is_extracted boolean NOT NULL DEFAULT false;

-- Create contact_change_log table
CREATE TABLE IF NOT EXISTS contact_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  deal_participant_id uuid REFERENCES deal_participants(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  change_source text NOT NULL DEFAULT 'manual' CHECK (change_source IN ('manual', 'extracted', 'import')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE contact_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contact change log for their deals"
  ON contact_change_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deal_access da
      WHERE da.deal_id = contact_change_log.deal_id
        AND da.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert contact change log for their deals"
  ON contact_change_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deal_access da
      WHERE da.deal_id = contact_change_log.deal_id
        AND da.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contact_change_log_deal_id ON contact_change_log(deal_id);
CREATE INDEX IF NOT EXISTS idx_contact_change_log_contact_id ON contact_change_log(contact_id);
