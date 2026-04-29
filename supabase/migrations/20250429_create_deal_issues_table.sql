-- Sprint 10: Deal Loop — deal_issues table
-- Migration applied directly to production Supabase on 2025-04-29
-- Reference only — already live

CREATE TABLE IF NOT EXISTS public.deal_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  issue_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  description text,
  suggested_action text,
  action_type text,
  action_payload jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'open',
  snoozed_until timestamptz,
  resolved_at timestamptz,
  loop_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
