-- ============================================================
-- WohnungsRadar – Automatischer Scraper-Zeitplan via pg_cron
-- ============================================================
--
-- EINMALIG AUSFÜHREN nachdem die Edge Functions deployed sind.
--
-- Voraussetzungen:
-- 1. pg_cron Extension muss aktiviert sein:
--    Supabase Dashboard → Database → Extensions → pg_cron aktivieren
-- 2. pg_net Extension muss aktiviert sein (für HTTP-Calls):
--    Supabase Dashboard → Database → Extensions → pg_net aktivieren
-- 3. Edge Functions müssen deployed sein:
--    supabase functions deploy scrape-all
--
-- Ersetze DEINE-PROJECT-REF mit deiner Supabase Project Reference ID
-- (zu finden in: Supabase Dashboard → Settings → General → Reference ID)
-- ============================================================

-- Stündlichen Scraper-Job einrichten (jede volle Stunde)
select cron.schedule(
  'wohnungsradar-scrape-hourly',   -- Job-Name (eindeutig)
  '0 * * * *',                     -- Cron-Ausdruck: jede Stunde um :00
  $$
  select net.http_post(
    url     := 'https://DEINE-PROJECT-REF.supabase.co/functions/v1/scrape-all',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $$
);

-- ── Hinweise ────────────────────────────────────────────────
--
-- Job-Liste anzeigen:
--   select * from cron.job;
--
-- Letzten Ausführungen anzeigen:
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- Job löschen (falls nötig):
--   select cron.unschedule('wohnungsradar-scrape-hourly');
--
-- Alternativ: Service Role Key direkt als String (weniger sicher):
--   'Authorization', 'Bearer eyJ...'   ← deinen Service Role Key einsetzen
-- ============================================================
