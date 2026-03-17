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
--    supabase functions deploy --no-verify-jwt scrape-all
--
-- Ersetze DEINE-PROJECT-REF mit deiner Supabase Project Reference ID
-- (zu finden in: Supabase Dashboard → Settings → General → Reference ID)
-- ============================================================

-- ── Tier 1: Grosse Portale – stündlich ──────────────────────
-- scrape-all ruft Tier-1 Portale und send-notifications auf.
select cron.schedule(
  'wohnungsradar-tier1-hourly',    -- Job-Name (eindeutig)
  '0 * * * *',                     -- Cron-Ausdruck: jede Stunde um :00
  $$
  select net.http_post(
    url     := 'https://kqgzugyfaagxlzyginsk.supabase.co/functions/v1/scrape-all',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{"tiers":[1]}'::jsonb
  ) as request_id;
  $$
);

-- ── Tier 2: Verwaltungen – alle 4 Stunden ───────────────────
select cron.schedule(
  'wohnungsradar-tier2-4h',
  '30 */4 * * *',                  -- alle 4 Stunden, zur :30 Minute
  $$
  select net.http_post(
    url     := 'https://kqgzugyfaagxlzyginsk.supabase.co/functions/v1/scrape-all',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{"tiers":[2]}'::jsonb
  ) as request_id;
  $$
);

-- ── Tier 3: Genossenschaften – zweimal täglich ───────────────
select cron.schedule(
  'wohnungsradar-tier3-12h',
  '0 6,18 * * *',                  -- täglich um 06:00 und 18:00 Uhr
  $$
  select net.http_post(
    url     := 'https://kqgzugyfaagxlzyginsk.supabase.co/functions/v1/scrape-all',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := '{"tiers":[3]}'::jsonb
  ) as request_id;
  $$
);

-- ── Hinweise ─────────────────────────────────────────────────
--
-- Job-Liste anzeigen:
--   select * from cron.job;
--
-- Letzte Ausführungen anzeigen:
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- Jobs löschen (falls nötig):
--   select cron.unschedule('wohnungsradar-tier1-hourly');
--   select cron.unschedule('wohnungsradar-tier2-4h');
--   select cron.unschedule('wohnungsradar-tier3-12h');
--
-- Service Role Key alternativ direkt als String (weniger sicher):
--   'Authorization', 'Bearer eyJ...'   ← deinen Service Role Key einsetzen
-- ============================================================
