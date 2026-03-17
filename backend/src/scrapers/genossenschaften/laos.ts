/**
 * laos.io Scraper
 *
 * laos.io ist ein Schweizer Aggregator für Genossenschaftswohnungen.
 * Er sammelt freie Wohnungen von Hunderten von Genossenschaften – inkl. aller
 * wichtigen Berner Genossenschaften (Fambau, WOGENO, WBG Neuhaus, EBG, etc.).
 *
 * Ein einziges Scraper-Modul ersetzt so viele einzelne Genossenschafts-Scraper!
 *
 * URL: https://laos.io/de/kanton/Bern/
 */

import * as cheerio from 'cheerio';
import { BaseScraper, ScrapedListing } from '../base-scraper';
import { deactivateMissing } from '../deduplicator';

const SCRAPE_URL = 'https://laos.io/de/kanton/Bern/';
const BASE_URL = 'https://laos.io';

// Mögliche Container-Selektoren – versuche der Reihe nach
const LISTING_SELECTORS = [
  '.listing-card',
  '.apartment-card',
  '.listing',
  '.apartment',
  '.result-item',
  '.object-card',
  'article',
  '.card',
  '[data-listing-id]',
  '[data-apartment-id]',
  '.flat',
  '.wohnung',
];

export class LaosScraper extends BaseScraper {
  readonly sourceName = 'laos';

