-- AI Agent Events Table
-- The shared nervous system between all agents (Tasklet, OpenAI, n8n)

CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  deal_id       UUID REFERENCES deals(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  source        TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('agent', 'user', 'system', 'n8n', 'openai')),
  agent         TEXT,
  result        JSONB,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);

CREATE INDEX idx_events_deal_id    ON events(deal_id);
CREATE INDEX idx_events_status     ON events(status);
CREATE INDEX idx_events_type       ON events(type);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_pending    ON events(status, created_at) WHERE status = 'pending';

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select" ON events
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "events_insert" ON events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "events_update" ON events
  FOR UPDATE USING (auth.role() = 'authenticated');
