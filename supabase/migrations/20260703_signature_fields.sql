-- ─────────────────────────────────────────────────────────────────────────────
-- 20260703_signature_fields.sql
-- Phase 4b: Register all signature & initials fields in form_template_fields
-- Parties: buyer_1, buyer_2, seller_1, seller_2,
--          buyers_agent, listing_agent, buyers_broker, listing_broker, preparer
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add signatures section to KCRAR form (if missing)
INSERT INTO form_template_sections (id, form_slug, section_key, title, sort_order)
SELECT
  gen_random_uuid(),
  'contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable',
  'signatures',
  'Signatures',
  (SELECT COALESCE(MAX(sort_order), 0) + 1
   FROM form_template_sections
   WHERE form_slug = 'contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable')
WHERE NOT EXISTS (
  SELECT 1 FROM form_template_sections
  WHERE form_slug = 'contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable'
    AND section_key = 'signatures'
);

-- 2. Add signatures section to seller-disclosure form (if missing)
INSERT INTO form_template_sections (id, form_slug, section_key, title, sort_order)
SELECT
  gen_random_uuid(),
  'seller-disclosure',
  'signatures',
  'Signatures',
  (SELECT COALESCE(MAX(sort_order), 0) + 1
   FROM form_template_sections
   WHERE form_slug = 'seller-disclosure')
WHERE NOT EXISTS (
  SELECT 1 FROM form_template_sections
  WHERE form_slug = 'seller-disclosure'
    AND section_key = 'signatures'
);

-- 3. Insert all signature/initials fields into form_template_fields
WITH sig_sections AS (
  SELECT id, form_slug FROM form_template_sections WHERE section_key = 'signatures'
),
new_fields (form_slug, field_key, label, field_type, party, required, sort_order) AS (
  VALUES
  -- ── residential-sale-contract ──────────────────────────────────────────────
  ('residential-sale-contract', 'buyer_initial_1',        'Buyer 1 Initials',                   'initials',  'buyer_1',       true,  1),
  ('residential-sale-contract', 'buyer_initial_2',        'Buyer 2 Initials',                   'initials',  'buyer_2',       false, 2),
  ('residential-sale-contract', 'seller_initial_1',       'Seller 1 Initials',                  'initials',  'seller_1',      true,  3),
  ('residential-sale-contract', 'seller_initial_2',       'Seller 2 Initials',                  'initials',  'seller_2',      false, 4),
  ('residential-sale-contract', 'buyer_sig_1',            'Buyer 1 Signature',                  'signature', 'buyer_1',       true,  5),
  ('residential-sale-contract', 'buyer_sig_2',            'Buyer 2 Signature',                  'signature', 'buyer_2',       false, 6),
  ('residential-sale-contract', 'seller_sig_1',           'Seller 1 Signature',                 'signature', 'seller_1',      true,  7),
  ('residential-sale-contract', 'seller_sig_2',           'Seller 2 Signature',                 'signature', 'seller_2',      false, 8),
  ('residential-sale-contract', 'lic_buyer_sig',          'Buyer Agent Signature',               'signature', 'buyers_agent',  true,  9),
  ('residential-sale-contract', 'lic_seller_sig',         'Listing Agent Signature',             'signature', 'listing_agent', true,  10),
  ('residential-sale-contract', 'buyer_brokerage_sig_1',  'Buyer Brokerage Signature',           'signature', 'buyers_broker', true,  11),
  ('residential-sale-contract', 'buyer_brokerage_sig_2',  'Buyer Brokerage Signature (2nd)',     'signature', 'buyers_broker', false, 12),
  ('residential-sale-contract', 'seller_brokerage_sig_1', 'Seller Brokerage Signature',          'signature', 'listing_broker',true,  13),
  ('residential-sale-contract', 'seller_brokerage_sig_2', 'Seller Brokerage Signature (2nd)',    'signature', 'listing_broker',false, 14),
  ('residential-sale-contract', 'licensee_preparing_sig', 'Licensee Preparing Signature',        'signature', 'preparer',      false, 15),
  ('residential-sale-contract', 'rejection_licensee_sig', 'Rejection Licensee Signature',        'signature', 'preparer',      false, 16),

  -- ── KCRAR contract ─────────────────────────────────────────────────────────
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'buyer_1_initials_p1',  'Buyer 1 Initials (Page 1)', 'initials',  'buyer_1',  true,  1),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'buyer_1_initials_p2',  'Buyer 1 Initials (Page 2)', 'initials',  'buyer_1',  true,  2),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'buyer_1_initials_p3',  'Buyer 1 Initials (Page 3)', 'initials',  'buyer_1',  true,  3),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'buyer_1_initials_p4',  'Buyer 1 Initials (Page 4)', 'initials',  'buyer_1',  true,  4),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'buyer_1_initials_p5',  'Buyer 1 Initials (Page 5)', 'initials',  'buyer_1',  true,  5),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'buyer_1_initials_p6',  'Buyer 1 Initials (Page 6)', 'initials',  'buyer_1',  true,  6),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'seller_1_initials_p1', 'Seller 1 Initials (Page 1)','initials',  'seller_1', true,  7),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'seller_1_initials_p2', 'Seller 1 Initials (Page 2)','initials',  'seller_1', true,  8),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'seller_1_initials_p3', 'Seller 1 Initials (Page 3)','initials',  'seller_1', true,  9),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'seller_1_initials_p4', 'Seller 1 Initials (Page 4)','initials',  'seller_1', true,  10),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'seller_1_initials_p5', 'Seller 1 Initials (Page 5)','initials',  'seller_1', true,  11),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'seller_1_initials_p6', 'Seller 1 Initials (Page 6)','initials',  'seller_1', true,  12),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'buyer_signature_1',    'Buyer 1 Signature',         'signature', 'buyer_1',  true,  13),
  ('contract-for-purchase-and-sale-of-real-estate-residential-1200-rel-12-2024-fillable', 'seller_signature_1',   'Seller 1 Signature',         'signature', 'seller_1', true,  14),

  -- ── seller-disclosure ──────────────────────────────────────────────────────
  ('seller-disclosure', 'initials_s1_p1', 'Seller 1 Initials (Page 1)', 'initials',  'seller_1', true,  1),
  ('seller-disclosure', 'initials_s1_p2', 'Seller 1 Initials (Page 2)', 'initials',  'seller_1', true,  2),
  ('seller-disclosure', 'initials_s1_p3', 'Seller 1 Initials (Page 3)', 'initials',  'seller_1', true,  3),
  ('seller-disclosure', 'initials_s1_p4', 'Seller 1 Initials (Page 4)', 'initials',  'seller_1', true,  4),
  ('seller-disclosure', 'initials_s1_p5', 'Seller 1 Initials (Page 5)', 'initials',  'seller_1', true,  5),
  ('seller-disclosure', 'initials_s1_p6', 'Seller 1 Initials (Page 6)', 'initials',  'seller_1', true,  6),
  ('seller-disclosure', 'initials_s1_p7', 'Seller 1 Initials (Page 7)', 'initials',  'seller_1', true,  7),
  ('seller-disclosure', 'initials_s2_p1', 'Seller 2 Initials (Page 1)', 'initials',  'seller_2', false, 8),
  ('seller-disclosure', 'initials_s2_p2', 'Seller 2 Initials (Page 2)', 'initials',  'seller_2', false, 9),
  ('seller-disclosure', 'initials_s2_p3', 'Seller 2 Initials (Page 3)', 'initials',  'seller_2', false, 10),
  ('seller-disclosure', 'initials_s2_p4', 'Seller 2 Initials (Page 4)', 'initials',  'seller_2', false, 11),
  ('seller-disclosure', 'initials_s2_p5', 'Seller 2 Initials (Page 5)', 'initials',  'seller_2', false, 12),
  ('seller-disclosure', 'initials_s2_p6', 'Seller 2 Initials (Page 6)', 'initials',  'seller_2', false, 13),
  ('seller-disclosure', 'initials_s2_p7', 'Seller 2 Initials (Page 7)', 'initials',  'seller_2', false, 14),
  ('seller-disclosure', 'seller1Signature', 'Seller 1 Signature',       'signature', 'seller_1', true,  15),
  ('seller-disclosure', 'seller2Signature', 'Seller 2 Signature',       'signature', 'seller_2', false, 16)
)
INSERT INTO form_template_fields (id, section_id, field_key, label, field_type, party, required, sort_order)
SELECT
  gen_random_uuid(),
  s.id,
  nf.field_key,
  nf.label,
  nf.field_type::text,
  nf.party,
  nf.required,
  nf.sort_order
