/**
 * Basis-Logik für alle Scraper
 *
 * Enthält gemeinsame Funktionen:
 * - Inserate speichern oder aktualisieren
 * - Scraper-Status in scrape_sources aktualisieren
 * - Rate-Limiting (max. 1 Request/Sekunde)
 */

import { getSupabaseAdmin } from './supabase-client.ts';
import { computeDedupHash, findDuplicate } from './deduplicator.ts';
import type { ScrapedListing, ScrapeResult } from './types.ts';

// Speichert alle gescrapten Inserate und gibt Statistik + neue IDs zurück
export async function runScraper(
  sourceName: string,
  listings: ScrapedListing[],
): Promise<ScrapeResult> {
  const supabase = getSupabaseAdmin();
  let newCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const newListingIds: string[] = [];

  for (const listing of listings) {
    try {
      const hash = await computeDedupHash(listing);
      const existingId = await findDuplicate(hash, listing.source, listing.source_id);

      if (existingId) {
        // Bekanntes Inserat: nur Zeitstempel und Status aktualisieren
        await supabase
          .from('listings')
          .update({ last_seen_at: new Date().toISOString(), is_active: true })
          .eq('id', existingId);
        updatedCount++;
      } else {
        // Neues Inserat speichern und ID merken (für Benachrichtigungen)
        const { data, error } = await supabase
          .from('listings')
          .insert({
            ...listing,
            dedup_hash: hash,
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (error) throw error;
        if (data?.id) newListingIds.push(data.id);
        newCount++;
      }
    } catch (err) {
      console.error(`[${sourceName}] Fehler beim Speichern:`, err);
      errorCount++;
    }
  }

  // Erfolgreichen Lauf in scrape_sources vermerken
  await supabase
    .from('scrape_sources')
    .update({
      last_scraped_at: new Date().toISOString(),
      last_error: null,
      consecutive_errors: 0,
    })
    .eq('name', sourceName);

  console.log(`[${sourceName}] Fertig: ${newCount} neu, ${updatedCount} aktualisiert, ${errorCount} Fehler`);
  return { source: sourceName, newCount, updatedCount, errorCount, newListingIds };
}

// Speichert einen Fehler in scrape_sources
export async function updateSourceError(sourceName: string, error: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('scrape_sources')
    .update({
      last_scraped_at: new Date().toISOString(),
      last_error: error,
    })
    .eq('name', sourceName);
}

// Rate-Limiting: max. 1 Request pro Sekunde (global innerhalb einer Edge Function)
let lastRequestAt = 0;
export async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  const minInterval = 1_100; // 1.1 Sekunden

  if (elapsed < minInterval) {
    await new Promise(resolve => setTimeout(resolve, minInterval - elapsed));
  }
  lastRequestAt = Date.now();
}
