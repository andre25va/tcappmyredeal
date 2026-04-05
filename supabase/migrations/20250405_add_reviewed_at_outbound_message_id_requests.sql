-- Add missing columns to requests table
-- reviewed_at: set when a request is accepted or rejected
-- outbound_message_id: tracks email log ID when a request email is sent
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS outbound_message_id text;
