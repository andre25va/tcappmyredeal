-- PR #464: Fix Home Warranty field_coordinates labels, group_keys, valid_options
UPDATE field_coordinates SET label = 'Buyer Waives Home Warranty', valid_options = '["Waived", "Not waived"]'::jsonb WHERE form_slug = 'residential-sale-contract' AND field_key = 'warranty_waive_check';
UPDATE field_coordinates SET label = 'Home Warranty - SELLER Pays', group_key = 'warranty_paid_by', valid_options = '["SELLER", "BUYER"]'::jsonb WHERE form_slug = 'residential-sale-contract' AND field_key = 'warranty_seller_check';
UPDATE field_coordinates SET label = 'Home Warranty - BUYER Pays', group_key = 'warranty_paid_by', valid_options = '["SELLER", "BUYER"]'::jsonb WHERE form_slug = 'residential-sale-contract' AND field_key = 'warranty_buyer_check';
UPDATE field_coordinates SET label = 'Home Warranty Cost' WHERE form_slug = 'residential-sale-contract' AND field_key = 'warranty_cost';
UPDATE field_coordinates SET label = 'Warranty Company / Vendor', section = 'Home Warranty' WHERE form_slug = 'residential-sale-contract' AND field_key = 'warranty_vendor';
UPDATE field_coordinates SET label = 'Per Claim Deductible' WHERE form_slug = 'residential-sale-contract' AND field_key = 'warranty_deductible';
UPDATE field_coordinates SET label = 'Warranty Arranger - Licensee assisting SELLER', group_key = 'warranty_arranger', valid_options = '["Licensee assisting SELLER", "Licensee assisting BUYER"]'::jsonb WHERE form_slug = 'residential-sale-contract' AND field_key = 'warranty_lic_seller_check';
UPDATE field_coordinates SET label = 'Warranty Arranger - Licensee assisting BUYER', group_key = 'warranty_arranger', valid_options = '["Licensee assisting SELLER", "Licensee assisting BUYER"]'::jsonb WHERE form_slug = 'residential-sale-contract' AND field_key = 'warranty_lic_buyer_check';
UPDATE field_coordinates SET label = 'Limited Home Warranty (at cost)', section = 'Home Warranty' WHERE form_slug = 'residential-sale-contract' AND field_key = 'limited_home_warranty';
