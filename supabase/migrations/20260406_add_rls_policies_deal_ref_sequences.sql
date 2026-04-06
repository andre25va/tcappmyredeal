-- Fix: deal_ref_sequences had RLS enabled but no policies, blocking all inserts

-- SELECT: users can read their org's sequence
CREATE POLICY "deal_ref_sequences_select"
ON public.deal_ref_sequences
FOR SELECT
USING (org_id IN (SELECT get_accessible_org_ids(auth.uid())));

-- INSERT: users can create a sequence row for their org
CREATE POLICY "deal_ref_sequences_insert"
ON public.deal_ref_sequences
FOR INSERT
WITH CHECK (org_id IN (SELECT get_accessible_org_ids(auth.uid())));

-- UPDATE: users can bump the sequence for their org
CREATE POLICY "deal_ref_sequences_update"
ON public.deal_ref_sequences
FOR UPDATE
USING (org_id IN (SELECT get_accessible_org_ids(auth.uid())));
