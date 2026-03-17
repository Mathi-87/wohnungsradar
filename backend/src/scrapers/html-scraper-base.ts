/**
 * Gemeinsame Basis für HTML-basierte Scraper (Verwaltungen, Genossenschaften)
 *
 * Da viele kleine Websites ähnlich aufgebaut sind (HTML-Liste von Wohnungen),
 * enthält diese Basisklasse die gemeinsame Parsing-Logik.
 *
 * Konkrete Scraper überschreiben sourceName und listingsUrl,
 * und können parseElement() für spezifisches Parsing überschreiben.
 */

import * as cheerio from 'cheerio';
import { BaseScraper, ScrapedListing } from './base-scraper';
import { deactivateMissing } from './deduplicator';

// Häufige Container-Selektoren auf Schweizer Immobilien-Websites
export const COMMON_LISTING_SELECTORS = [
  '.property-item',
  '.property-card',
  '.object-item',
  '.object-card',
  '.listing-item',
  '.listing-card',
  '.listing',
  '.immobilie',
  '.mietobjekt',
  '.wohnung-item',
  '.apartment-item',
  '.apartment-card',
  '.result-item',
  '.estate-item',
  '.realty-item',
  'article',
  '[class*="property-"]',
  '[class*="object-"]',
  '[class*="listing-"]',
  '[class*="apartment-"]',
];

// PLZ der Zielregion Bern
export const BERN_ZIP_CODES = new Set([
  '3000', '3001', '3002', '3003', '3004', '3005', '3006', '3007', '3008', '3009',
  '3010', '3011', '3012', '3013', '3014', '3015', '3016', '3017', '3018', '3019',
  '3020', '3027', '3032', '3034', '3048', '3052', '3053', '3063', '3072', '3073',
  '3074', '3076', '3077', '3084', '3085', '3097', '3098',
]);

export abstract class HtmlScraper extends BaseScraper {
  /** URL der Listings-Seite (kann in Subklassen überschrieben werden für URL-Fallback) */
  abstract listingsUrl: string;
  /** Basis-URL für relative Links */
  abstract readonly baseUrl: string;
  /** Name der Verwaltung/Genossenschaft für die agency_name-Spalte */
  abstract readonly agencyDisplayName: string;
  /** Nur Inserate in Ziel-PLZ behalten? (false = alle behalten) */
  readonly filterByZip: boolean = true;

