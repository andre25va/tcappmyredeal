-- Function to auto-generate deal-scoped DOC-001, DOC-002, etc.
CREATE OR REPLACE FUNCTION generate_doc_id()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  -- Count existing documents for this deal (including the one being inserted)
  SELECT COUNT(*) INTO next_num
  FROM deal_documents
  WHERE deal_id = NEW.deal_id;

  -- Assign DOC-XXX (zero-padded to 3 digits)
  NEW.doc_id := 'DOC-' || LPAD(next_num::TEXT, 3, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger fires BEFORE insert so doc_id is set before the row lands
DROP TRIGGER IF EXISTS set_doc_id ON deal_documents;
CREATE TRIGGER set_doc_id
  BEFORE INSERT ON deal_documents
  FOR EACH ROW
  WHEN (NEW.doc_id IS NULL)
  EXECUTE FUNCTION generate_doc_id();
