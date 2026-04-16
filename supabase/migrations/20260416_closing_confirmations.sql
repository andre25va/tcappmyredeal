-- Closing Confirmations Table
-- Tracks daily closing day confirmation emails sent to agents
-- and their responses (yes/no/not_sure/dead/new_date)

CREATE TABLE IF NOT EXISTS public.closing_confirmations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id uuid REFERENCES public.deals(id) NOT NULL,
  contact_id uuid REFERENCES public.contacts(id),
  contact_email text NOT NULL,
  contact_name text,
  deal_address text,
  scheduled_closing_date date,
  token text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  sent_at timestamptz DEFAULT now(),
  response text CHECK (response IN ('yes', 'no', 'not_sure', 'dead', 'new_date')),
  new_proposed_date date,
  responded_at timestamptz,
  tc_notified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.closing_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.closing_confirmations
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_closing_confirmations_deal_id ON public.closing_confirmations(deal_id);
CREATE INDEX idx_closing_confirmations_token ON public.closing_confirmations(token);
CREATE INDEX idx_closing_confirmations_sent_at ON public.closing_confirmations(sent_at);
