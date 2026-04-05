-- Fix: add anon SELECT policies to milestone_types and mls_milestone_config
-- MlsTemplatesTab creates its own Supabase client; on first mount the auth
-- session loads async, so the initial query runs as anon. Without anon SELECT
-- policies, RLS silently returned 0 rows and the Milestone section showed
-- "No milestone types defined."

CREATE POLICY "anon_select_milestone_types"
  ON milestone_types FOR SELECT TO anon USING (true);

CREATE POLICY "anon_select_mls_milestone_config"
  ON mls_milestone_config FOR SELECT TO anon USING (true);
