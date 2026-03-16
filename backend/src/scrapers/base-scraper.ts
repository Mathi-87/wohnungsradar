/**
 * Basis-Scraper (abstrakte Basisklasse)
 *
 * Alle konkreten Scraper (Flatfox, Homegate, etc.) erben von dieser Klasse.
 * Sie enthält gemeinsame Logik für:
 * - Rate-Limiting (max. 1 Request pro Sekunde)
 * - HTTP-Requests mit korrekten Headers
 * - Fehlerbehandlung und Logging
 * - Speichern der Ergebnisse in Supabase
 */

import axios, { AxiosInstance } from 'axios';
import { supabaseAdmin } from '../lib/supabase';
import { Listing } from '../lib/types';
import { computeDedupHash, findDuplicate } from './deduplicator';

// Partial<Listing> = Listing-Objekt, aber alle Felder optional
// Der Scraper liefert nur die Felder die er kennt
export type ScrapedListing = Omit<Listing,
  'id' | 'dedup_hash' | 'canonical_id' |
  'first_seen_at' | 'last_seen_at' | 'created_at' | 'updated_at'
> & {
  dedup_hash?: string;
  canonical_id?: string;
};

export abstract class BaseScraper {
  // Name der Quelle, z.B. 'flatfox', 'homegate'
  abstract readonly sourceName: string;

  // Axios-Client mit vorkonfigurierten Headers
  protected readonly http: AxiosInstance;

  // Zeitstempel des letzten Requests (für Rate-Limiting)
  private lastRequestAt = 0;

  constructor() {
    this.http = axios.create({
      timeout: 15_000,  // 15 Sekunden Timeout
      headers: {
        // Ehrliche Identifikation unseres Scrapers
        'User-Agent': 'WohnungsRadar/1.0 (privat, nicht-kommerziell; kontakt@wohnungsradar.ch)',
        'Accept': 'application/json, text/html',
        'Accept-Language': 'de-CH,de;q=0.9',
      },
    });
  }

  /**
   * Wartet falls nötig damit max. 1 Request/Sekunde gesendet wird.
   */
  protected async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    const minInterval = 1_100; // 1.1 Sekunden zwischen Requests

    if (elapsed < minInterval) {
      const waitMs = minInterval - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    this.lastRequestAt = Date.now();
  }

  /**
   * Jeder Scraper implementiert diese Methode.
   * Sie soll eine Liste von Inseraten zurückgeben.
   */
  abstract scrape(): Promise<ScrapedListing[]>;

  /**
   * Haupt-Methode: Scrapt, dedupliziert und speichert in Supabase.
   * Gibt die Anzahl neuer Inserate zurück.
   */
  async run(): Promise<{ newCount: number; updatedCount: number; errorCount: number }> {
    console.log(`\n[${this.sourceName}] Starte Scraping...`);

    let listings: ScrapedListing[] = [];
    try {
      listings = await this.scrape();
      console.log(`[${this.sourceName}] ${listings.length} Inserate gefunden`);
    } catch (err) {
      console.error(`[${this.sourceName}] Scraping fehlgeschlagen:`, err);
      // Fehler in Supabase speichern damit wir es im Dashboard sehen
      await this.updateSourceStatus(String(err));
      return { newCount: 0, updatedCount: 0, errorCount: 1 };
    }

    let newCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const listing of listings) {
      try {
        const result = await this.saveOrUpdate(listing);
        if (result === 'new') newCount++;
        else if (result === 'updated') updatedCount++;
      } catch (err) {
        console.error(`[${this.sourceName}] Fehler beim Speichern:`, err);
        errorCount++;
      }
    }

    // Erfolgreichen Scrape-Lauf in Supabase vermerken
    await this.updateSourceStatus(null);

    console.log(`[${this.sourceName}] Fertig: ${newCount} neu, ${updatedCount} aktualisiert, ${errorCount} Fehler`);
    return { newCount, updatedCount, errorCount };
  }

  /**
   * Speichert ein Inserat neu oder aktualisiert den last_seen_at-Zeitstempel.
   */
  private async saveOrUpdate(listing: ScrapedListing): Promise<'new' | 'updated' | 'skipped'> {
    // Dedup-Hash berechnen (aus Adresse + Zimmer + Fläche + Miete)
    const hash = computeDedupHash(listing);

    // Prüfen ob ein Duplikat existiert (gleicher Hash oder gleiche Source-ID)
    const duplicate = await findDuplicate(hash, listing.source, listing.source_id);

    if (duplicate) {
      // Bekanntes Inserat: nur last_seen_at aktualisieren
      await supabaseAdmin
        .from('listings')
        .update({ last_seen_at: new Date().toISOString(), is_active: true })
        .eq('id', duplicate.id);
      return 'updated';
    }

    // Neues Inserat speichern
    const { error } = await supabaseAdmin
      .from('listings')
      .insert({
        ...listing,
        dedup_hash: hash,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });

    if (error) throw error;
    return 'new';
  }

  /**
   * Aktualisiert den Status der Quelle in der scrape_sources-Tabelle.
   * error = null → Erfolg; error = string → Fehlermeldung
   */
  private async updateSourceStatus(error: string | null): Promise<void> {
    await supabaseAdmin
      .from('scrape_sources')
      .update({
        last_scraped_at: new Date().toISOString(),
        last_error: error,
      })
      .eq('name', this.sourceName);
  }
}
