/**
 * Von Graffenried AG Liegenschaften Scraper
 *
 * Grosse Berner Liegenschaften-Verwaltung mit vielen Objekten in Bern,
 * Köniz, Schliern, Liebefeld und Umgebung.
 *
 * Webseite: https://www.graffenried-liegenschaften.ch
 * Listings: https://www.graffenried-liegenschaften.ch/de/mietobjekte/wohnung-mieten
 */

import * as cheerio from 'cheerio';
import { BaseScraper, ScrapedListing } from '../base-scraper';
import { deactivateMissing } from '../deduplicator';

const BASE_URL = 'https://www.graffenried-liegenschaften.ch';
const LISTINGS_URL = `${BASE_URL}/de/mietobjekte/wohnung-mieten`;

// Mögliche Container-Selektoren für ihre CMS-Struktur
const LISTING_SELECTORS = [
  '.property-item',
  '.property-card',
  '.object-item',
  '.object-card',
  '.listing-item',
  '.listing-card',
  '.immobilie',
  '.mietobjekt',
  '.estate-item',
  '.realty-item',
  'article',
  '.result-item',
  '.grid-item',
  '.col-listing',
  '[class*="property"]',
  '[class*="object"]',
  '[class*="listing"]',
];

// Nur Inserate in diesen PLZ-Bereichen
const TARGET_ZIP_CODES = new Set([
  '3000', '3001', '3002', '3003', '3004', '3005', '3006', '3007', '3008', '3009',
  '3010', '3011', '3012', '3013', '3014', '3015', '3018', '3019', '3020', '3027',
  '3032', '3034', '3048', '3052', '3053', '3072', '3073', '3074', '3076', '3077',
  '3084', '3097', '3098',
]);

export class VonGraffenriedScraper extends BaseScraper {
  readonly sourceName = 'von_graffenried';

