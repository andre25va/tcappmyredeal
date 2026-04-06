-- Add daily cron job for milestone notification engine (13:00 UTC = 8 AM CST)
SELECT cron.schedule(
  'notify-milestones',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://alxrmusieuzgssynktxg.supabase.co/functions/v1/notify-milestones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
