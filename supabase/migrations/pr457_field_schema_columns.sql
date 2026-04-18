-- PR #457: Add Field Schema Columns to field_coordinates
-- Adds: contract_line_num, label, section, valid_options, group_key
-- These columns turn field_coordinates into a full Form Field Schema:
--   - contract_line_num: the printed line number from the contract's left margin
--   - label: human-readable display name for the TC
--   - section: grouping header (e.g. "Financing Type", "Earnest Money")
--   - valid_options: JSONB array of allowed values (["true","false"] for checkboxes)
--   - group_key: marks mutually exclusive checkbox groups (e.g. "primary_loan_type")
--
-- contract_line_num is auto-populated by matching y-coordinates to pdf_ocr_lines,
-- which stores the full OCR of each form with the printed line number embedded
-- at the start of each text line (e.g. "296 Cash Sale ☐").

-- Step 1: Add columns
ALTER TABLE field_coordinates 
  ADD COLUMN IF NOT EXISTS contract_line_num INTEGER,
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS valid_options JSONB,
  ADD COLUMN IF NOT EXISTS group_key TEXT;

-- Step 2: Auto-populate contract_line_num by y-coordinate proximity to pdf_ocr_lines
UPDATE field_coordinates fc
SET contract_line_num = (
  SELECT (regexp_match(ocr.text, '^(\d+)\s'))[1]::INTEGER
  FROM pdf_ocr_lines ocr
  WHERE ocr.form_slug = fc.form_slug
    AND ocr.page_num = fc.page_num
    AND (regexp_match(ocr.text, '^(\d+)\s')) IS NOT NULL
  ORDER BY ABS(ocr.y::numeric - fc.y::numeric)
  LIMIT 1
);

-- Step 3: Seed valid_options for all checkbox fields across all forms
UPDATE field_coordinates 
SET valid_options = '["true","false"]'::jsonb
WHERE field_type = 'checkbox';

-- Step 4: Seed sections for residential-sale-contract
UPDATE field_coordinates SET section = 'Parties'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('seller_name_1','seller_name_2','buyer_name_1','buyer_name_2','bank_owned_check','manufactured_home_check');

UPDATE field_coordinates SET section = 'Property'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('property_address','county','legal_desc_1','legal_desc_2','legal_desc_3');

UPDATE field_coordinates SET section = 'Inclusions & Exclusions'
WHERE form_slug = 'residential-sale-contract'
AND (field_key LIKE 'additional_inclusions%' OR field_key LIKE 'exclusions_%' OR field_key LIKE 'additional_terms%');

UPDATE field_coordinates SET section = 'Home Warranty'
WHERE form_slug = 'residential-sale-contract'
AND field_key LIKE 'warranty%';

UPDATE field_coordinates SET section = 'Addenda'
WHERE form_slug = 'residential-sale-contract'
AND (field_key LIKE 'addendum%' OR field_key IN ('other 1','other 2','other 3','other 0','other 01'));

UPDATE field_coordinates SET section = 'Price & Costs'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('purchase_price','buyer_broker_compensation','seller_additional_costs',
                  'costs_not_payable_buyer','total_seller_expenses','total_amount_financed','balance_purchase_price');

UPDATE field_coordinates SET section = 'Earnest Money'
WHERE form_slug = 'residential-sale-contract'
AND (field_key LIKE 'earnest%' OR field_key LIKE 'add_earnest%');

UPDATE field_coordinates SET section = 'Closing & Possession'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('closing_date','possession_time','possession_location','possession_am_pm',
                  'offer_expiration_date','offer_expiration_hour','offer_expiration_time');

UPDATE field_coordinates SET section = 'Appraisal'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('cash_appraisal_days','appraisal_notify_days','appraisal_negotiation_days','lender_appraisal_amount');

UPDATE field_coordinates SET section = 'Sale Contingency'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('sale_not_contingent_check','sale_contingent_check');

UPDATE field_coordinates SET section = 'Financing Type'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('cash_sale_check','cash_sale_verify_days','financed_sale_check','loan_change_days_before_closing');

UPDATE field_coordinates SET section = 'Loan Type'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('primary_conventional_check','primary_fha_check','primary_va_check',
                  'primary_usda_check','primary_other_check','primary_other_text','primary_owner_financing_check',
                  'secondary_conventional_check','secondary_fha_check','secondary_va_check',
                  'secondary_usda_check','secondary_other_check','secondary_owner_financing_check');

