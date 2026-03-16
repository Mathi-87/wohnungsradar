/**
 * Scrape-All Orchestrator – Supabase Edge Function
 *
 * Ruft alle Scraper nacheinander auf und gibt eine Zusammenfassung zurück.
 * Wird stündlich via pg_cron automatisch ausgeführt.
 * Kann auch manuell über das Frontend ausgelöst werden.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import type { ScrapeResult } from '../_shared/types.ts';

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Fehlende Umgebungsvariablen' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Auth-Header für interne Edge Function Aufrufe
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
  };

  const scrapers = ['scrape-flatfox', 'scrape-homegate', 'scrape-immoscout24'];
  const results: ScrapeResult[] = [];

  console.log('[scrape-all] Starte alle Scraper...');

  // Scraper nacheinander ausführen (nicht parallel – Rate-Limiting)
  for (const scraper of scrapers) {
    try {
      console.log(`[scrape-all] Starte ${scraper}...`);
      const response = await fetch(`${supabaseUrl}/functions/v1/${scraper}`, {
        method: 'POST',
        headers,
      });

      if (response.ok) {
        const result: ScrapeResult = await response.json();
        results.push(result);
        console.log(`[scrape-all] ${scraper} fertig:`, result);
      } else {
        const errorText = await response.text();
        console.error(`[scrape-all] ${scraper} Fehler (${response.status}):`, errorText);
        results.push({ source: scraper, newCount: 0, updatedCount: 0, errorCount: 1, error: errorText });
      }
    } catch (err) {
      const msg = String(err);
      console.error(`[scrape-all] ${scraper} Exception:`, msg);
      results.push({ source: scraper, newCount: 0, updatedCount: 0, errorCount: 1, error: msg });
    }
  }

  const summary = {
    completedAt: new Date().toISOString(),
    results,
    total: {
      newCount: results.reduce((s, r) => s + r.newCount, 0),
      updatedCount: results.reduce((s, r) => s + r.updatedCount, 0),
      errorCount: results.reduce((s, r) => s + r.errorCount, 0),
    },
  };

  console.log('[scrape-all] Alle Scraper fertig:', summary.total);

  return new Response(JSON.stringify(summary), {
    headers: { 'Content-Type': 'application/json' },
  });
});
