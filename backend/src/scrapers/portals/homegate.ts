/**
 * Homegate-Scraper
 *
 * homegate.ch ist die grösste Immobilienplattform der Schweiz.
 * Die Webseite ist mit Next.js gebaut und bettet die Such-Daten als JSON
 * in die HTML-Seite ein (im Tag <script id="__NEXT_DATA__">).
 *
 * Wir lesen diese eingebetteten JSON-Daten aus, ohne einen Headless-Browser
 * zu benötigen. Diese Methode funktioniert solange Homegate Server-Side
 * Rendering (SSR) verwendet.
 *
 * WICHTIG: Falls Homegate auf rein Client-seitiges Rendering wechselt,
 * muss dieser Scraper auf Puppeteer/Playwright umgestellt werden.
 *
 * Ziel-URL:
 *   https://www.homegate.ch/mieten/wohnung/kanton-bern/trefferliste
 *   (gefiltert nach Berner Gemeinden, Zimmer 4–7, max. CHF 3500)
 */

import * as cheerio from 'cheerio';
import { BaseScraper, ScrapedListing } from '../base-scraper';
import { deactivateMissing } from '../deduplicator';

// Homegate-spezifische Suchparameter
// PLZ-Codes für die Zielgebiete (Bern, Köniz, Ostermundigen, Ittigen, Wabern, Liebefeld)
const TARGET_ZIP_CODES = ['3000', '3001', '3002', '3003', '3004', '3005', '3006', '3007', '3008', '3009',
  '3010', '3011', '3012', '3013', '3014', '3015', '3018', '3027', '3084', '3097', '3098',
  '3063', '3072', '3073', '3074', '3075', '3076', '3077', '3078'];

// Homegate Basis-URL für die Suche
const BASE_SEARCH_URL = 'https://www.homegate.ch/mieten/wohnung/kanton-bern/trefferliste';

export class HomegateScraper extends BaseScraper {
  readonly sourceName = 'homegate';

  async scrape(): Promise<ScrapedListing[]> {
    const allListings: ScrapedListing[] = [];
    const activeSourceIds: string[] = [];

    // Suchparameter
    const params = new URLSearchParams({
      'ac': '4',            // Zimmer ab 4
      'ah': '7',            // Zimmer bis 7
      'ag': '3500',         // Max. Bruttomiete CHF
      'ot': '1',            // Objekt-Typ: Wohnung
    });

    const url = `${BASE_SEARCH_URL}?${params.toString()}`;

    // Mehrere Seiten abrufen (Homegate zeigt 20 pro Seite)
    let page = 1;
    const maxPages = 10; // Nicht mehr als 200 Inserate auf einmal

    while (page <= maxPages) {
      await this.rateLimit();

      const pageUrl = page === 1 ? url : `${url}&ep=${page}`;
      console.log(`[homegate] Lade Seite ${page}: ${pageUrl}`);

      let html: string;
      try {
        const response = await this.http.get<string>(pageUrl, {
          headers: { 'Accept': 'text/html,application/xhtml+xml' },
        });
        html = response.data;
      } catch (err) {
        console.error(`[homegate] HTTP-Fehler Seite ${page}:`, err);
        break;
      }

      // JSON-Daten aus dem __NEXT_DATA__-Script-Tag extrahieren
      const pageListings = this.parseNextData(html);

      if (pageListings.length === 0) {
        console.log(`[homegate] Keine Inserate auf Seite ${page} – fertig`);
        break;
      }

      for (const listing of pageListings) {
        // Nur Inserate in Ziel-PLZ behalten
        if (listing.zip_code && !TARGET_ZIP_CODES.includes(listing.zip_code.substring(0, 4))) {
          continue;
        }
        allListings.push(listing);
        if (listing.source_id) activeSourceIds.push(listing.source_id);
      }

      console.log(`[homegate] Seite ${page}: ${pageListings.length} Inserate`);
      page++;
    }

    // Verschwundene Inserate deaktivieren
    await deactivateMissing(this.sourceName, activeSourceIds);

    return allListings;
  }