UPDATE field_coordinates SET section = 'Interest Rate Type'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('primary_rate_fixed_check','primary_rate_adjustable_check','primary_rate_interest_only_check',
                  'primary_rate_other_check','primary_rate_other_text',
                  'secondary_rate_fixed_check','secondary_rate_adjustable_check',
                  'secondary_rate_interest_only_check','secondary_rate_other_check');

UPDATE field_coordinates SET section = 'Loan Terms'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('primary_amortization_years','secondary_amortization_years',
                  'primary_ltv','secondary_ltv','primary_loan_rate_pct','secondary_loan_rate_pct');

UPDATE field_coordinates SET section = 'Loan Approval'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('buyer_preapproved_check','lender_name','not_preapproved_days',
                  'buyer_not_preapproved_check','loan_approval_days','loan_approval_alt_days');

UPDATE field_coordinates SET section = 'Inspection & Survey'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('survey_days','inspection_period_days','renegotiation_period_days');

UPDATE field_coordinates SET section = 'Agency'
WHERE form_slug = 'residential-sale-contract'
AND (field_key LIKE 'p3_%' OR field_key LIKE '%agent%' OR field_key LIKE '%transaction%'
     OR field_key LIKE '%dual%' OR field_key = 'brokers_compensated_check');

-- Step 5: Seed labels for residential-sale-contract
UPDATE field_coordinates SET label = 'Seller Name' WHERE form_slug = 'residential-sale-contract' AND field_key = 'seller_name_1';
UPDATE field_coordinates SET label = 'Seller Name (2nd)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'seller_name_2';
UPDATE field_coordinates SET label = 'Buyer Name' WHERE form_slug = 'residential-sale-contract' AND field_key = 'buyer_name_1';
UPDATE field_coordinates SET label = 'Buyer Name (2nd)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'buyer_name_2';
UPDATE field_coordinates SET label = 'Bank-Owned Property' WHERE form_slug = 'residential-sale-contract' AND field_key = 'bank_owned_check';
UPDATE field_coordinates SET label = 'Manufactured/Mobile Home' WHERE form_slug = 'residential-sale-contract' AND field_key = 'manufactured_home_check';
UPDATE field_coordinates SET label = 'Property Address' WHERE form_slug = 'residential-sale-contract' AND field_key = 'property_address';
UPDATE field_coordinates SET label = 'County' WHERE form_slug = 'residential-sale-contract' AND field_key = 'county';
UPDATE field_coordinates SET label = 'Legal Description (1)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'legal_desc_1';
UPDATE field_coordinates SET label = 'Legal Description (2)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'legal_desc_2';
UPDATE field_coordinates SET label = 'Legal Description (3)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'legal_desc_3';
UPDATE field_coordinates SET label = 'Purchase Price' WHERE form_slug = 'residential-sale-contract' AND field_key = 'purchase_price';
UPDATE field_coordinates SET label = 'Earnest Money Amount' WHERE form_slug = 'residential-sale-contract' AND field_key = 'earnest_money_amount';
UPDATE field_coordinates SET label = 'Earnest Delivery (days)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'earnest_delivery_days';
UPDATE field_coordinates SET label = 'Earnest Form: EFT/Wire' WHERE form_slug = 'residential-sale-contract' AND field_key = 'earnest_form_check_eft';
UPDATE field_coordinates SET label = 'Earnest Form: Other (text)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'earnest_form_other';
UPDATE field_coordinates SET label = 'Earnest Deposited With' WHERE form_slug = 'residential-sale-contract' AND field_key = 'earnest_deposited_with';
UPDATE field_coordinates SET label = 'Earnest: Refundable' WHERE form_slug = 'residential-sale-contract' AND field_key = 'earnest_refundable_check';
UPDATE field_coordinates SET label = 'Earnest: Non-Refundable' WHERE form_slug = 'residential-sale-contract' AND field_key = 'earnest_nonrefundable_check';
UPDATE field_coordinates SET label = 'Additional Earnest Amount' WHERE form_slug = 'residential-sale-contract' AND field_key = 'add_earnest_amount';
UPDATE field_coordinates SET label = 'Additional Earnest Date' WHERE form_slug = 'residential-sale-contract' AND field_key = 'add_earnest_date';
UPDATE field_coordinates SET label = 'Additional Earnest: Refundable' WHERE form_slug = 'residential-sale-contract' AND field_key = 'add_earnest_refundable_check';
UPDATE field_coordinates SET label = 'Additional Earnest: Non-Refundable' WHERE form_slug = 'residential-sale-contract' AND field_key = 'add_earnest_nonrefundable_check';
UPDATE field_coordinates SET label = 'Total Amount Financed' WHERE form_slug = 'residential-sale-contract' AND field_key = 'total_amount_financed';
UPDATE field_coordinates SET label = 'Balance of Purchase Price' WHERE form_slug = 'residential-sale-contract' AND field_key = 'balance_purchase_price';
UPDATE field_coordinates SET label = 'Buyer Broker Compensation' WHERE form_slug = 'residential-sale-contract' AND field_key = 'buyer_broker_compensation';
UPDATE field_coordinates SET label = 'Seller Additional Costs' WHERE form_slug = 'residential-sale-contract' AND field_key = 'seller_additional_costs';
UPDATE field_coordinates SET label = 'Total Seller Expenses' WHERE form_slug = 'residential-sale-contract' AND field_key = 'total_seller_expenses';
UPDATE field_coordinates SET label = 'Closing Date' WHERE form_slug = 'residential-sale-contract' AND field_key = 'closing_date';
UPDATE field_coordinates SET label = 'Possession Time' WHERE form_slug = 'residential-sale-contract' AND field_key = 'possession_time';
UPDATE field_coordinates SET label = 'Possession Location' WHERE form_slug = 'residential-sale-contract' AND field_key = 'possession_location';
UPDATE field_coordinates SET label = 'Offer Expiration Date' WHERE form_slug = 'residential-sale-contract' AND field_key = 'offer_expiration_date';
UPDATE field_coordinates SET label = 'Cash Appraisal Contingency (days)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'cash_appraisal_days';
UPDATE field_coordinates SET label = 'Appraisal Notify Buyer (days)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'appraisal_notify_days';
UPDATE field_coordinates SET label = 'Appraisal Negotiation (days)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'appraisal_negotiation_days';
UPDATE field_coordinates SET label = 'Lender Appraisal Amount' WHERE form_slug = 'residential-sale-contract' AND field_key = 'lender_appraisal_amount';
UPDATE field_coordinates SET label = 'Sale Not Contingent on Another Sale' WHERE form_slug = 'residential-sale-contract' AND field_key = 'sale_not_contingent_check';
UPDATE field_coordinates SET label = 'Sale Contingent on Another Sale' WHERE form_slug = 'residential-sale-contract' AND field_key = 'sale_contingent_check';
UPDATE field_coordinates SET label = 'Cash Sale' WHERE form_slug = 'residential-sale-contract' AND field_key = 'cash_sale_check';
UPDATE field_coordinates SET label = 'Cash Sale Proof Deadline (days)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'cash_sale_verify_days';
UPDATE field_coordinates SET label = 'Financed Sale' WHERE form_slug = 'residential-sale-contract' AND field_key = 'financed_sale_check';
UPDATE field_coordinates SET label = 'Notify Seller of Loan Change (days before closing)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'loan_change_days_before_closing';
UPDATE field_coordinates SET label = 'Loan Type: Conventional' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_conventional_check';
UPDATE field_coordinates SET label = 'Loan Type: FHA' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_fha_check';
UPDATE field_coordinates SET label = 'Loan Type: VA' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_va_check';
UPDATE field_coordinates SET label = 'Loan Type: USDA' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_usda_check';
UPDATE field_coordinates SET label = 'Loan Type: Other' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_other_check';
UPDATE field_coordinates SET label = 'Loan Type: Other (text)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_other_text';
UPDATE field_coordinates SET label = 'Loan Type: Owner Financing' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_owner_financing_check';
UPDATE field_coordinates SET label = '2nd Loan Type: Conventional' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_conventional_check';
UPDATE field_coordinates SET label = '2nd Loan Type: FHA' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_fha_check';
UPDATE field_coordinates SET label = '2nd Loan Type: VA' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_va_check';
UPDATE field_coordinates SET label = '2nd Loan Type: USDA' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_usda_check';
UPDATE field_coordinates SET label = '2nd Loan Type: Other' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_other_check';
UPDATE field_coordinates SET label = '2nd Loan Type: Owner Financing' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_owner_financing_check';
UPDATE field_coordinates SET label = 'Interest Rate: Fixed' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_rate_fixed_check';
UPDATE field_coordinates SET label = 'Interest Rate: Adjustable' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_rate_adjustable_check';
UPDATE field_coordinates SET label = 'Interest Rate: Interest Only' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_rate_interest_only_check';
UPDATE field_coordinates SET label = 'Interest Rate: Other' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_rate_other_check';
UPDATE field_coordinates SET label = '2nd Interest Rate: Fixed' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_rate_fixed_check';
UPDATE field_coordinates SET label = '2nd Interest Rate: Adjustable' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_rate_adjustable_check';
UPDATE field_coordinates SET label = '2nd Interest Rate: Interest Only' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_rate_interest_only_check';
UPDATE field_coordinates SET label = '2nd Interest Rate: Other' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_rate_other_check';
UPDATE field_coordinates SET label = 'Amortization Period (years)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_amortization_years';
UPDATE field_coordinates SET label = '2nd Loan Amortization (years)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_amortization_years';
UPDATE field_coordinates SET label = 'LTV %' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_ltv';
UPDATE field_coordinates SET label = '2nd Loan LTV %' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_ltv';
UPDATE field_coordinates SET label = 'Loan Interest Rate %' WHERE form_slug = 'residential-sale-contract' AND field_key = 'primary_loan_rate_pct';
UPDATE field_coordinates SET label = '2nd Loan Interest Rate %' WHERE form_slug = 'residential-sale-contract' AND field_key = 'secondary_loan_rate_pct';
UPDATE field_coordinates SET label = 'Buyer Pre-Approved' WHERE form_slug = 'residential-sale-contract' AND field_key = 'buyer_preapproved_check';
UPDATE field_coordinates SET label = 'Lender Name' WHERE form_slug = 'residential-sale-contract' AND field_key = 'lender_name';
UPDATE field_coordinates SET label = 'Loan Approval Deadline (days)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'loan_approval_days';
UPDATE field_coordinates SET label = 'Loan Approval Alt Deadline (days)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'loan_approval_alt_days';
UPDATE field_coordinates SET label = 'Inspection Period (days)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'inspection_period_days';
UPDATE field_coordinates SET label = 'Survey (days)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'survey_days';
UPDATE field_coordinates SET label = 'Renegotiation Period (days)' WHERE form_slug = 'residential-sale-contract' AND field_key = 'renegotiation_period_days';

