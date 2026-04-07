-- Broadcast email templates
CREATE TABLE IF NOT EXISTS broadcast_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  subject     text        NOT NULL DEFAULT '',
  body_html   text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE broadcast_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_broadcast_templates"
  ON broadcast_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "auth_manage_broadcast_templates"
  ON broadcast_templates FOR ALL
  USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION update_broadcast_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_broadcast_templates_updated_at
  BEFORE UPDATE ON broadcast_templates
  FOR EACH ROW EXECUTE FUNCTION update_broadcast_templates_updated_at();

-- Starter templates
INSERT INTO broadcast_templates (name, subject, body_html) VALUES
('Closing Reminder', 'Important: Your Closing Date is Coming Up', '<p>Dear [Name],</p><p>This is a friendly reminder that your closing date is approaching. Please ensure all required documents are signed and submitted ahead of time to avoid any delays on closing day.</p><p>If you have any questions or need assistance, don''t hesitate to reach out — we''re here to help.</p><p>Best regards,<br><strong>TC Team</strong><br>tc@myredeal.com</p>'),
('Document Request', 'Action Required: Documents Needed', '<p>Dear [Name],</p><p>We are currently missing some important documents needed to move your transaction forward. Please submit the following at your earliest convenience:</p><ul><li>[Document 1]</li><li>[Document 2]</li></ul><p>Thank you for your prompt attention. Feel free to reply to this email if you have any questions.</p><p>Best regards,<br><strong>TC Team</strong><br>tc@myredeal.com</p>'),
('Status Update', 'Transaction Status Update', '<p>Dear [Name],</p><p>We wanted to provide you with a quick update on your transaction status.</p><p>[Add your status update here]</p><p>We will continue to keep you informed as things progress. Please don''t hesitate to reach out with any questions.</p><p>Best regards,<br><strong>TC Team</strong><br>tc@myredeal.com</p>'),
('Payment Due', 'Payment Reminder — Action Required', '<p>Dear [Name],</p><p>This is a reminder that a payment is due as part of your transaction. Please ensure payment is submitted by the deadline to avoid any delays in the closing process.</p><p>If you have already submitted payment, please disregard this message. Thank you!</p><p>Best regards,<br><strong>TC Team</strong><br>tc@myredeal.com</p>'),
('Availability Update', 'Scheduling Update — Please Review', '<p>Dear [Name],</p><p>We wanted to reach out regarding scheduling for your upcoming transaction milestones. Please review the information below and confirm your availability.</p><p>[Add scheduling details here]</p><p>Please reply at your earliest convenience so we can lock in the timeline.</p><p>Best regards,<br><strong>TC Team</strong><br>tc@myredeal.com</p>'),
('New Listing Announcement', 'New Listing: [Property Address]', '<p>Dear [Name],</p><p>We are excited to share a new listing that may be of interest to you.</p><p><strong>Property:</strong> [Address]<br><strong>Price:</strong> [Price]<br><strong>Details:</strong> [Beds/Baths/SqFt]</p><p>Please don''t hesitate to reach out if you''d like more information or would like to schedule a showing.</p><p>Best regards,<br><strong>TC Team</strong><br>tc@myredeal.com</p>');