  /**
   * Extrahiert Listing-Daten aus dem __NEXT_DATA__ JSON-Block der Homegate-Seite.
   * Homegate nutzt Next.js SSR, daher sind die Daten im HTML eingebettet.
   */
  private parseNextData(html: string): ScrapedListing[] {
    const $ = cheerio.load(html);
    const nextDataScript = $('#__NEXT_DATA__').html();

    if (!nextDataScript) {
      console.warn('[homegate] Kein __NEXT_DATA__ gefunden – Seitenstruktur hat sich geändert');
      return [];
    }

    let nextData: any;
    try {
      nextData = JSON.parse(nextDataScript);
    } catch {
      console.error('[homegate] Fehler beim Parsen von __NEXT_DATA__');
      return [];
    }

    // Listings aus der Next.js-Datenstruktur extrahieren
    // Die genaue Struktur kann sich ändern – daher defensives Parsen
    const resultsPage = nextData?.props?.pageProps?.searchResult
      ?? nextData?.props?.pageProps?.listings
      ?? nextData?.props?.pageProps?.data?.results;

    if (!resultsPage || !Array.isArray(resultsPage)) {
      // Alternativer Pfad: Suche nach Listings-Array irgendwo im JSON
      const listings = this.deepFindListings(nextData);
      if (listings.length === 0) {
        console.warn('[homegate] Listings nicht in erwarteter JSON-Struktur gefunden');
      }
      return listings;
    }

    return resultsPage.map((item: any) => this.mapToListing(item)).filter(Boolean) as ScrapedListing[];
  }

  /**
   * Sucht rekursiv nach einem Array von Listings im JSON-Objekt.
   * Fallback falls sich die Struktur geändert hat.
   */
  private deepFindListings(obj: any, depth = 0): ScrapedListing[] {
    if (depth > 10 || !obj || typeof obj !== 'object') return [];

    // Ist es ein Array von Objekten mit 'id' und 'listing'?
    if (Array.isArray(obj) && obj.length > 0 && obj[0]?.listing?.id) {
      return obj.map((item: any) => this.mapToListing(item.listing)).filter(Boolean) as ScrapedListing[];
    }

    // Rekursiv suchen
    for (const key of Object.keys(obj)) {
      const result = this.deepFindListings(obj[key], depth + 1);
      if (result.length > 0) return result;
    }

    return [];
  }

  /**
   * Wandelt ein Homegate-Listing-Objekt in unser internes Format um.
   * Die Feldnamen können sich je nach API-Version unterscheiden.
   */
  private mapToListing(item: any): ScrapedListing | null {
    if (!item || typeof item !== 'object') return null;

    // Flexibles Auslesen verschiedener möglicher Strukturen
    const id = String(item.id ?? item.listingId ?? '');
    if (!id) return null;

    const address = item.address ?? item.location ?? {};
    const prices = item.prices ?? item.rent ?? {};
    const properties = item.characteristics ?? item.properties ?? {};

    return {
      title: item.title ?? item.description?.substring(0, 100) ?? 'Wohnung',
      description: item.description ?? null,
      address: [address.street, address.streetNumber].filter(Boolean).join(' ') || null,
      zip_code: String(address.zip ?? address.zipCode ?? address.postalCode ?? ''),
      city: address.city ?? address.locality ?? null,
      district: address.district ?? address.neighbourhood ?? null,

      rooms: parseFloat(properties.numberOfRooms ?? properties.rooms ?? 0) || null,
      area_m2: parseInt(properties.livingSpace ?? properties.area ?? 0) || null,
      floor: parseInt(properties.floor ?? properties.floorLevel ?? 0) || null,
      rent_net: parseInt(prices.rent?.net ?? prices.netRent ?? 0) || null,
      rent_gross: parseInt(prices.rent?.gross ?? prices.grossRent ?? prices.totalRent ?? 0) || null,
      additional_costs: parseInt(prices.rent?.extra ?? prices.additionalCosts ?? 0) || null,

      has_garden: Boolean(properties.garden ?? false),
      has_terrace: Boolean(properties.terrace ?? false),
      has_balcony: Boolean(properties.balcony ?? properties.terrace ?? false),
      has_lift: Boolean(properties.elevator ?? properties.lift ?? false),
      has_own_washer: Boolean(properties.washingMachine ?? false),
      has_parking: Boolean(properties.garage ?? properties.parking ?? false),
      parking_cost: null,
      is_minergie: Boolean(properties.minergie ?? false),
      is_child_friendly: false,
      property_type: 'wohnung',

      available_from: item.availableFrom ?? null,

      source: this.sourceName,
      source_url: `https://www.homegate.ch/mieten/${id}`,
      source_id: id,
      source_ref: item.referenceNumber ?? null,

      agency_name: item.agency?.name ?? null,
      agency_url: item.agency?.url ? `https://www.homegate.ch${item.agency.url}` : null,

      image_urls: (item.images ?? []).slice(0, 10).map((img: any) => img.url ?? img),

      latitude: parseFloat(address.coordinates?.latitude ?? address.lat ?? 0) || null,
      longitude: parseFloat(address.coordinates?.longitude ?? address.lon ?? 0) || null,

      is_active: true,
    };
  }
}
