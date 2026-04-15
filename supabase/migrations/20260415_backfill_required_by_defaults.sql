-- Migration: backfill_required_by_defaults
-- Backfills all 30 existing checklist_template_items with required_by values
-- Based on Texas/TREC law, HAR MLS rules, and Realty of America brokerage standard

-- STATE: TREC-mandated disclosures and agreements
UPDATE checklist_template_items SET required_by = 'state' WHERE id IN (
  '2c9168b1-7251-4015-a73b-122cefcad3dc', -- Send seller disclosure to seller
  '35f61485-0de4-4e53-9dcc-633c9702fcac', -- Buyer representation agreement signed (buyer side)
  '33a10915-2656-433c-82c2-0bc349147643', -- Buyer representation agreement on file
  'c2698b27-7dd7-4f47-92a5-935398e7b8b7', -- Signed agency disclosure on file
  'eb93f674-7dc5-4e19-9d83-ed3da6432090', -- Listing agreement signed (seller side)
  '6716ef6c-7d0f-4226-be96-4958783d12ec'  -- Review seller disclosures
);

-- MLS: HAR / local MLS compliance
UPDATE checklist_template_items SET required_by = 'mls' WHERE id IN (
  '031618ca-0c9a-4f23-a0b3-531ed929f456', -- MLS data verified and entered
  '64ead582-74b7-4017-b2b7-9418baf11741'  -- Upload seller disclosure to MLS
);

-- BROKERAGE: Realty of America internal standard
UPDATE checklist_template_items SET required_by = 'brokerage' WHERE id IN (
  '3864521a-3177-409d-9cf7-b565a18e33e2', -- All offer documents uploaded to broker platform
  '4e9e6c48-ad42-49cc-95c3-07c1fb54df8b', -- Fill out buyer expense worksheet
  'b8c78227-f3a9-4e5f-bc6b-260fe977a10d', -- Schedule closing date with client and escrow
  '5e6f2ed0-c556-4356-87ca-9b3db7477483', -- Open escrow
  '29eb5e56-560b-4585-bf20-dfea5e394ced', -- Complete final walk-through sheet
  '244d7c75-3888-451a-b142-1e9eea6bf991', -- Confirm loan application submitted to lender
  '3cdafbc5-5591-45ec-a666-cf339a7102ca', -- Appraisal ordered
  '4cebbdd6-24f6-4746-8160-6a06b12227b3', -- Loan commitment / final approval received
  '79bb4e56-d2e4-4bee-afcd-c73f44e68aa9', -- Verify lender has all required documents
  'ce35d2eb-2aac-40db-8c41-71ff54ca562b', -- Appraisal received and reviewed
  '64888c48-8c8b-47e1-b478-5fa5011ad131', -- Request all utilities turned on for inspection
  '419d83d6-c8bd-4668-a1d7-6b6caba50aa8', -- Determine if inspection waiver is needed
  'c2bff4bb-c147-4e02-be01-101321c46d5e'  -- Confirm HOA status and collect all HOA info
);

-- OPTIONAL: Agent/TC preference items
UPDATE checklist_template_items SET required_by = 'optional' WHERE id IN (
  '699ef9f6-74ff-49a9-add5-9051358f213e', -- Client requested insurance quotes
  '93abc64b-1352-4412-991c-4324a3e1343c', -- Check for prior insurance claims
  'aa8d7b5c-e1a0-4e91-afbd-3572a454822f', -- Verify washer/dryer connections
  'c0c6b1cb-cae3-41ba-9b00-f05cc7e41b63', -- Check property taxes
  'de8af0df-8ec3-47b4-863f-4b37e2146a10', -- Check for structural issues
  'e3cbe977-d9e9-4ac8-a425-c2dd45325a02', -- Verify solar panel status
  'e66b0234-8dbb-4aed-9d41-4fe6d8a825eb', -- Check for special assessments
  'f458ddc7-0cfd-4e2c-9d65-62162c805a57', -- Check zoning
  '3d042a4f-6387-44e7-aa4b-964123e51ad9'  -- Home warranty confirmation on file
);
