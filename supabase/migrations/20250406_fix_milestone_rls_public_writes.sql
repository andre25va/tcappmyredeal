-- Fix: Add public write policies on milestone_types and mls_milestone_config
-- Root cause: app uses anon Supabase client (custom tc_session token never passed to Supabase)
-- All other tables use public role for writes; these two tables were missing those policies.

-- milestone_types
CREATE POLICY "public_insert_milestone_types"
  ON milestone_types FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "public_update_milestone_types"
  ON milestone_types FOR UPDATE TO public
  USING (true) WITH CHECK (true);

CREATE POLICY "public_delete_milestone_types"
  ON milestone_types FOR DELETE TO public
  USING (true);

-- mls_milestone_config
CREATE POLICY "public_insert_mls_milestone_config"
  ON mls_milestone_config FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "public_update_mls_milestone_config"
  ON mls_milestone_config FOR UPDATE TO public
  USING (true) WITH CHECK (true);

CREATE POLICY "public_delete_mls_milestone_config"
  ON mls_milestone_config FOR DELETE TO public
  USING (true);
