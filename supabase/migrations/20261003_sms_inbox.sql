-- Two-way SMS inbox (transaction updates only).
-- Accessed by Vercel API routes with the Supabase service role, which bypasses RLS.
-- Apply this migration in the Supabase SQL editor or via the Supabase CLI before using the inbox.

CREATE TABLE IF NOT EXISTS public.sms_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL UNIQUE,
  display_name text,
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_message_preview text,
  last_direction text CHECK (last_direction IN ('inbound', 'outbound')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.sms_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL DEFAULT '',
  status text NOT NULL,
  twilio_sid text UNIQUE,
  from_number text,
  to_number text,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  status_updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.sms_opt_ins (
  phone_e164 text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('opted_in', 'opted_out')),
  keyword text,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_fub_cache (
  phone_e164 text PRIMARY KEY,
  person_id text,
  name text,
  stage text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  not_found boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS sms_conversations_last_message_idx
  ON public.sms_conversations (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS sms_messages_conversation_created_idx
  ON public.sms_messages (conversation_id, created_at);

COMMENT ON TABLE public.sms_conversations IS 'One SMS thread per external phone number.';
COMMENT ON TABLE public.sms_messages IS 'Inbound and outbound SMS, including Twilio SID and delivery status.';
COMMENT ON TABLE public.sms_opt_ins IS 'Per-number SMS consent. Missing row means the number has never opted in by keyword.';
COMMENT ON TABLE public.sms_fub_cache IS 'Cached Follow Up Boss person lookup keyed by phone.';

ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_opt_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_fub_cache ENABLE ROW LEVEL SECURITY;

-- No policies: anon and authenticated clients cannot read SMS data.
-- The service role used by /api/sms-inbox bypasses RLS.
REVOKE ALL ON TABLE public.sms_conversations FROM anon, authenticated;
REVOKE ALL ON TABLE public.sms_messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.sms_opt_ins FROM anon, authenticated;
REVOKE ALL ON TABLE public.sms_fub_cache FROM anon, authenticated;

GRANT ALL ON TABLE public.sms_conversations TO service_role;
GRANT ALL ON TABLE public.sms_messages TO service_role;
GRANT ALL ON TABLE public.sms_opt_ins TO service_role;
GRANT ALL ON TABLE public.sms_fub_cache TO service_role;
