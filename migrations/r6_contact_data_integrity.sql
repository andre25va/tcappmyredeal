-- R6: Contact data integrity
-- Applied: prod (alxrmusieuzgssynktxg) + staging (lestdpwifhlvkbsgaxgj)

-- 1. Enforce unique active email per org at DB level
--    Partial: deleted contacts don't block re-creation of same email
CREATE UNIQUE INDEX IF NOT EXISTS contacts_active_email_org_unique
ON contacts (email, org_id)
WHERE deleted_at IS NULL AND email IS NOT NULL AND org_id IS NOT NULL;

-- 2. Enforce unique active email for contacts without an org (global contacts)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_active_email_no_org_unique
ON contacts (email)
WHERE deleted_at IS NULL AND email IS NOT NULL AND org_id IS NULL;

-- 3. Add soft-delete to deal_participants
--    Lets TC remove a contact from a deal without hard-deleting the participant row
--    Contact stays in system - just removed from this specific deal
ALTER TABLE deal_participants
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 4. Index for fast active participant lookups
CREATE INDEX IF NOT EXISTS deal_participants_active_idx
ON deal_participants (deal_id, contact_id)
WHERE deleted_at IS NULL;
