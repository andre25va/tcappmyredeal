-- DST-aware wrapper: fires at exactly 7 AM America/Chicago year-round
-- Runs at both 12:00 and 13:00 UTC; guard checks actual Central time
CREATE OR REPLACE FUNCTION notify_milestones_dst_guard()
RETURNS void AS $$
BEGIN
  IF EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Chicago') = 7 THEN
    PERFORM net.http_post(
      url := 'https://alxrmusieuzgssynktxg.supabase.co/functions/v1/notify-milestones',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove old job, reschedule with DST guard
SELECT cron.unschedule('notify-milestones');
SELECT cron.schedule(
  'notify-milestones',
  '0 12,13 * * *',
  'SELECT notify_milestones_dst_guard()'
);