  async scrape(): Promise<ScrapedListing[]> {
    await this.rateLimit();
    console.log(`[${this.sourceName}] Lade: ${this.listingsUrl}`);

    let html: string;
    try {
      const res = await this.http.get<string>(this.listingsUrl, {
        responseType: 'text',
        headers: {
          'Referer': this.baseUrl,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      html = res.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Seite nicht ladbar: ${msg}`);
    }

    const $ = cheerio.load(html);
    console.log(`[${this.sourceName}] Seiten-Titel: "${$('title').text().trim()}"`);

    // Listing-Container finden
    let $listings: ReturnType<typeof $> | null = null;
    for (const selector of COMMON_LISTING_SELECTORS) {
      const found = $(selector);
      // Mindestens 2 Elemente = wahrscheinlich Listing-Container
      if (found.length >= 2) {
        // Sicherheitscheck: Enthält mindestens eines einen CHF-Preis oder Zimmer-Angabe?
        let hasListingContent = false;
        found.each((_, el) => {
          if (/CHF|Zimmer|Zi\.|m²/i.test($(el).text())) hasListingContent = true;
        });
        if (hasListingContent) {
          console.log(`[${this.sourceName}] Selektor "${selector}": ${found.length} Elemente`);
          $listings = found;
          break;
        }
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

        // PLZ-Filter
        if (this.filterByZip && listing.zip_code && !BERN_ZIP_CODES.has(listing.zip_code)) {
          return;
        }

        listings.push(listing);
        if (listing.source_id) activeIds.push(listing.source_id);
      } catch (err) {
        console.warn(`[${this.sourceName}] Parse-Fehler:`, err);
      }
    });

    console.log(`[${this.sourceName}] ${listings.length} Inserate geparst`);
    await deactivateMissing(this.sourceName, activeIds);
    return listings;
  }

  /**
   * Parst ein einzelnes HTML-Element in ein Inserat.
   * Kann in Subklassen überschrieben werden für spezifischeres Parsing.
   */
  protected parseElement($: ReturnType<typeof cheerio.load>, el: cheerio.Element): ScrapedListing | null {
    const $el = $(el);

    // Link und Source-ID
    const linkHref = $el.find('a').first().attr('href');
    if (!linkHref) return null;

    const fullUrl = linkHref.startsWith('http') ? linkHref : `${this.baseUrl}${linkHref}`;

    // Source-ID aus URL ableiten
    const pathParts = linkHref.split('/').filter(Boolean);
    const sourceId = pathParts[pathParts.length - 1] || linkHref;

    const fullText = $el.text().replace(/\s+/g, ' ').trim();

    // Titel
    const title = $el.find('h1, h2, h3, h4, h5, .title, [class*="title"], [class*="heading"]')
      .first().text().trim();

    // Adresse
    const address = $el.find('.address, .adresse, .location, [class*="address"], [class*="adresse"]')
      .first().text().trim() || this.extractAddressFromText(fullText);

    // PLZ
    const zipMatch = fullText.match(/\b(3\d{3})\b/);
    const zipCode = zipMatch ? zipMatch[1] : null;

    // Zimmer: "3.5 Zimmer", "4 Zi.", "4-Zimmer-Wohnung"
    const roomsMatch = fullText.match(/(\d+[.,]\d*|\d+)\s*(?:Zimmer|Zi\.?|-Zimmer)/i);
    const rooms = roomsMatch ? parseFloat(roomsMatch[1].replace(',', '.')) : null;

    // Fläche: "85 m²", "100 m2"
    const areaMatch = fullText.match(/(\d+)\s*m[²2]/i);
    const areaMeter = areaMatch ? parseInt(areaMatch[1]) : null;

    // Miete: "CHF 1'500", "Fr. 1500", "1500.– CHF"
    const rentMatch = fullText.match(/(?:CHF|Fr\.?)\s*([\d'.\s]+)/i)
      || fullText.match(/([\d']{4,})\s*(?:CHF|Fr\.?|\.–)/i);
    const rentGross = rentMatch ? this.parseChf(rentMatch[1]) : null;

    // Verfügbar ab
    const dateMatch = fullText.match(/(?:ab|frei ab|verfügbar|available)[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i);

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
      has_parking: /parkplatz|garage|einstellplatz|tiefgarage/i.test(fullText),
      parking_cost: null,
      is_minergie: /minergie/i.test(fullText),
      is_child_friendly: false,
      property_type: /haus|reihen|villa/i.test(fullText) ? 'haus' : 'wohnung',

      available_from: dateMatch ? this.normalizeDateString(dateMatch[1]) : null,

      source: this.sourceName,
      source_url: fullUrl,
      source_id: sourceId,
      source_ref: null,

      agency_name: this.agencyDisplayName,
      agency_url: this.baseUrl,

      image_urls: [],
      latitude: null,
      longitude: null,
      is_active: true,
    };
  }

  protected extractAddressFromText(text: string): string {
    const match = text.match(
      /([A-ZÄÖÜa-zäöüéè][a-zäöüéè]+(strasse|gasse|weg|allee|platz|rain|matte|boden|berg|halde)\s+\d+[a-z]?)/i
    );
    return match ? match[1].trim() : '';
  }

  protected parseChf(value: string): number | null {
    const cleaned = value.replace(/['\s.–\-]/g, '').replace(',', '');
    const num = parseInt(cleaned);
    return isNaN(num) || num < 200 || num > 20000 ? null : num;
  }

  protected normalizeDateString(date: string): string {
    if (date.includes('-')) return date;
    const parts = date.split('.');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return date;
  }

  protected extractCity(text: string): string | null {
    const cities = [
      'Bern', 'Köniz', 'Schliern', 'Liebefeld', 'Wabern',
      'Ittigen', 'Ostermundigen', 'Gümligen', 'Zollikofen',
      'Münchenbuchsee', 'Kehrsatz', 'Thörishaus', 'Muri',
    ];
    return cities.find(c => text.includes(c)) ?? null;
  }

  protected logDiagnostics($: ReturnType<typeof cheerio.load>): void {
    const classes = [...new Set(
      $('[class]').map((_, el) => $(el).attr('class') ?? '').toArray()
        .join(' ').split(/\s+/).filter(c => c.length > 3)
    )].slice(0, 30).join(', ');
    console.warn(`[${this.sourceName}] Keine Listings gefunden! Klassen: ${classes}`);
    console.warn(`[${this.sourceName}] Body-Anfang: ${$('body').text().slice(0, 300).replace(/\s+/g, ' ')}`);
  }
}
