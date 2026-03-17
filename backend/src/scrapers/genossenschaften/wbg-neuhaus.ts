/**
 * WBG Neuhaus Scraper
 *
 * Wohnbaugenossenschaft Neuhaus – deckt Köniz, Schliern b. Köniz,
 * Wabern und Thörishaus ab. Inseriert ausschliesslich auf der eigenen Website.
 *
 * Website: https://www.wbg-neuhaus.ch
 * Listings: https://www.wbg-neuhaus.ch/wohnungen
 */

import * as cheerio from 'cheerio';
import { HtmlScraper } from '../html-scraper-base';

export class WbgNeuhausScraper extends HtmlScraper {
  readonly sourceName = 'wbg_neuhaus';
  readonly baseUrl = 'https://www.wbg-neuhaus.ch';
  readonly listingsUrl = 'https://www.wbg-neuhaus.ch/wohnungen';
  readonly agencyDisplayName = 'WBG Neuhaus';
  readonly filterByZip = false; // Alle Objekte behalten (Köniz-Region)

  // Versucht auch alternative URL falls /wohnungen nicht klappt
  async scrape() {
    const result = await super.scrape();
    if (result.length === 0) {
      console.log(`[wbg_neuhaus] /wohnungen leer – versuche /freie-wohnungen ...`);
      // Alternative URL versuchen
      (this as { listingsUrl: string }).listingsUrl = `${this.baseUrl}/freie-wohnungen`;
      return super.scrape();
    }
    return result;
  }
}
