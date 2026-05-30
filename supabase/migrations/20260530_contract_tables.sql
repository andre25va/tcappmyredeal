-- ─────────────────────────────────────────────────────────────────────────────
-- APP30: Nationwide contract forms architecture
-- contract_forms  → defines available forms per MLS board (config-driven)
-- contract_submissions → filled contracts per deal
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. contract_forms: one row per form per board (extensible nationwide)
create table if not exists contract_forms (
  id               uuid        primary key default gen_random_uuid(),
  mls_board        text        not null,
  state_code       text,                        -- null = applies to all states for this board
  form_name        text        not null,
  form_slug        text        not null unique,
  form_version     text        not null default '1.0',
  form_structure   jsonb,                       -- future: config-driven field definitions
  tc_forms_path    text,                        -- path in tc-redeal-forms app
  active           boolean     not null default true,
  created_at       timestamptz not null default now()
);

-- 2. contract_submissions: one row per filled contract per deal
create table if not exists contract_submissions (
  id                  uuid        primary key default gen_random_uuid(),
  deal_id             uuid        references deals(id) on delete cascade,
  contract_form_id    uuid        references contract_forms(id),
  org_id              uuid,
  submitted_data      jsonb,                    -- all filled field values
  status              text        not null default 'draft',
    -- draft | submitted | sent_for_signature | signed | voided
  docusign_envelope_id text,
  docusign_status     text,
  pdf_url             text,
  pdf_document_id     uuid,                     -- FK to deal_documents once stored
  sent_at             timestamptz,
  signed_at           timestamptz,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Indexes
create index if not exists contract_forms_mls_board_idx
  on contract_forms (mls_board);

create index if not exists contract_submissions_deal_id_idx
  on contract_submissions (deal_id);

create index if not exists contract_submissions_status_idx
  on contract_submissions (status);

-- RLS
alter table contract_forms enable row level security;
alter table contract_submissions enable row level security;

create policy "Authenticated can read contract_forms"
  on contract_forms for select to authenticated using (true);

create policy "Authenticated can manage contract_submissions"
  on contract_submissions for all to authenticated using (true);

-- ── Seed: Heartland MLS / KCRAR — first supported form ──────────────────────
insert into contract_forms (mls_board, state_code, form_name, form_slug, tc_forms_path) values
  ('Heartland MLS', null,
   'Residential Real Estate Sale Contract',
   'heartland-residential-sale',
   '/contracts/new?form=heartland-residential-sale')
on conflict (form_slug) do nothing;