  async scrape(): Promise<ScrapedListing[]> {
    await this.rateLimit();

    console.log(`[laos] Lade Genossenschaftswohnungen Kanton Bern: ${SCRAPE_URL}`);

    let html: string;
    try {
      const res = await this.http.get<string>(SCRAPE_URL, {
        responseType: 'text',
        headers: {
          'Referer': 'https://laos.io/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      html = res.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`[laos] Seite konnte nicht geladen werden: ${message}`);
    }

    const $ = cheerio.load(html);

    // Diagnose: Seiten-Titel loggen (hilft beim Debuggen)
    console.log(`[laos] Seiten-Titel: "${$('title').text().trim()}"`);

    // Gesamtanzahl der Inserate prüfen (falls auf der Seite angegeben)
    const totalText = $('[class*="count"], [class*="total"], [class*="result"]').first().text().trim();
    if (totalText) console.log(`[laos] Anzahl laut Seite: ${totalText}`);

    // Passenden Container-Selektor finden
    let $listings: ReturnType<typeof $> | null = null;
    let usedSelector = '';

    for (const selector of LISTING_SELECTORS) {
      const found = $(selector);
      if (found.length > 0) {
        console.log(`[laos] Selektor "${selector}" hat ${found.length} Elemente gefunden`);
        $listings = found;
        usedSelector = selector;
        break;
      }
    }

    // Diagnose wenn nichts gefunden: CSS-Klassen der Seite loggen
    if (!$listings || $listings.length === 0) {
      const allClasses = [...new Set(
        $('[class]').map((_, el) => $(el).attr('class') ?? '').toArray()
          .join(' ').split(/\s+/).filter(c => c.length > 3)
      )].slice(0, 30).join(', ');

      console.warn(`[laos] Keine Inserate gefunden! Seiten-Klassen: ${allClasses}`);
      console.warn(`[laos] Body-Anfang: ${$('body').text().slice(0, 300).replace(/\s+/g, ' ')}`);
      return [];
    }

    const listings: ScrapedListing[] = [];
    const activeIds: string[] = [];

    $listings.each((_, el) => {
      try {
        const listing = this.parseElement($, el);
        if (listing) {
          listings.push(listing);
          if (listing.source_id) activeIds.push(listing.source_id);
        }
      } catch (err) {
        console.warn(`[laos] Fehler beim Parsen eines Elements:`, err);
      }
    });

    console.log(`[laos] ${listings.length} von ${$listings.length} Elementen erfolgreich geparst`);

    // Nicht mehr vorhandene Inserate als inaktiv markieren
    await deactivateMissing(this.sourceName, activeIds);

    return listings;
  }

  /**
   * Parst ein einzelnes Listing-Element und wandelt es in unser Format um.
   */
  private parseElement($: ReturnType<typeof cheerio.load>, el: cheerio.Element): ScrapedListing | null {
    const $el = $(el);

    // Link zum Inserat finden
    const linkHref = $el.find('a[href*="/listing/"], a[href*="/apartment/"], a[href*="/wohnung/"]').first().attr('href')
      || $el.find('a').first().attr('href')
      || $el.attr('data-href');

    if (!linkHref) return null;

    const fullUrl = linkHref.startsWith('http') ? linkHref : `${BASE_URL}${linkHref}`;

    // Source-ID aus URL oder data-Attribut
    const idFromUrl = linkHref.match(/\/(\d+)\/?(?:\?.*)?$/)?.[1];
    const sourceId = $el.attr('data-listing-id') || $el.attr('data-id') || idFromUrl || linkHref;

    // Volltext des Elements für Regex-Extraktion
    const fullText = $el.text().replace(/\s+/g, ' ').trim();

    // Titel: H-Tag oder title-Klasse
    const title = $el.find('h1, h2, h3, h4, h5, .title, .heading, [class*="title"], [class*="heading"]')
      .first().text().trim();

    // Adresse: spezifische Klassen oder Text mit Strassenmuster
    const address = this.extractAddress($el, $);

    // Genossenschafts-/Verwaltungsname
    const agencyName = $el.find(
      '.cooperative-name, .agency-name, .company, .organisation, [class*="cooperative"], [class*="agency"], [class*="company"]'
    ).first().text().trim() || null;

    // PLZ und Stadt extrahieren
    const zipMatch = fullText.match(/\b(3\d{3})\b/);
    const zipCode = zipMatch ? zipMatch[1] : null;

    // Zimmer: "3.5 Zimmer", "4 Zi.", "3,5 Zi"
    const roomsMatch = fullText.match(/(\d+[.,]\d+|\d+)\s*(?:Zimmer|Zi\.?|rooms?)/i);
    const rooms = roomsMatch ? parseFloat(roomsMatch[1].replace(',', '.')) : null;

    // Fläche: "85 m²", "100m2"
    const areaMatch = fullText.match(/(\d+)\s*m[²2]/i);
    const areaMeter = areaMatch ? parseInt(areaMatch[1]) : null;

    // Bruttomiete: "CHF 1'500", "1500.-", "Fr. 1500"
    const rentMatch = fullText.match(/(?:CHF|Fr\.?)\s*([\d'.]+)/i)
      || fullText.match(/([\d'.]+)\s*(?:CHF|Fr\.?|\.\/(?:Mt|Monat))/i);
    const rentGross = rentMatch ? this.parseChf(rentMatch[1]) : null;

    // Verfügbar-Datum: "ab 01.05.2025" oder "01.05.2025"
    const dateMatch = fullText.match(
      /(?:ab|verfügbar|frei ab|available)[:\s]+(\d{1,2}\.\d{1,2}\.\d{4})/i
    );

    // Bilder
    const images: string[] = [];
    $el.find('img[src]').each((_, img) => {
      const src = $(img).attr('src');
      if (src && !src.includes('placeholder') && !src.includes('logo')) images.push(src);
    });

    return {
      title: title || `Genossenschaftswohnung ${address || 'Bern'}`,
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

      // Features aus Freitext erkennen
      has_garden: /\bgarten\b/i.test(fullText),
      has_terrace: /terrasse/i.test(fullText),
      has_balcony: /balkon|terrasse/i.test(fullText),
      has_lift: /\b(?:lift|aufzug)\b/i.test(fullText),
      has_own_washer: /waschmaschine|waschküche/i.test(fullText),
      has_parking: /parkplatz|garage|einstellplatz|tiefgarage/i.test(fullText),
      parking_cost: null,
      is_minergie: /minergie/i.test(fullText),
      is_child_friendly: false,
      property_type: 'wohnung',

      available_from: dateMatch ? this.normalizeDateString(dateMatch[1]) : null,

      source: this.sourceName,
      source_url: fullUrl,
      source_id: sourceId,
      source_ref: null,

      agency_name: agencyName,
      agency_url: null,

      image_urls: images.slice(0, 5),
      latitude: null,
      longitude: null,
      is_active: true,
    };
  }

  /** Versucht eine Adresse aus dem Element zu extrahieren. */
  private extractAddress($el: ReturnType<typeof cheerio.load.prototype>, $: ReturnType<typeof cheerio.load>): string {
    // Spezifische Adress-Selektoren
    const specific = $el.find('.address, .location, .street, [class*="address"], [class*="location"], [class*="street"]')
      .first().text().trim();
    if (specific) return specific;

    // Regex: Strassenmuster "Musterstrasse 12, 3000 Bern"
    const fullText = $el.text();
    const addrMatch = fullText.match(/([A-ZÄÖÜa-zäöüé][a-zäöüéà]+(strasse|gasse|weg|allee|platz|rain|matte|boden|egg|berg|halde)\s+\d+[a-z]?(?:,?\s+\d{4}\s+\w+)?)/i);
    return addrMatch ? addrMatch[1].trim() : '';
  }

  /** Wandelt einen CHF-String (z.B. "1'500.–") in eine Zahl um. */
  private parseChf(value: string): number | null {
    const cleaned = value.replace(/['\s.–]/g, '').replace(',', '');
    const num = parseInt(cleaned);
    return isNaN(num) || num < 100 || num > 20000 ? null : num;
  }

  /** Konvertiert ein Datum "DD.MM.YYYY" → "YYYY-MM-DD" */
  private normalizeDateString(date: string): string {
    if (date.includes('-')) return date; // schon ISO
    const parts = date.split('.');
    if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    return date;
  }

  /** Erkennt den Stadtnamen aus dem Text. */
  private extractCity(text: string): string | null {
    const cities = [
      'Bern', 'Köniz', 'Schliern', 'Liebefeld', 'Wabern',
      'Ittigen', 'Ostermundigen', 'Gümligen', 'Zollikofen',
      'Münchenbuchsee', 'Kehrsatz', 'Thörishaus',
    ];
    for (const city of cities) {
      if (text.includes(city)) return city;
    }
    return null;
  }
}
