-- Update notify-milestones cron to 12:00 UTC (7 AM CDT / 6 AM CST)
-- Unschedule old 13:00 UTC job first
SELECT cron.unschedule('notify-milestones');

-- Re-schedule at 12:00 UTC
SELECT cron.schedule(
  'notify-milestones',
  '0 12 * * *',
  $$SELECT net.http_post(
    url := 'https://alxrmusieuzgssynktxg.supabase.co/functions/v1/notify-milestones',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;$$
);
