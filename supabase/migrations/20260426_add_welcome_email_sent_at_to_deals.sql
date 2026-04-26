-- N4: Welcome Email tracking column
-- Stamped after welcome email + contract thread are sent.
-- Used for idempotency — safety-net cron skips deals where this is not null.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;
