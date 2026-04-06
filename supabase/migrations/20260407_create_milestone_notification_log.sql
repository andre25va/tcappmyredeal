-- Migration: create milestone_notification_log
-- Tracks sent milestone notifications to prevent duplicates

CREATE TABLE IF NOT EXISTS milestone_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  milestone_type_id uuid NOT NULL REFERENCES milestone_types(id),
  recipient_type text NOT NULL CHECK (recipient_type IN ('agent', 'client')),
  recipient_email text NOT NULL,
  scheduled_date date NOT NULL,
  days_before integer NOT NULL,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Dedup: one notification per deal+milestone+recipient_type+days_before window
CREATE UNIQUE INDEX IF NOT EXISTS milestone_notification_log_dedup
  ON milestone_notification_log(deal_id, milestone_type_id, recipient_type, days_before);

ALTER TABLE milestone_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON milestone_notification_log
  USING (true) WITH CHECK (true);