FROM new_fields nf
JOIN sig_sections s ON s.form_slug = nf.form_slug
WHERE NOT EXISTS (
  SELECT 1 FROM form_template_fields ftf
  WHERE ftf.section_id = s.id AND ftf.field_key = nf.field_key
);

-- 4. Backfill form_field_id on field_coordinates for all signature/initials fields
UPDATE field_coordinates fc
SET form_field_id = ftf.id
FROM form_template_fields ftf
JOIN form_template_sections fts ON fts.id = ftf.section_id
WHERE fc.form_slug = fts.form_slug
  AND fc.field_key = ftf.field_key
  AND fc.form_field_id IS NULL
  AND ftf.field_type IN ('signature', 'initials');

-- 5. Verify
DO $$
DECLARE
  sig_field_count  integer;
  linked_sig_count integer;
  total_sig_coords integer;
BEGIN
  SELECT COUNT(*) INTO sig_field_count
    FROM form_template_fields
   WHERE field_type IN ('signature', 'initials');

  SELECT COUNT(*) INTO total_sig_coords
    FROM field_coordinates
   WHERE field_key ILIKE ANY(ARRAY['%sign%','%initial%','%_sig','%_sig_%','%initials%']);

  SELECT COUNT(*) INTO linked_sig_count
    FROM field_coordinates fc
    JOIN form_template_fields ftf ON ftf.id = fc.form_field_id
   WHERE ftf.field_type IN ('signature', 'initials');

  RAISE NOTICE 'Signature/initials fields in form_template_fields: %', sig_field_count;
  RAISE NOTICE 'Signature/initials rows in field_coordinates: %',      total_sig_coords;
  RAISE NOTICE 'field_coordinates rows now linked to sig fields: %',   linked_sig_count;
END $$;