-- Step 6: Seed group_key for mutually exclusive checkbox groups
UPDATE field_coordinates SET group_key = 'sale_contingency'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('sale_not_contingent_check','sale_contingent_check');

UPDATE field_coordinates SET group_key = 'sale_type'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('cash_sale_check','financed_sale_check');

UPDATE field_coordinates SET group_key = 'earnest_refundability'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('earnest_refundable_check','earnest_nonrefundable_check');

UPDATE field_coordinates SET group_key = 'add_earnest_refundability'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('add_earnest_refundable_check','add_earnest_nonrefundable_check');

UPDATE field_coordinates SET group_key = 'primary_loan_type'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('primary_conventional_check','primary_fha_check','primary_va_check',
                  'primary_usda_check','primary_other_check','primary_owner_financing_check');

UPDATE field_coordinates SET group_key = 'secondary_loan_type'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('secondary_conventional_check','secondary_fha_check','secondary_va_check',
                  'secondary_usda_check','secondary_other_check','secondary_owner_financing_check');

UPDATE field_coordinates SET group_key = 'primary_rate_type'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('primary_rate_fixed_check','primary_rate_adjustable_check',
                  'primary_rate_interest_only_check','primary_rate_other_check');

UPDATE field_coordinates SET group_key = 'secondary_rate_type'
WHERE form_slug = 'residential-sale-contract'
AND field_key IN ('secondary_rate_fixed_check','secondary_rate_adjustable_check',
                  'secondary_rate_interest_only_check','secondary_rate_other_check');
