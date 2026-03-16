/**
 * Scrape-All Orchestrator – Supabase Edge Function
 *
 * Ruft alle Scraper nacheinander auf, sammelt neue Inserat-IDs
 * und löst anschliessend den Benachrichtigungs-Service aus.
 *
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

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
  };

  const scrapers = ['scrape-flatfox', 'scrape-homegate', 'scrape-immoscout24'];
  const results: ScrapeResult[] = [];
  const allNewListingIds: string[] = [];

  console.log('[scrape-all] Starte alle Scraper...');

  // Scraper nacheinander ausführen (nicht parallel – Rate-Limiting pro Domain)
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
        // Neue Inserat-IDs für Benachrichtigungen sammeln
        if (result.newListingIds?.length) {
          allNewListingIds.push(...result.newListingIds);
        }
        console.log(`[scrape-all] ${scraper} fertig: ${result.newCount} neu, ${result.updatedCount} aktualisiert`);
      } else {
        const errorText = await response.text();
        console.error(`[scrape-all] ${scraper} Fehler (${response.status}):`, errorText);
        results.push({
          source: scraper,
          newCount: 0, updatedCount: 0, errorCount: 1,
          newListingIds: [],
          error: errorText,
        });
      }
    } catch (err) {
      const msg = String(err);
      console.error(`[scrape-all] ${scraper} Exception:`, msg);
      results.push({
        source: scraper,
        newCount: 0, updatedCount: 0, errorCount: 1,
        newListingIds: [],
        error: msg,
      });
    }
  }

  // Benachrichtigungen für neue Inserate versenden
  if (allNewListingIds.length > 0) {
    console.log(`[scrape-all] Sende Benachrichtigungen für ${allNewListingIds.length} neue Inserate...`);
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-notifications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ newListingIds: allNewListingIds }),
      });
    } catch (err) {
      console.error('[scrape-all] Benachrichtigungs-Fehler:', err);
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
