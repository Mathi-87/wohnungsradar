/**
 * Scrape-All Orchestrator – Supabase Edge Function
 *
 * Ruft alle Scraper eines bestimmten Tiers auf, sammelt neue
 * Inserat-IDs und löst anschliessend den Benachrichtigungs-Service aus.
 *
 * Wird via pg_cron in drei Intervallen ausgeführt:
 *   Tier 1 (Portale):       stündlich
 *   Tier 2 (Verwaltungen):  alle 4 Stunden
 *   Tier 3 (Genossenschaften): täglich 2x
 *
 * Body-Parameter (optional):
 *   { "tiers": [1] }       → nur Tier 1 ausführen
 *   { "tiers": [1, 2] }    → Tier 1 und Tier 2
 *   {}                      → alle Tiers
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import type { ScrapeResult } from '../_shared/types.ts';

// Scraper pro Tier
const SCRAPERS_BY_TIER: Record<number, string[]> = {
  1: [
    'scrape-flatfox',
    'scrape-homegate',
    'scrape-immoscout24',
    'scrape-newhome',
  ],
  2: [
    'scrape-livit',
    'scrape-wincasa',
    'scrape-von-graffenried',
    'scrape-burgergemeinde',
    'scrape-immo-stadt-bern',
    'scrape-pvk-bern',
  ],
  3: [
    'scrape-fambau',
    'scrape-ebg-bern',
    'scrape-wogeno',
    'scrape-wbg-neuhaus',
  ],
};

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Fehlende Umgebungsvariablen' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Welche Tiers sollen ausgeführt werden?
  let activeTiers: number[];
  try {
    const body = await req.json().catch(() => ({}));
    activeTiers = Array.isArray(body.tiers) ? body.tiers : [1, 2, 3];
  } catch {
    activeTiers = [1, 2, 3];
  }

  const scrapers = activeTiers.flatMap(t => SCRAPERS_BY_TIER[t] ?? []);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceKey}`,
  };

  const results: ScrapeResult[] = [];
  const allNewListingIds: string[] = [];

  console.log(`[scrape-all] Tiers ${activeTiers.join(',')} – starte ${scrapers.length} Scraper...`);

  // Scraper nacheinander ausführen (Rate-Limiting pro Domain)
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
        if (result.newListingIds?.length) {
          allNewListingIds.push(...result.newListingIds);
        }
        console.log(`[scrape-all] ${scraper}: ${result.newCount} neu, ${result.updatedCount} aktualisiert`);
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
    tiers: activeTiers,
    results,
    total: {
      newCount:     results.reduce((s, r) => s + r.newCount,     0),
      updatedCount: results.reduce((s, r) => s + r.updatedCount, 0),
      errorCount:   results.reduce((s, r) => s + r.errorCount,   0),
    },
  };

  console.log('[scrape-all] Fertig:', summary.total);
  return new Response(JSON.stringify(summary), {
    headers: { 'Content-Type': 'application/json' },
  });
});
