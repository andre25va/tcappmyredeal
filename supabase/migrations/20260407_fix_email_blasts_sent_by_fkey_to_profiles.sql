-- Fix: email_blasts.sent_by FK was pointing to auth.users(id)
-- App uses phone-based custom auth with profiles table; auth.users is always empty.
-- This caused every broadcast send to fail with a FK violation.

ALTER TABLE email_blasts DROP CONSTRAINT IF EXISTS email_blasts_sent_by_fkey;

ALTER TABLE email_blasts
  ADD CONSTRAINT email_blasts_sent_by_fkey
  FOREIGN KEY (sent_by) REFERENCES profiles(id) ON DELETE SET NULL;