  async scrape(): Promise<ScrapedListing[]> {
    await this.rateLimit();

    console.log(`[von_graffenried] Lade: ${LISTINGS_URL}`);

    let html: string;
    try {
      const res = await this.http.get<string>(LISTINGS_URL, {
        responseType: 'text',
        headers: {
          'Referer': BASE_URL,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      html = res.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[von_graffenried] Seite nicht ladbar: ${msg}`);
    }

    const $ = cheerio.load(html);
    console.log(`[von_graffenried] Seiten-Titel: "${$('title').text().trim()}"`);

    // Listings finden
    let $listings: ReturnType<typeof $> | null = null;
    for (const selector of LISTING_SELECTORS) {
      const found = $(selector);
      if (found.length > 2) {  // Mindestens 3 Elemente = wahrscheinlich Listings
        console.log(`[von_graffenried] Selektor "${selector}": ${found.length} Elemente`);
        $listings = found;
        break;
      }
    }

    if (!$listings || $listings.length === 0) {
      this.logDiagnostics($);
      return [];
    }

    const listings: ScrapedListing[] = [];
    const activeIds: string[] = [];

    $listings.each((_, el) => {
      try {
        const listing = this.parseElement($, el);
        if (!listing) return;

        // Nur Inserate in Ziel-PLZ behalten
        if (listing.zip_code && !TARGET_ZIP_CODES.has(listing.zip_code)) {
          console.log(`[von_graffenried] PLZ ${listing.zip_code} ausserhalb Suchgebiet – übersprungen`);
          return;
        }

        listings.push(listing);
        if (listing.source_id) activeIds.push(listing.source_id);
      } catch (err) {
        console.warn(`[von_graffenried] Parse-Fehler:`, err);
      }
    });

    console.log(`[von_graffenried] ${listings.length} Inserate geparst`);
    await deactivateMissing(this.sourceName, activeIds);
    return listings;
  }

  private parseElement($: ReturnType<typeof cheerio.load>, el: cheerio.Element): ScrapedListing | null {
    const $el = $(el);

    // Link und Source-ID
    const linkEl = $el.find('a').filter((_, a) => {
      const href = $(a).attr('href') ?? '';
      return href.includes('mietobjekt') || href.includes('detail') || href.includes('objekt');
    }).first();

    const linkHref = linkEl.attr('href') || $el.find('a').first().attr('href');
    if (!linkHref) return null;

    const fullUrl = linkHref.startsWith('http') ? linkHref : `${BASE_URL}${linkHref}`;
    const sourceId = linkHref.replace(/^.*\//, '').replace(/[^a-z0-9-_]/gi, '') || linkHref;

    const fullText = $el.text().replace(/\s+/g, ' ').trim();

    // Titel
    const title = $el.find('h1, h2, h3, h4, .title, .object-title, [class*="title"]')
      .first().text().trim();

    // Adresse
    const addrEl = $el.find('.address, .location, .adresse, [class*="address"], [class*="adresse"]')
      .first().text().trim();
    const address = addrEl || this.extractAddressFromText(fullText);

    // PLZ
    const zipMatch = fullText.match(/\b(3\d{3})\b/);
    const zipCode = zipMatch ? zipMatch[1] : null;

    // Zimmer
    const roomsMatch = fullText.match(/(\d+[.,]\d*|\d+)\s*(?:Zimmer|Zi\.?)/i);
    const rooms = roomsMatch ? parseFloat(roomsMatch[1].replace(',', '.')) : null;

    // Fläche
    const areaMatch = fullText.match(/(\d+)\s*m[²2]/i);
    const areaMeter = areaMatch ? parseInt(areaMatch[1]) : null;

    // Miete
    const rentMatch = fullText.match(/(?:CHF|Fr\.?)\s*([\d'.]+)/i);
    const rentGross = rentMatch ? this.parseChf(rentMatch[1]) : null;

    return {
      title: title || `Wohnung ${address || 'Bern'}`,
      description: null,
      address: address || null,
      zip_code: zipCode,
      city: this.extractCity(fullText),
      district: null,

      rooms,
      area_m2: areaMeter,
      floor: null,
      rent_net: null,
      rent_gross: rentGross,
      additional_costs: null,

      has_garden: /\bgarten\b/i.test(fullText),
      has_terrace: /terrasse/i.test(fullText),
      has_balcony: /balkon|terrasse/i.test(fullText),
      has_lift: /\b(?:lift|aufzug)\b/i.test(fullText),
      has_own_washer: /waschmaschine|waschküche/i.test(fullText),
      has_parking: /parkplatz|garage|einstellplatz/i.test(fullText),
      parking_cost: null,
      is_minergie: /minergie/i.test(fullText),
      is_child_friendly: false,
      property_type: 'wohnung',
      available_from: null,

      source: this.sourceName,
      source_url: fullUrl,
      source_id: sourceId,
      source_ref: null,

      agency_name: 'Von Graffenried AG Liegenschaften',
      agency_url: BASE_URL,

      image_urls: [],
      latitude: null,
      longitude: null,
      is_active: true,
    };
  }

  private extractAddressFromText(text: string): string {
    const match = text.match(
      /([A-ZÄÖÜa-zäöüéè][a-zäöüéè]+(strasse|gasse|weg|allee|platz|rain|matte|boden|berg|halde)\s+\d+[a-z]?)/i
    );
    return match ? match[1].trim() : '';
  }

  private parseChf(value: string): number | null {
    const num = parseInt(value.replace(/['\s.–]/g, ''));
    return isNaN(num) || num < 100 || num > 20000 ? null : num;
  }

  private extractCity(text: string): string | null {
    const cities = ['Bern', 'Köniz', 'Schliern', 'Liebefeld', 'Wabern', 'Ittigen', 'Ostermundigen'];
    return cities.find(c => text.includes(c)) ?? null;
  }

  /** Gibt Diagnose-Infos aus wenn keine Listings gefunden. */
  private logDiagnostics($: ReturnType<typeof cheerio.load>): void {
    const classes = [...new Set(
      $('[class]').map((_, el) => $(el).attr('class') ?? '').toArray()
        .join(' ').split(/\s+/).filter(c => c.length > 3)
    )].slice(0, 30).join(', ');
    console.warn(`[von_graffenried] Keine Listings! CSS-Klassen: ${classes}`);
    console.warn(`[von_graffenried] Body: ${$('body').text().slice(0, 300).replace(/\s+/g, ' ')}`);
  }
}
