-- ─────────────────────────────────────────────────────────────────────────────
-- FORM BRAIN: Phase 1 — form_template_sections + form_template_fields
-- Migrates formSections.ts + FIELD_LABEL_MAP from tc-redeal-forms into Supabase
-- 3 forms · 34 sections · ~260 fields
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Seed forms (seller-disclosure and exclusive-right-to-sell are new)
insert into contract_forms (mls_board, state_code, form_name, form_slug, tc_forms_path) values
  ('KS/MO', null, 'Seller Disclosure Statement', 'seller-disclosure', '/forms/seller-disclosure'),
  ('KS/MO', null, 'Exclusive Right to Sell Listing Agreement', 'exclusive-right-to-sell', '/forms/exclusive-right-to-sell'),
  ('KS/MO', null, 'Residential Real Estate Sale Contract', 'residential-sale-contract', '/forms/residential-sale-contract')
on conflict (form_slug) do nothing;

-- 2. form_template_sections table
create table if not exists form_template_sections (
  id           uuid        primary key default gen_random_uuid(),
  form_slug    text        not null references contract_forms(form_slug) on delete cascade,
  section_key  text        not null,
  title        text        not null,
  title_es     text,
  sort_order   int         not null default 0,
  created_at   timestamptz not null default now(),
  unique (form_slug, section_key)
);

alter table form_template_sections enable row level security;
create policy "Authenticated can read form_template_sections"
  on form_template_sections for select to authenticated using (true);

create index if not exists form_template_sections_form_slug_idx
  on form_template_sections (form_slug);

-- 3. form_template_fields table
create table if not exists form_template_fields (
  id               uuid        primary key default gen_random_uuid(),
  form_slug        text        not null references contract_forms(form_slug) on delete cascade,
  section_id       uuid        not null references form_template_sections(id) on delete cascade,
  field_key        text        not null,
  label            text        not null,
  field_type       text        not null default 'text',
    -- text | checkbox | date | number | signature | initial | choice
  party            text,        -- buyer | seller | broker | both | null
  required         boolean     not null default false,
  choices          text[],      -- for choice fields: ARRAY['yes','no','na']
  sort_order       int         not null default 0,
  extraction_hint  text,        -- AI extraction guidance
  created_at       timestamptz not null default now(),
  unique (form_slug, field_key)
);

alter table form_template_fields enable row level security;
create policy "Authenticated can read form_template_fields"
  on form_template_fields for select to authenticated using (true);

create index if not exists form_template_fields_form_slug_idx
  on form_template_fields (form_slug);
create index if not exists form_template_fields_section_id_idx
  on form_template_fields (section_id);
create index if not exists form_template_fields_field_key_idx
  on form_template_fields (field_key);

-- 4. Seed sections (34 total across 3 forms)
insert into form_template_sections (form_slug, section_key, title, title_es, sort_order) values
  ('seller-disclosure', 'intro', 'Property & Seller Info', 'Información del Vendedor', 0),
  ('seller-disclosure', 'land', 'Land & Lot', 'Terreno y Lote', 1),
  ('seller-disclosure', 'roof', 'Roof', 'Techo', 2),
  ('seller-disclosure', 'infestation', 'Infestation', 'Infestación', 3),
  ('seller-disclosure', 'structural', 'Structural', 'Estructura', 4),
  ('seller-disclosure', 'additions', 'Additions & Plumbing', 'Adiciones y Plomería', 5),
  ('seller-disclosure', 'hvac', 'HVAC & Electrical', 'Clima y Electricidad', 6),
  ('seller-disclosure', 'hazardous', 'Hazardous Conditions', 'Condiciones Peligrosas', 7),
  ('seller-disclosure', 'taxes_hoa', 'Taxes & HOA', 'Impuestos y HOA', 8),
  ('seller-disclosure', 'inspections', 'Inspections', 'Inspecciones', 9),
  ('seller-disclosure', 'other_matters', 'Other Matters', 'Otros Asuntos', 10),
  ('seller-disclosure', 'comments', 'Additional Comments', 'Comentarios Adicionales', 11),
  ('exclusive-right-to-sell', 'property_info', 'Property & Listing Info', 'Información de la Propiedad', 0),
  ('exclusive-right-to-sell', 'mls_property_type', 'MLS Entry & Property Type', 'Entrada MLS y Tipo de Propiedad', 1),
  ('exclusive-right-to-sell', 'marketing', 'Marketing Distribution', 'Distribución de Mercadeo', 2),
  ('exclusive-right-to-sell', 'seller_obligations', 'Seller Obligations', 'Obligaciones del Vendedor', 3),
  ('exclusive-right-to-sell', 'broker_authorization', 'Broker Authorization to Disclose', 'Autorización al Corredor para Divulgar', 4),
  ('exclusive-right-to-sell', 'brokerage_relationships', 'Brokerage Relationships', 'Relaciones de Corretaje', 5),
  ('exclusive-right-to-sell', 'compensation', 'Compensation', 'Compensación', 6),
  ('exclusive-right-to-sell', 'title_warranty', 'Title & Home Warranty', 'Título y Garantía del Hogar', 7),
  ('exclusive-right-to-sell', 'additional_terms', 'Additional Terms', 'Términos Adicionales', 8),
  ('exclusive-right-to-sell', 'signatures', 'Signatures & Contact Info', 'Firmas e Información de Contacto', 9),
  ('residential-sale-contract', 'parties', 'Parties & Property', 'Partes y Propiedad', 0),
  ('residential-sale-contract', 'inclusions_exclusions', 'Inclusions & Exclusions', 'Inclusiones y Exclusiones', 1),
  ('residential-sale-contract', 'additional_terms', 'Additional Terms & Warranty', 'Términos Adicionales y Garantía', 2),
  ('residential-sale-contract', 'addenda', 'Addenda', 'Addenda', 3),
  ('residential-sale-contract', 'broker_disclosure', 'Licensed Broker Disclosure', 'Divulgación de Corredor Licenciado', 4),
  ('residential-sale-contract', 'purchase_price', 'Purchase Price & Earnest Money', 'Precio de Compra y Dinero de Garantía', 5),
  ('residential-sale-contract', 'closing', 'Closing & Possession', 'Cierre y Posesión', 6),
  ('residential-sale-contract', 'financing', 'Financing', 'Financiamiento', 7),
  ('residential-sale-contract', 'loan_details', 'Loan Details & Approval', 'Detalles y Aprobación de Préstamo', 8),
  ('residential-sale-contract', 'inspection', 'Inspection, Survey & Repairs', 'Inspección, Topografía y Reparaciones', 9),
  ('residential-sale-contract', 'brokerage', 'Brokerage Relationships', 'Relaciones de Corretaje', 10),
  ('residential-sale-contract', 'signatures', 'Signatures & Contact Info', 'Firmas e Información de Contacto', 11)
