-- Split notify_client into notify_buyer + notify_seller on mls_milestone_config
ALTER TABLE mls_milestone_config
  ADD COLUMN IF NOT EXISTS notify_buyer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_seller boolean NOT NULL DEFAULT false;

UPDATE mls_milestone_config SET notify_buyer = notify_client WHERE notify_client = true;

ALTER TABLE mls_milestone_config DROP COLUMN IF EXISTS notify_client;

-- Expand pending_notifications recipient_type constraint
ALTER TABLE pending_notifications DROP CONSTRAINT IF EXISTS pending_notifications_recipient_type_check;
ALTER TABLE pending_notifications ADD CONSTRAINT pending_notifications_recipient_type_check
  CHECK (recipient_type IN ('agent', 'buyer', 'seller'));
