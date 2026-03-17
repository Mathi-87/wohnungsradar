/**
 * Fambau Scraper
 *
 * Fambau (Familienheim-Genossenschaft Bern) – grösste Wohnbaugenossenschaft
 * in Bern mit ca. 3'000 Wohnungen. Inseriert überwiegend auf der eigenen Website.
 *
 * Website: https://www.fambau.ch
 * Listings: https://www.fambau.ch/de/wohnungssuche
 */

import * as cheerio from 'cheerio';
import { HtmlScraper } from '../html-scraper-base';

// Mögliche Listings-URLs bei Fambau (versuche der Reihe nach)
const FAMBAU_URLS = [
  'https://www.fambau.ch/de/wohnungssuche',
  'https://www.fambau.ch/wohnungssuche',
  'https://www.fambau.ch/de/wohnen/wohnungen',
  'https://www.fambau.ch/de/mieten',
  'https://www.fambau.ch/de/wohnungen',
];

export class FambauScraper extends HtmlScraper {
  readonly sourceName = 'fambau';
  readonly baseUrl = 'https://www.fambau.ch';
  listingsUrl = FAMBAU_URLS[0];
  readonly agencyDisplayName = 'Fambau Genossenschaft Bern';
  readonly filterByZip = false;

  async scrape() {
    // Versuche alle möglichen URLs bis eine Listings zurückgibt
    for (const url of FAMBAU_URLS) {
      this.listingsUrl = url;
      console.log(`[fambau] Versuche URL: ${url}`);
      try {
        const result = await super.scrape();
        if (result.length > 0) {
          console.log(`[fambau] Erfolgreich mit URL: ${url}`);
          return result;
        }
      } catch (err) {
        console.warn(`[fambau] URL fehlgeschlagen: ${url} – ${err}`);
      }
    }
    console.warn(`[fambau] Keine Inserate gefunden mit allen URLs. Bitte URL manuell prüfen.`);
    return [];
  }
}
