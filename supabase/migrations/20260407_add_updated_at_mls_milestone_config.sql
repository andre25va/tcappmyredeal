-- Add updated_at to mls_milestone_config
ALTER TABLE mls_milestone_config 
ADD COLUMN updated_at timestamptz DEFAULT now();

-- Backfill existing rows
UPDATE mls_milestone_config SET updated_at = now() WHERE updated_at IS NULL;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_mls_milestone_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mls_milestone_config_updated_at
BEFORE UPDATE ON mls_milestone_config
FOR EACH ROW EXECUTE FUNCTION update_mls_milestone_config_updated_at();