on conflict (form_slug, section_key) do nothing;

-- 5. Seed fields from FIELD_LABEL_MAP + CHOICE_LABELS
-- Uses a DO block so we can look up section UUIDs by (form_slug, section_key)
do $$
declare
  v_section_id uuid;
begin

  -- [seller-disclosure] intro
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'intro';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'sellerName1', 'Seller 1 Full Name',
       'text', null, true, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'sellerName2', 'Seller 2 Full Name',
       'text', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'propertyAddress', 'Property Address',
       'text', null, true, null, 2, 'Full street address including city, state, zip')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'yearBuilt', 'Year Built',
       'text', null, true, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'ownershipYears', 'Years Owned',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'howLongSinceOccupied', 'How long since you last occupied the property',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'occ_seller_occupies', 'Seller currently occupies the property',
       'text', 'seller', false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'occ_never_occupied', 'Seller has never occupied the property',
       'text', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'const_conventional', 'Conventional construction',
       'text', null, false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'const_modular', 'Modular',
       'text', null, false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'const_manufactured', 'Manufactured',
       'text', null, false, null, 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'const_mobile', 'Mobile home',
       'text', null, false, null, 11, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'const_other_cb', 'Other construction type',
       'checkbox', null, false, null, 12, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [seller-disclosure] land
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'land';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'landExplanation', 'Land issues explanation',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_a', 'Encroachments, easements, rights-of-way, or boundary disputes',
       'choice', null, false, ARRAY['yes','no','na'], 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_b', 'Fill, sub-surface anomalies, or soil problems',
       'choice', null, false, ARRAY['yes','no','na'], 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_c', 'Hazardous materials on or near the property',
       'choice', null, false, ARRAY['yes','no','na'], 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_d', 'Drainage or flooding issues',
       'choice', null, false, ARRAY['yes','no','na'], 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_e', 'Mine shafts or underground storage tanks',
       'choice', null, false, ARRAY['yes','no','na'], 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_f', 'Located in a flood plain or flood zone',
       'choice', null, false, ARRAY['yes','no','na'], 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_g', 'Proposed road, utility, or projects affecting property',
       'choice', null, false, ARRAY['yes','no','na'], 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_h', 'Deed restrictions, covenants, or conditions',
       'choice', null, false, ARRAY['yes','no','na'], 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_i', 'Septic system or leach field on neighboring property',
       'choice', null, false, ARRAY['yes','no','na'], 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_j', 'Property in or near a special use district',
       'choice', null, false, ARRAY['yes','no','na'], 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_j_belongs', 'Special district affects value or use',
       'choice', null, false, ARRAY['yes','no','na'], 11, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_k', 'Neighborhood issues (noise, odors, nuisances)',
       'choice', null, false, ARRAY['yes','no','na'], 12, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_l', 'Zoning violations or non-conforming use',
       'choice', null, false, ARRAY['yes','no','na'], 13, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'land_m', 'Known planned development nearby',
       'choice', null, false, ARRAY['yes','no','na'], 14, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [seller-disclosure] roof
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'roof';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'roofAge', 'Roof age (years)',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'roofType', 'Roof type / material',
       'text', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'roofIssuesDesc', 'Description of roof issues',
       'text', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'roofRepairCompany', 'Roof repair company name',
       'text', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'roofRepairDate', 'Date of roof repair',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'roofLayers', 'Number of roof layers',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'roof_b', 'Current roof leaks or moisture damage',
       'choice', null, false, ARRAY['yes','no','na'], 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'roof_c', 'Roof repairs made in last 5 years',
       'choice', null, false, ARRAY['yes','no','na'], 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'roof_d', 'Roof ever been replaced',
       'choice', null, false, ARRAY['yes','no','na'], 8, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [seller-disclosure] infestation
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'infestation';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'pestControlInfo', 'Pest control company info',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'pestWarrantyCost', 'Pest warranty annual cost',
       'number', null, false, null, 1, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'pestWarrantyTime', 'Pest warranty time remaining',
       'text', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'infest_a', 'Active wood-destroying insect infestation',
       'choice', null, false, ARRAY['yes','no','na'], 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'infest_b', 'Prior wood-destroying insect infestation',
       'choice', null, false, ARRAY['yes','no','na'], 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'infest_c', 'Evidence of previous infestation damage',
       'choice', null, false, ARRAY['yes','no','na'], 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'infest_d', 'Pest control treatments in last 5 years',
       'choice', null, false, ARRAY['yes','no','na'], 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'infest_e', 'Pest control warranty in effect',
       'choice', null, false, ARRAY['yes','no','na'], 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'infest_e_stays', 'Pest warranty transfers to buyer',
       'choice', null, false, ARRAY['yes','no','na'], 8, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [seller-disclosure] structural
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'structural';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'fireplaceInspectionDate', 'Last fireplace inspection date',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'struct_a', 'Settling, movement, or structural defects',
       'choice', null, false, ARRAY['yes','no','na'], 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'struct_b', 'Cracks in walls, floors, or ceilings',
       'choice', null, false, ARRAY['yes','no','na'], 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'struct_c', 'Water intrusion or moisture in basement/crawl space',
       'choice', null, false, ARRAY['yes','no','na'], 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'struct_d', 'Exterior drainage or water runoff issues',
       'choice', null, false, ARRAY['yes','no','na'], 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'struct_e', 'Structural repairs or modifications',
       'choice', null, false, ARRAY['yes','no','na'], 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'struct_f', 'Fireplace or wood-burning stove',
       'choice', null, false, ARRAY['yes','no','na'], 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'struct_g', 'Fireplace inspected in last 5 years',
       'choice', null, false, ARRAY['yes','no','na'], 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'struct_h', 'Pool, spa, or hot tub on property',
       'choice', null, false, ARRAY['yes','no','na'], 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'struct_i', 'Sauna or steam room',
       'choice', null, false, ARRAY['yes','no','na'], 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'struct_j', 'Elevator or lift',
       'choice', null, false, ARRAY['yes','no','na'], 10, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [seller-disclosure] additions
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'additions';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'septicLocation', 'Septic system location',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'add_earnest_amount', 'Additional Earnest Money Amount ($)',
       'number', null, false, null, 1, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'add_earnest_date', 'Additional Earnest Money Due Date',
       'date', null, false, null, 2, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'add_earnest_form_other', 'Additional Earnest Money Form (other)',
       'text', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'add_earnest_form_check_eft', 'Additional Earnest Money via EFT',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'add_earnest_deposited_with', 'Additional Earnest Money Deposited With',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'add_earnest_nonrefundable_check', 'Additional Earnest Money Non-Refundable',
       'checkbox', null, false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'add_earnest_refundable_check', 'Additional Earnest Money Refundable',
       'checkbox', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'add_a', 'Additions or improvements to structure',
       'choice', null, false, ARRAY['yes','no','na'], 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'add_b', 'Permits obtained for all work',
       'choice', null, false, ARRAY['yes','no','na'], 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'plumb_b', 'Plumbing issues or leaks',
       'choice', null, false, ARRAY['yes','no','na'], 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'plumb_c', 'Water softener on property',
       'choice', null, false, ARRAY['yes','no','na'], 11, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'plumb_d', 'Water filtration / treatment system',
       'choice', null, false, ARRAY['yes','no','na'], 12, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'plumb_h', 'Septic system issues or repairs needed',
       'choice', null, false, ARRAY['yes','no','na'], 13, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'plumb_i', 'Gas service to property',
       'choice', null, false, ARRAY['yes','no','na'], 14, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'plumb_k', 'Sprinkler / irrigation system',
       'choice', null, false, ARRAY['yes','no','na'], 15, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'plumb_k_covers', 'Sprinkler system covers entire property',
       'choice', null, false, ARRAY['yes','no','na'], 16, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'plumb_l', 'Plumbing defects or known problems',
       'choice', null, false, ARRAY['yes','no','na'], 17, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'plumb_m', 'Sump pump',
       'choice', null, false, ARRAY['yes','no','na'], 18, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [seller-disclosure] hvac
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'hvac';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'electricalPanelLocation', 'Electrical panel location',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'electricalPanelSize', 'Electrical panel size (amps)',
       'text', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'hvac_a', 'Air conditioning system',
       'choice', null, false, ARRAY['yes','no','na'], 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'hvac_b', 'Heating system',
       'choice', null, false, ARRAY['yes','no','na'], 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'hvac_c', 'HVAC malfunctions or issues in last 5 years',
       'choice', null, false, ARRAY['yes','no','na'], 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'hvac_d', 'Water heater',
       'choice', null, false, ARRAY['yes','no','na'], 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'hvac_e', 'Any known HVAC issues',
       'choice', null, false, ARRAY['yes','no','na'], 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'elec_c', 'Known electrical deficiencies',
       'choice', null, false, ARRAY['yes','no','na'], 7, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [seller-disclosure] taxes_hoa
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'taxes_hoa';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax14aBondsAmount', 'Outstanding bond amount',
       'number', null, false, null, 0, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax14lAmount', 'HOA fee amount',
       'number', null, false, null, 1, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax14mDueDate', 'Assessment due date',
       'text', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax14mAmount', 'Assessment amount',
       'number', null, false, null, 3, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax14mIncludes', 'Assessment includes',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax14mContact', 'HOA contact info',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_a_outside_city', 'Property is outside city limits',
       'choice', null, false, ARRAY['yes','no','na'], 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_a_bonds', 'Outstanding special assessment bonds',
       'choice', null, false, ARRAY['yes','no','na'], 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_b', 'Delinquent property taxes',
       'choice', null, false, ARRAY['yes','no','na'], 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_c', 'Pending special assessments',
       'choice', null, false, ARRAY['yes','no','na'], 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_d', 'Property subject to abatement or tax credits',
       'choice', null, false, ARRAY['yes','no','na'], 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_e', 'Agricultural tax status',
       'choice', null, false, ARRAY['yes','no','na'], 11, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_f', 'Mechanic''s or materialman''s liens',
       'choice', null, false, ARRAY['yes','no','na'], 12, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_g', 'Pending litigation affecting property',
       'choice', null, false, ARRAY['yes','no','na'], 13, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_h', 'Property in a Community Improvement District (CID)',
       'choice', null, false, ARRAY['yes','no','na'], 14, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_i', 'Property in a Transportation Development District (TDD)',
       'choice', null, false, ARRAY['yes','no','na'], 15, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_j', 'Subject to a solar energy system lease',
       'choice', null, false, ARRAY['yes','no','na'], 16, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_k', 'Subject to HOA',
       'choice', null, false, ARRAY['yes','no','na'], 17, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_l', 'HOA special assessment pending',
       'choice', null, false, ARRAY['yes','no','na'], 18, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_m', 'Regular HOA dues',
       'choice', null, false, ARRAY['yes','no','na'], 19, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'tax_n', 'Property subject to right of first refusal',
       'choice', null, false, ARRAY['yes','no','na'], 20, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [seller-disclosure] other_matters
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'other_matters';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'sec16iLocks', 'Electronic lock / security system details',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'electricCompany', 'Electric company name',
       'text', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'electricPhone', 'Electric company phone',
       'number', null, false, null, 2, 'Phone number; extract digits and formatting')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'gasCompany', 'Gas company name',
       'text', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'gasPhone', 'Gas company phone',
       'number', null, false, null, 4, 'Phone number; extract digits and formatting')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'waterCompany', 'Water company name',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'waterPhone', 'Water company phone',
       'number', null, false, null, 6, 'Phone number; extract digits and formatting')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'trashCompany', 'Trash company name',
       'text', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'trashPhone', 'Trash company phone',
       'number', null, false, null, 8, 'Phone number; extract digits and formatting')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'otherUtility1', 'Other utility name',
       'text', null, false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'otherUtilityPhone1', 'Other utility phone',
       'number', null, false, null, 10, 'Phone number; extract digits and formatting')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_a', 'Shared driveways, party walls, or common areas',
       'choice', null, false, ARRAY['yes','no','na'], 11, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_b', 'Deed restrictions or CC&Rs',
       'choice', null, false, ARRAY['yes','no','na'], 12, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_c', 'Current or threatened legal action',
       'choice', null, false, ARRAY['yes','no','na'], 13, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_d', 'Governmental notices or violations',
       'choice', null, false, ARRAY['yes','no','na'], 14, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_e', 'Property used as rental or investment',
       'choice', null, false, ARRAY['yes','no','na'], 15, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_f', 'Tenant currently occupying property',
       'choice', null, false, ARRAY['yes','no','na'], 16, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_g', 'Underground oil tank ever on property',
       'choice', null, false, ARRAY['yes','no','na'], 17, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_h', 'Known disputes with neighbors',
       'choice', null, false, ARRAY['yes','no','na'], 18, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_i', 'Electronic security system or smart locks',
       'choice', null, false, ARRAY['yes','no','na'], 19, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_j', 'Property located in historic district',
       'choice', null, false, ARRAY['yes','no','na'], 20, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_k', 'Property subject to conservation easement',
       'choice', null, false, ARRAY['yes','no','na'], 21, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_l', 'Liens or encumbrances',
       'choice', null, false, ARRAY['yes','no','na'], 22, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_m', 'Known death on property in last 3 years',
       'choice', null, false, ARRAY['yes','no','na'], 23, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_n', 'Other material defects not disclosed above',
       'choice', null, false, ARRAY['yes','no','na'], 24, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_o', 'Pet odor or damage',
       'choice', null, false, ARRAY['yes','no','na'], 25, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_p', 'Property used for drug manufacturing',
       'choice', null, false, ARRAY['yes','no','na'], 26, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_q', 'Foundation treated for wood-destroying insects',
       'choice', null, false, ARRAY['yes','no','na'], 27, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_r', 'Flood, fire, or other damage in past 5 years',
       'choice', null, false, ARRAY['yes','no','na'], 28, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_r_repairs', 'Repairs completed after damage',
       'choice', null, false, ARRAY['yes','no','na'], 29, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'other_s', 'Additional voluntary disclosures',
       'choice', null, false, ARRAY['yes','no','na'], 30, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'elec_sys', 'Electrical system in good working order',
       'choice', null, false, ARRAY['yes','no','na'], 31, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [seller-disclosure] comments
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'comments';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'additionalComments', 'Additional comments or disclosures',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [exclusive-right-to-sell] property_info
  select id into v_section_id from form_template_sections
    where form_slug = 'exclusive-right-to-sell' and section_key = 'property_info';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_7b43', 'Contract Date',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_2271', 'Seller Name & Marital Status',
       'text', null, true, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_66d2', 'Broker / Brokerage Name',
       'text', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_09d6', 'Property Address',
       'text', null, true, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_ba8f', 'Legal Description Addendum Reference',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_d851', 'Legal Description (Line 1)',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_2af3', 'Legal Description (Line 2)',
       'text', null, false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_9b4d', 'Legal Description (Line 3)',
       'text', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_aafa', 'Property Description / Parcel ID',
       'text', null, false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_aa36', 'Listing Start Date',
       'text', null, true, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_7d47', 'Listing End Date',
       'text', null, true, null, 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_4614', 'List Price ($)',
       'text', null, true, null, 11, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [exclusive-right-to-sell] mls_property_type
  select id into v_section_id from form_template_sections
    where form_slug = 'exclusive-right-to-sell' and section_key = 'mls_property_type';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_72a7', 'Authorize delayed MLS entry',
       'checkbox', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_6637', 'MLS Active Date (if delayed entry)',
       'text', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_50af', 'Property Type: Residential Resale',
       'checkbox', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_6534', 'Property Type: New Home Construction',
       'checkbox', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_a38e', 'Property Type: Land',
       'checkbox', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [exclusive-right-to-sell] marketing
  select id into v_section_id from form_template_sections
    where form_slug = 'exclusive-right-to-sell' and section_key = 'marketing';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_667d', 'Active with Full Distribution',
       'checkbox', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_2cc6', 'Active with Limited Marketing Distribution',
       'checkbox', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_4c2b', 'Coming Soon with Full Distribution',
       'checkbox', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_da12', 'Coming Soon with No Distribution',
       'checkbox', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_70ff', 'Private Office Exclusive / No Distribution',
       'checkbox', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_0b2a', 'Full Distribution Conversion Date',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [exclusive-right-to-sell] seller_obligations
  select id into v_section_id from form_template_sections
    where form_slug = 'exclusive-right-to-sell' and section_key = 'seller_obligations';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_17d6', 'Forfeited Deposit Retained by Broker (%)',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [exclusive-right-to-sell] broker_authorization
  select id into v_section_id from form_template_sections
    where form_slug = 'exclusive-right-to-sell' and section_key = 'broker_authorization';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_0b84', 'Seller does NOT authorize broker to disclose reason for sale',
       'checkbox', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_b20b', 'Seller authorizes broker to disclose motivating factors for sale',
       'checkbox', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_e3f8', 'Seller does NOT authorize broker to disclose other offers',
       'checkbox', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_c1e8', 'Seller authorizes broker to disclose existence of other offers',
       'checkbox', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_e36d', 'Seller authorizes broker to disclose existence AND TERMS of other offers',
       'checkbox', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [exclusive-right-to-sell] brokerage_relationships
  select id into v_section_id from form_template_sections
    where form_slug = 'exclusive-right-to-sell' and section_key = 'brokerage_relationships';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_63bb', 'Seller Agency – Yes',
       'checkbox', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_233e', 'Seller Agency – No',
       'checkbox', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_38d2', 'Transaction Broker – Yes',
       'checkbox', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_8d52', 'Transaction Broker – No',
       'checkbox', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_ff84', 'Subagency – Yes',
       'checkbox', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_93b4', 'Subagency – No',
       'checkbox', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_4bf8', 'Dual Agency (Missouri only) – Yes',
       'checkbox', null, false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_6d73', 'Dual Agency (Missouri only) – No',
       'checkbox', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_ccc5', 'Designated Agent for Seller (Kansas) – Yes',
       'checkbox', null, false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_e33b', 'Designated Agent for Seller (Kansas) – No',
       'checkbox', null, false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_51cc', 'Designated Agent for Buyer (Kansas) – Yes',
       'checkbox', null, false, null, 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_bb1e', 'Designated Agent for Buyer (Kansas) – No',
       'checkbox', null, false, null, 11, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [exclusive-right-to-sell] compensation
  select id into v_section_id from form_template_sections
    where form_slug = 'exclusive-right-to-sell' and section_key = 'compensation';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_553d', 'Compensation to Listing Broker (description)',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_c328', 'Unrepresented Buyer – Additional Compensation',
       'text', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_fa0f', 'Total Compensation to Listing Broker',
       'text', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_0565', 'Additional compensation applies if buyer is unrepresented',
       'checkbox', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_de7d', 'Other Compensation (check if applicable)',
       'checkbox', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_1df4', 'Other Compensation Details',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_b309', 'Protection Period (calendar days)',
       'text', null, false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [exclusive-right-to-sell] title_warranty
  select id into v_section_id from form_template_sections
    where form_slug = 'exclusive-right-to-sell' and section_key = 'title_warranty';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_8bde', 'Title Evidence Through (company/source)',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_6089', 'Title Vested in Name of',
       'text', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_324c', 'Title Vesting Detail (Line 1)',
       'text', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_7098', 'Title Vesting Detail (Line 2)',
       'text', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_aff6', 'Home Warranty – Max Cost (not to exceed $)',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_df30', 'Home Warranty Vendor',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_b19f', 'Seller agrees to purchase a home warranty',
       'checkbox', null, false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_89af', 'Seller does NOT agree to purchase a home warranty',
       'checkbox', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_45ab', 'Home Warranty Amount ($)',
       'text', null, false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_fc9f', 'Seller does NOT agree to purchase a home warranty (alt)',
       'checkbox', null, false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [exclusive-right-to-sell] additional_terms
  select id into v_section_id from form_template_sections
    where form_slug = 'exclusive-right-to-sell' and section_key = 'additional_terms';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'checkbox_457b', 'Franchise Disclosure',
       'checkbox', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_e03a', 'Additional Terms & Conditions (Line 1)',
       'text', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_88f8', 'Additional Terms & Conditions (Line 2)',
       'text', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_c470', 'Additional Terms & Conditions (Line 3)',
       'text', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_0990', 'Additional Terms & Conditions (Line 4)',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [exclusive-right-to-sell] signatures
  select id into v_section_id from form_template_sections
    where form_slug = 'exclusive-right-to-sell' and section_key = 'signatures';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_a0fd', 'Brokerage Name',
       'text', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_2780', 'Seller 1 – Printed Name',
       'text', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_fca0', 'Seller 1 – Signature Date',
       'text', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_a78e', 'Licensee Assisting Seller',
       'text', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_c621', 'Licensee Date',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_056c', 'Seller 2 – Printed Name',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_f47a', 'Seller 2 – Signature Date',
       'text', null, false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_5d08', 'Seller Address',
       'text', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_f4d2', 'Seller City, State, ZIP',
       'text', null, false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_e9ad', 'Seller Phone',
       'text', null, false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_e6cf', 'Seller Email',
       'text', null, false, null, 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_13d2', 'Designated Agent Name (Line 1)',
       'text', null, false, null, 11, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_7fd1', 'Designated Agent Name (Line 2)',
       'text', null, false, null, 12, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('exclusive-right-to-sell', v_section_id, 'text_4be4', 'Broker''s Signature Name',
       'text', null, false, null, 13, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [residential-sale-contract] parties
  select id into v_section_id from form_template_sections
    where form_slug = 'residential-sale-contract' and section_key = 'parties';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_name_1', 'Seller 1 Full Name / Marital Status',
       'text', 'seller', true, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_name_2', 'Seller 2 Full Name / Marital Status',
       'text', 'seller', false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_name_1', 'Buyer 1 Full Name / Marital Status',
       'text', 'buyer', true, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_name_2', 'Buyer 2 Full Name / Marital Status',
       'text', 'buyer', false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'bank_owned_check', 'Bank-Owned / REO Property',
       'checkbox', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'manufactured_home_check', 'Manufactured Home',
       'checkbox', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'property_address', 'Property Address',
       'text', null, true, null, 6, 'Full street address including city, state, zip')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'county', 'County',
       'text', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'legal_desc_1', 'Legal Description (Line 1)',
       'text', null, false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'legal_desc_2', 'Legal Description (Line 2)',
       'text', null, false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'legal_desc_3', 'Legal Description (Line 3)',
       'text', null, false, null, 10, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [residential-sale-contract] additional_terms
  select id into v_section_id from form_template_sections
    where form_slug = 'residential-sale-contract' and section_key = 'additional_terms';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'warranty_waive_check', 'Waive Home Warranty',
       'checkbox', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'warranty_seller_check', 'Warranty paid by: Seller',
       'checkbox', 'seller', false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'warranty_buyer_check', 'Warranty paid by: Buyer',
       'checkbox', 'buyer', false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'warranty_cost', 'Warranty Cost ($)',
       'number', null, false, null, 3, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'warranty_vendor', 'Warranty Vendor',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'warranty_deductible', 'Warranty Deductible ($)',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'warranty_lic_buyer_check', 'Warranty to Buyer''s Licensee',
       'checkbox', 'buyer', false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'warranty_lic_seller_check', 'Warranty to Seller''s Licensee',
       'checkbox', 'seller', false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [residential-sale-contract] addenda
  select id into v_section_id from form_template_sections
    where form_slug = 'residential-sale-contract' and section_key = 'addenda';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'addendum_sellers_disc_check', 'Seller''s Disclosure Addendum',
       'checkbox', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'addendum_lead_check', 'Lead-Based Paint Addendum',
       'checkbox', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'addendum_contingency_check', 'Sale Contingency Addendum',
       'checkbox', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'addendum_other_1', 'Other Addendum 1 Name',
       'text', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'addendum_other_2', 'Other Addendum 2 Name',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'addendum_other_3', 'Other Addendum 3 Name',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'addendum_other_4b', 'Other Addendum 4 Name',
       'text', null, false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'addendum_other_5a', 'Other Addendum 5a Name',
       'text', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'addendum_other_5b', 'Other Addendum 5b Name',
       'text', null, false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'addendum_other_6a', 'Other Addendum 6a Name',
       'text', null, false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'addendum_other_6b', 'Other Addendum 6b Name',
       'text', null, false, null, 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'other 0', 'Other Addendum – Applies',
       'text', null, false, null, 11, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'other 01', 'Other Addendum – Applies',
       'text', null, false, null, 12, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'other 1', 'Other Addendum 1 – Applies',
       'text', null, false, null, 13, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'other 2', 'Other Addendum 2 – Applies',
       'text', null, false, null, 14, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'other 3', 'Other Addendum 3 – Applies',
       'text', null, false, null, 15, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [residential-sale-contract] broker_disclosure
  select id into v_section_id from form_template_sections
    where form_slug = 'residential-sale-contract' and section_key = 'broker_disclosure';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_is_licensed_broker', 'Seller is a licensed real estate broker',
       'text', 'broker', false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_seller_licensed_mo', 'Seller licensed in Missouri',
       'text', 'seller', false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_seller_licensed_ks', 'Seller licensed in Kansas',
       'text', 'seller', false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_seller_licensed_other_check', 'Seller licensed in other state',
       'checkbox', 'seller', false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_seller_licensed_other_text', 'Other state (seller)',
       'text', 'seller', false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_buyer_licensed_ks', 'Buyer licensed in Kansas',
       'text', 'buyer', false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_buyer_licensed_mo', 'Buyer licensed in Missouri',
       'text', 'buyer', false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_buyer_licensed_other_check', 'Buyer licensed in other state',
       'checkbox', 'buyer', false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_buyer_licensed_other_text', 'Other state (buyer)',
       'text', 'buyer', false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_lic_seller_family', 'Seller is related to a licensed agent',
       'text', 'seller', false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_lic_seller_fam_seller', 'Agent related to seller (seller''s side)',
       'text', 'seller', false, null, 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_lic_seller_fam_buyer', 'Agent related to seller (buyer''s side)',
       'text', 'buyer', false, null, 11, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_lic_buyer_family', 'Buyer is related to a licensed agent',
       'text', 'buyer', false, null, 12, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_lic_buyer_fam_seller', 'Agent related to buyer (seller''s side)',
       'text', 'buyer', false, null, 13, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'p3_lic_buyer_fam_buyer', 'Agent related to buyer (buyer''s side)',
       'text', 'buyer', false, null, 14, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [residential-sale-contract] purchase_price
  select id into v_section_id from form_template_sections
    where form_slug = 'residential-sale-contract' and section_key = 'purchase_price';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'purchase_price', 'Purchase Price ($)',
       'number', null, true, null, 0, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'earnest_delivery_days', 'Earnest Money Delivery (days)',
       'number', null, false, null, 1, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'earnest_money_amount', 'Earnest Money Amount ($)',
       'number', null, true, null, 2, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'earnest_form_other', 'Earnest Money Form (other)',
       'text', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'earnest_form_check_eft', 'Earnest Money via EFT',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'earnest_deposited_with', 'Earnest Money Deposited With',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'earnest_nonrefundable_check', 'Earnest Money is Non-Refundable',
       'checkbox', null, false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'earnest_refundable_check', 'Earnest Money is Refundable',
       'checkbox', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'total_amount_financed', 'Total Amount Financed ($)',
       'number', null, false, null, 8, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'balance_purchase_price', 'Balance of Purchase Price ($)',
       'number', null, false, null, 9, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_broker_compensation', 'Buyer''s Broker Compensation ($)',
       'text', 'buyer', false, null, 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_additional_costs', 'Seller Additional Costs ($)',
       'number', 'seller', false, null, 11, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'costs_not_payable_buyer', 'Costs Not Payable by Buyer ($)',
       'number', 'buyer', false, null, 12, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'total_seller_expenses', 'Total Seller Expenses ($)',
       'text', 'seller', false, null, 13, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [residential-sale-contract] closing
  select id into v_section_id from form_template_sections
    where form_slug = 'residential-sale-contract' and section_key = 'closing';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'closing_date', 'Closing Date',
       'date', null, true, null, 0, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'possession_location', 'Possession Location',
       'text', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'possession_time', 'Possession Time',
       'text', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'possession_am_pm', 'AM / PM',
       'text', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'cash_appraisal_days', 'Cash Sale Appraisal Deadline (days)',
       'number', null, false, null, 4, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'appraisal_notify_days', 'Appraisal Notification Deadline (days)',
       'number', null, false, null, 5, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'appraisal_negotiation_days', 'Appraisal Negotiation Period (days)',
       'number', null, false, null, 6, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'offer_expiration_date', 'Offer Expiration Date',
       'date', null, false, null, 7, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'offer_expiration_time', 'Offer Expiration Time',
       'text', null, false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'offer_expiration_hour', 'Offer Expiration Hour',
       'text', null, false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [residential-sale-contract] financing
  select id into v_section_id from form_template_sections
    where form_slug = 'residential-sale-contract' and section_key = 'financing';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'sale_not_contingent_check', 'Sale is NOT contingent on sale of other property',
       'checkbox', null, false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'sale_contingent_check', 'Sale IS contingent on sale of other property',
       'checkbox', null, false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'cash_sale_verify_days', 'Cash Verification Deadline (days)',
       'number', null, false, null, 2, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'cash_sale_check', 'Cash Sale',
       'checkbox', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'financed_sale_check', 'Financed Sale',
       'checkbox', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'loan_change_days_before_closing', 'Loan Change Notice (days before closing)',
       'number', null, false, null, 5, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_conventional_check', 'Primary Loan: Conventional',
       'checkbox', null, false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_fha_check', 'Primary Loan: FHA',
       'checkbox', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_va_check', 'Primary Loan: VA',
       'checkbox', null, false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_usda_check', 'Primary Loan: USDA',
       'checkbox', null, false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_owner_financing_check', 'Primary Loan: Owner Financing',
       'checkbox', null, false, null, 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_other_check', 'Primary Loan: Other',
       'checkbox', null, false, null, 11, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_other_text', 'Primary Loan: Other (describe)',
       'text', null, false, null, 12, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_rate_fixed_check', 'Primary Rate: Fixed',
       'checkbox', null, false, null, 13, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_rate_adjustable_check', 'Primary Rate: Adjustable',
       'checkbox', null, false, null, 14, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_rate_interest_only_check', 'Primary Rate: Interest Only',
       'checkbox', null, false, null, 15, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_rate_other_check', 'Primary Rate: Other',
       'checkbox', null, false, null, 16, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_rate_other_text', 'Primary Rate: Other (describe)',
       'number', null, false, null, 17, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_amortization_years', 'Primary Loan Amortization (years)',
       'number', null, false, null, 18, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_ltv', 'Primary LTV (%)',
       'number', null, false, null, 19, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'primary_loan_rate_pct', 'Primary Loan Rate (%)',
       'number', null, false, null, 20, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_conventional_check', 'Secondary Loan: Conventional',
       'checkbox', null, false, null, 21, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_fha_check', 'Secondary Loan: FHA',
       'checkbox', null, false, null, 22, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_va_check', 'Secondary Loan: VA',
       'checkbox', null, false, null, 23, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_usda_check', 'Secondary Loan: USDA',
       'checkbox', null, false, null, 24, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_owner_financing_check', 'Secondary Loan: Owner Financing',
       'checkbox', null, false, null, 25, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_other_check', 'Secondary Loan: Other',
       'checkbox', null, false, null, 26, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_rate_fixed_check', 'Secondary Rate: Fixed',
       'checkbox', null, false, null, 27, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_rate_adjustable_check', 'Secondary Rate: Adjustable',
       'checkbox', null, false, null, 28, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_rate_interest_only_check', 'Secondary Rate: Interest Only',
       'checkbox', null, false, null, 29, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_rate_other_check', 'Secondary Rate: Other',
       'checkbox', null, false, null, 30, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_amortization_years', 'Secondary Loan Amortization (years)',
       'number', null, false, null, 31, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_ltv', 'Secondary LTV (%)',
       'number', null, false, null, 32, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'secondary_loan_rate_pct', 'Secondary Loan Rate (%)',
       'number', null, false, null, 33, 'Percentage; extract numeric value only')
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [residential-sale-contract] loan_details
  select id into v_section_id from form_template_sections
    where form_slug = 'residential-sale-contract' and section_key = 'loan_details';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_preapproved_check', 'Buyer is Pre-Approved',
       'checkbox', 'buyer', false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_not_preapproved_check', 'Buyer is NOT Pre-Approved',
       'checkbox', 'buyer', false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lender_name', 'Lender Name',
       'text', null, false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'not_preapproved_days', 'Pre-Approval Deadline (days)',
       'number', null, false, null, 3, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'loan_approval_days', 'Loan Approval Deadline (days)',
       'number', null, false, null, 4, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'loan_approval_alt_days', 'Alternative Loan Approval Deadline (days)',
       'number', null, false, null, 5, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lender_appraisal_amount', 'Lender Appraisal Amount ($)',
       'number', null, false, null, 6, 'Dollar amount; extract numeric value only, e.g. 250000')
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [residential-sale-contract] inspection
  select id into v_section_id from form_template_sections
    where form_slug = 'residential-sale-contract' and section_key = 'inspection';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'survey_days', 'Survey Deadline (days)',
       'number', null, false, null, 0, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'inspection_period_days', 'Inspection Period (days)',
       'number', null, false, null, 1, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'renegotiation_period_days', 'Renegotiation Period (days)',
       'number', null, false, null, 2, 'Number of days; extract integer only')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'additional_structures_1', 'Additional Structures / Improvements (1)',
       'text', null, false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'additional_structures_2', 'Additional Structures / Improvements (2)',
       'text', null, false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'additional_structures_3', 'Additional Structures / Improvements (3)',
       'text', null, false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'unacceptable_exclusions_1', 'Unacceptable Title Exceptions (1)',
       'text', null, false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'unacceptable_exclusions_2', 'Unacceptable Title Exceptions (2)',
       'text', null, false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'unacceptable_exclusions_3', 'Unacceptable Title Exceptions (3)',
       'text', null, false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [residential-sale-contract] brokerage
  select id into v_section_id from form_template_sections
    where form_slug = 'residential-sale-contract' and section_key = 'brokerage';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_agent_check', 'Seller''s Agent – Seller''s Side',
       'checkbox', 'seller', false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_agent_check_right', 'Seller''s Agent – Right Column',
       'text', 'seller', false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_agent_check_left', 'Buyer''s Agent – Left Column',
       'text', 'buyer', false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_agent_check_right', 'Buyer''s Agent – Right Column',
       'text', 'buyer', false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_designated_agent_check', 'Seller Designated Agent',
       'checkbox', 'seller', false, null, 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_designated_agent_check_right', 'Buyer Designated Agent',
       'text', 'buyer', false, null, 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_designated_check_left', 'Buyer Designated (left)',
       'text', 'buyer', false, null, 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_designated_check_right', 'Seller Designated (right)',
       'text', 'seller', false, null, 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_transaction_broker_check', 'Transaction Broker – Seller''s Side',
       'checkbox', 'seller', false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_transaction_broker_check_right', 'Transaction Broker – Buyer''s Side',
       'text', 'buyer', false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_disclosed_dual_check', 'Disclosed Dual Agent – Seller''s Side',
       'checkbox', 'seller', false, null, 10, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_disclosed_dual_check_right', 'Disclosed Dual Agent – Buyer''s Side',
       'text', 'buyer', false, null, 11, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'subagent_seller_check', 'Subagent – Seller''s Side',
       'checkbox', 'seller', false, null, 12, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'subagent_buyer_check_right', 'Subagent – Buyer''s Side',
       'text', 'buyer', false, null, 13, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'brokers_compensated_check', 'Both Brokers Compensated',
       'checkbox', 'broker', false, null, 14, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lic_seller_date', 'Seller Licensee Date',
       'date', 'seller', false, null, 15, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lic_buyer_date', 'Buyer Licensee Date',
       'date', 'buyer', false, null, 16, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lic_seller_sig', 'Seller Licensee Signature',
       'signature', 'seller', false, null, 17, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lic_buyer_sig', 'Buyer Licensee Signature',
       'signature', 'buyer', false, null, 18, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_brokerage_date_1', 'Buyer Brokerage Date 1',
       'date', 'buyer', false, null, 19, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_brokerage_date_1', 'Seller Brokerage Date 1',
       'date', 'seller', false, null, 20, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_brokerage_sig_1', 'Buyer Brokerage Signature 1',
       'signature', 'buyer', false, null, 21, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_brokerage_sig_1', 'Seller Brokerage Signature 1',
       'signature', 'seller', false, null, 22, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_brokerage_date_2', 'Buyer Brokerage Date 2',
       'date', 'buyer', false, null, 23, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_brokerage_date_2', 'Seller Brokerage Date 2',
       'date', 'seller', false, null, 24, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_brokerage_sig_2', 'Buyer Brokerage Signature 2',
       'signature', 'buyer', false, null, 25, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_brokerage_sig_2', 'Seller Brokerage Signature 2',
       'signature', 'seller', false, null, 26, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [residential-sale-contract] signatures
  select id into v_section_id from form_template_sections
    where form_slug = 'residential-sale-contract' and section_key = 'signatures';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_sig_1', 'Seller 1 Signature',
       'signature', 'seller', false, null, 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_sig_2', 'Seller 2 Signature',
       'signature', 'seller', false, null, 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_sig_1', 'Buyer 1 Signature',
       'signature', 'buyer', false, null, 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_sig_2', 'Buyer 2 Signature',
       'signature', 'buyer', false, null, 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_date_1', 'Seller 1 Signature Date',
       'date', 'seller', false, null, 4, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'seller_date_2', 'Seller 2 Signature Date',
       'date', 'seller', false, null, 5, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_date_1', 'Buyer 1 Signature Date',
       'date', 'buyer', false, null, 6, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'buyer_date_2', 'Buyer 2 Signature Date',
       'date', 'buyer', false, null, 7, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'brokerage_seller', 'Seller''s Brokerage Name',
       'text', 'seller', false, null, 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'brokerage_buyer', 'Buyer''s Brokerage Name',
       'text', 'buyer', false, null, 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'brokerage_seller_address', 'Seller''s Brokerage Address',
       'text', 'seller', false, null, 10, 'Full street address including city, state, zip')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'brokerage_buyer_address', 'Buyer''s Brokerage Address',
       'text', 'buyer', false, null, 11, 'Full street address including city, state, zip')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lic_seller_name_print', 'Seller Licensee Name (printed)',
       'text', 'seller', false, null, 12, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lic_buyer_name_print', 'Buyer Licensee Name (printed)',
       'text', 'buyer', false, null, 13, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lic_seller_contact', 'Seller Licensee Contact',
       'text', 'seller', false, null, 14, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'brokerage_seller_contact', 'Seller''s Brokerage Contact',
       'text', 'seller', false, null, 15, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lic_buyer_contact', 'Buyer Licensee Contact',
       'text', 'buyer', false, null, 16, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'brokerage_buyer_contact', 'Buyer''s Brokerage Contact',
       'text', 'buyer', false, null, 17, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lic_seller_email', 'Seller Licensee Email',
       'text', 'seller', false, null, 18, 'Email address')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'lic_buyer_email', 'Buyer Licensee Email',
       'text', 'buyer', false, null, 19, 'Email address')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'licensee_preparing_sig', 'Licensee Preparing Contract Signature',
       'signature', 'broker', false, null, 20, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'rejection_presentation_date', 'Rejection / Presentation Date',
       'date', null, false, null, 21, 'Date field; extract in MM/DD/YYYY format')
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('residential-sale-contract', v_section_id, 'rejection_licensee_sig', 'Rejection Licensee Signature',
       'signature', 'broker', false, null, 22, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [seller-disclosure] hazardous
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'hazardous';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'haz_a', 'Asbestos or asbestos-containing materials',
       'choice', null, false, ARRAY['yes','no','na'], 0, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'haz_b', 'Radon testing done',
       'choice', null, false, ARRAY['yes','no','na'], 1, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'haz_c', 'Lead-based paint or hazards',
       'choice', null, false, ARRAY['yes','no','na'], 2, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'haz_d', 'Underground storage tanks (other than propane)',
       'choice', null, false, ARRAY['yes','no','na'], 3, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'haz_e', 'Mold or mildew issues',
       'choice', null, false, ARRAY['yes','no','na'], 4, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'haz_f', 'Environmental contamination',
       'choice', null, false, ARRAY['yes','no','na'], 5, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'haz_g', 'Chinese drywall',
       'choice', null, false, ARRAY['yes','no','na'], 6, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'haz_h', 'Substances requiring government cleanup',
       'choice', null, false, ARRAY['yes','no','na'], 7, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'haz_i', 'Property used for commercial purposes',
       'choice', null, false, ARRAY['yes','no','na'], 8, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'haz_j', 'Carbon monoxide detectors present',
       'choice', null, false, ARRAY['yes','no','na'], 9, null)
    on conflict (form_slug, field_key) do nothing;
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'haz_k', 'Smoke detectors present',
       'choice', null, false, ARRAY['yes','no','na'], 10, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

  -- [seller-disclosure] inspections
  select id into v_section_id from form_template_sections
    where form_slug = 'seller-disclosure' and section_key = 'inspections';
  if v_section_id is not null then
    insert into form_template_fields
      (form_slug, section_id, field_key, label, field_type, party, required, choices, sort_order, extraction_hint)
    values
      ('seller-disclosure', v_section_id, 'inspect', 'Any inspections completed in last 2 years',
       'choice', null, false, ARRAY['yes','no','na'], 0, null)
    on conflict (form_slug, field_key) do nothing;
  end if;

end $$;

-- 6. Add FK column on field_coordinates → form_template_fields (nullable)
-- Allows gradual migration; existing coordinates still work
alter table field_coordinates
  add column if not exists template_field_id uuid
    references form_template_fields(id) on delete set null;

create index if not exists field_coordinates_template_field_id_idx
  on field_coordinates (template_field_id);

-- Backfill: link existing coordinates to template fields by field_key
update field_coordinates fc
  set template_field_id = ftf.id
  from form_template_fields ftf
  where fc.field_key = ftf.field_key
    and fc.template_field_id is null;

-- Summary
do $$ begin
  raise notice 'form_template_sections: % rows', (select count(*) from form_template_sections);
  raise notice 'form_template_fields: % rows', (select count(*) from form_template_fields);
  raise notice 'field_coordinates linked: %/%',
    (select count(*) from field_coordinates where template_field_id is not null),
    (select count(*) from field_coordinates);
end $$;