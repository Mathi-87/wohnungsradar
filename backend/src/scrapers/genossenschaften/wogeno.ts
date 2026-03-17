/**
 * WOGENO Bern Scraper
 *
 * WOGENO (Wohngenossenschaft) Bern – mittlere Genossenschaft mit Fokus
 * auf günstige, selbstverwaltete Wohnungen in der Stadt Bern (~200 Wohnungen).
 * Inseriert nur auf der eigenen Website.
 *
 * Website: https://www.wogeno-bern.ch
 * Listings: https://www.wogeno-bern.ch/wohnungsangebot
 */

import { HtmlScraper } from '../html-scraper-base';

const WOGENO_URLS = [
  'https://www.wogeno-bern.ch/wohnungsangebot',
  'https://www.wogeno-bern.ch/wohnungen',
  'https://www.wogeno-bern.ch/freie-wohnungen',
  'https://www.wogeno-bern.ch/angebot',
];

export class WogenoScraper extends HtmlScraper {
  readonly sourceName = 'wogeno';
  readonly baseUrl = 'https://www.wogeno-bern.ch';
  listingsUrl = WOGENO_URLS[0];
  readonly agencyDisplayName = 'WOGENO Bern';
  readonly filterByZip = false;

  async scrape() {
    for (const url of WOGENO_URLS) {
      this.listingsUrl = url;
      try {
        const result = await super.scrape();
        if (result.length > 0) return result;
      } catch {
        // Nächste URL probieren
      }
    }
    console.warn(`[wogeno] Keine Inserate gefunden. URL manuell prüfen auf wogeno-bern.ch`);
    return [];
  }
}
