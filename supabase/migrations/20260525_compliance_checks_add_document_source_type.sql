-- PR #537: compliance_checks — add document_id, source, check_type; make deal_id nullable
-- Supports two compliance modes:
--   myredeal: linked to a deal + document, results written back to DB
--   standalone: tc-redeal-forms direct upload, no deal_id, no write-back

-- 1. Make deal_id nullable so standalone checks (no deal) can be saved
ALTER TABLE compliance_checks ALTER COLUMN deal_id DROP NOT NULL;

-- 2. Add document_id — which specific document was checked
ALTER TABLE compliance_checks 
  ADD COLUMN IF NOT EXISTS document_id uuid 
  REFERENCES deal_documents(id) ON DELETE SET NULL;

-- 3. Add check_type — field-based vs vision-based
ALTER TABLE compliance_checks 
  ADD COLUMN IF NOT EXISTS check_type text 
  CHECK (check_type IN ('field', 'vision'));

-- 4. Add source — myredeal app vs standalone tc-redeal-forms
ALTER TABLE compliance_checks 
  ADD COLUMN IF NOT EXISTS source text 
  CHECK (source IN ('myredeal', 'standalone'));

-- 5. Index for fast document lookup
CREATE INDEX IF NOT EXISTS idx_compliance_checks_document_id 
  ON compliance_checks(document_id);

-- 6. Index for source filtering
CREATE INDEX IF NOT EXISTS idx_compliance_checks_source 
  ON compliance_checks(source);
