-- ═══════════════════════════════════════════════════════════════
-- Enable RLS on all unprotected public tables (security fix)
-- Applied: Production + Staging
-- ═══════════════════════════════════════════════════════════════

-- ── 1. CLIENT-FACING TABLES WITH SCOPED POLICIES ───────────────

-- activity_log
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_log_read" ON public.activity_log
  FOR SELECT TO authenticated
  USING (
    deal_id IN (
      SELECT id FROM public.deals WHERE created_by = auth.uid()
    )
  );

-- settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read" ON public.settings
  FOR SELECT TO authenticated USING (true);

-- allowed_phones
ALTER TABLE public.allowed_phones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allowed_phones_own" ON public.allowed_phones
  FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_own" ON public.audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- nudge_templates
ALTER TABLE public.nudge_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nudge_templates_org" ON public.nudge_templates
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE contact_id = auth.uid()
    )
  );

-- workflow_rules
ALTER TABLE public.workflow_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_rules_org" ON public.workflow_rules
  FOR SELECT TO authenticated
  USING (
    org_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE contact_id = auth.uid()
    )
  );

-- ── 2. SERVER-SIDE ONLY TABLES (no client policy needed) ────────
-- Edge functions use service_role which bypasses RLS.
-- Enabling RLS with no client policy blocks all direct client access.

ALTER TABLE public.agent_processing_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambiguity_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.callback_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.callback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_phone_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_ref_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_thread_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nudge_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_deal_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;
