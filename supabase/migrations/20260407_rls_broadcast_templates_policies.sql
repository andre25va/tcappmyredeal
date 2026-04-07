-- RLS policies for broadcast_templates
-- Authenticated users (staff/admin) can manage templates.
-- All authenticated + anon users can SELECT (needed for app reads).

-- SELECT: authenticated
CREATE POLICY "broadcast_templates_authenticated_read"
  ON broadcast_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- SELECT: anon (app uses anon key for reads)
CREATE POLICY "broadcast_templates_anon_read"
  ON broadcast_templates
  FOR SELECT
  TO anon
  USING (true);

-- INSERT: staff/admin only
CREATE POLICY "broadcast_templates_staff_admin_insert"
  ON broadcast_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );

-- UPDATE: staff/admin only
CREATE POLICY "broadcast_templates_staff_admin_update"
  ON broadcast_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );

-- DELETE: staff/admin only
CREATE POLICY "broadcast_templates_staff_admin_delete"
  ON broadcast_templates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('staff', 'admin')
    )
  );
