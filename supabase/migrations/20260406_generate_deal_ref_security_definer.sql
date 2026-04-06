-- Fix: make generate_deal_ref SECURITY DEFINER so trigger context can
-- upsert into deal_ref_sequences without being blocked by RLS.
CREATE OR REPLACE FUNCTION generate_deal_ref(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_seq  INTEGER;
BEGIN
  SELECT org_code INTO v_code FROM organizations WHERE id = p_org_id;
  IF v_code IS NULL THEN v_code := 'GEN'; END IF;

  INSERT INTO deal_ref_sequences (org_id, last_seq)
  VALUES (p_org_id, 1)
  ON CONFLICT (org_id) DO UPDATE
    SET last_seq = deal_ref_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN v_code || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;
