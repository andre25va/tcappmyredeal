-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: add_deal_dedup_and_import_tracking
-- Applied: 2025-04-05
-- Purpose:
--   1. Create import_sessions table — tracks each contract upload per deal
--   2. Add is_extracted, created_from, import_session_id to contacts
--   3. Add archived_at, archived_by, archived_reason to deals
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. import_sessions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.import_sessions (
  id               uuid        PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  deal_id          uuid        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  org_id           uuid        REFERENCES public.organizations(id),
  source           text        NOT NULL DEFAULT 'contract_upload'
                               CHECK (source IN ('contract_upload', 'manual_entry')),
  session_number   integer     NOT NULL DEFAULT 1,  -- 1 = first import, 2 = re-import, etc.
  created_by       uuid        REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS import_sessions_deal_id_idx ON public.import_sessions(deal_id);
CREATE INDEX IF NOT EXISTS import_sessions_org_id_idx  ON public.import_sessions(org_id);

ALTER TABLE public.import_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_sessions_all" ON public.import_sessions
  FOR ALL USING (true) WITH CHECK (true);

-- ── 2. contacts: add tracking columns ────────────────────────────────────────
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_extracted       boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_from       text      CHECK (created_from IN ('manual', 'extracted')),
  ADD COLUMN IF NOT EXISTS import_session_id  uuid      REFERENCES public.import_sessions(id);

CREATE INDEX IF NOT EXISTS contacts_import_session_id_idx ON public.contacts(import_session_id);
CREATE INDEX IF NOT EXISTS contacts_is_extracted_idx      ON public.contacts(is_extracted) WHERE is_extracted = true;

-- ── 3. deals: add archive tracking columns ────────────────────────────────────
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS archived_at      timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by      uuid        REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS archived_reason  text        CHECK (archived_reason IN (
    'deal_fell_through',
    'duplicate_upload',
    'new_transaction_same_property',
    'other'
  ));

CREATE INDEX IF NOT EXISTS deals_archived_at_idx ON public.deals(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS deals_status_idx       ON public.deals(status);
