-- PR #463: Mark L27 legal_desc_1 as required for residential-sale-contract
UPDATE field_coordinates
SET required = true
WHERE form_slug = 'residential-sale-contract'
  AND contract_line_num = 27;
-- Affected field: legal_desc_1 (Legal Description (1)) — Section: Property
