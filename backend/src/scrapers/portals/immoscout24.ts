/**
 * ImmoScout24-Scraper
 *
 * immoscout24.ch ist die zweitgrösste Immobilienplattform der Schweiz.
 * Wir versuchen dieselbe Technik wie bei Homegate: __NEXT_DATA__ aus dem HTML lesen.
 *
 * Falls das nicht funktioniert (weil ImmoScout24 rein Client-seitig rendert),
 * gibt es im Code einen Fallback-Hinweis für Puppeteer.
 *
 * Ziel-URL:
 *   https://www.immoscout24.ch/de/wohnung/mieten/kanton-bern
 *   (mit Filtern für Region Bern, Zimmer 4–7, max. CHF 3500)
 */

import * as cheerio from 'cheerio';
import { BaseScraper, ScrapedListing } from '../base-scraper';
import { deactivateMissing } from '../deduplicator';

// ImmoScout24-Suchparameter
const SEARCH_URL = 'https://www.immoscout24.ch/de/wohnung/mieten/kanton-bern';

// PLZ-Filter für Bern und Agglomeration
const TARGET_ZIP_CODES = ['3000', '3001', '3002', '3003', '3004', '3005', '3006', '3007', '3008', '3009',
  '3010', '3011', '3012', '3013', '3014', '3015', '3018', '3027', '3084', '3097', '3098',
  '3063', '3072', '3073', '3074', '3075', '3076', '3077', '3078'];

export class ImmoScout24Scraper extends BaseScraper {
  readonly sourceName = 'immoscout24';

  async scrape(): Promise<ScrapedListing[]> {
    const allListings: ScrapedListing[] = [];
    const activeSourceIds: string[] = [];

    // Suchparameter
    const params = new URLSearchParams({
      'nrf': '4',    // Zimmer ab
      'xrf': '7',    // Zimmer bis
      'mgpr': '3500', // Max. Miete
      'pn': '1',     // Seite
    });

    const maxPages = 10;

    for (let page = 1; page <= maxPages; page++) {
      await this.rateLimit();

      params.set('pn', String(page));
      const pageUrl = `${SEARCH_URL}?${params.toString()}`;
      console.log(`[immoscout24] Lade Seite ${page}: ${pageUrl}`);

      let html: string;
      try {
        const response = await this.http.get<string>(pageUrl, {
          headers: {
            'Accept': 'text/html,application/xhtml+xml',
            // ImmoScout24 braucht oft diese Header um nicht geblockt zu werden
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
          },
        });
        html = response.data;
      } catch (err: any) {
        if (err.response?.status === 403) {
          console.warn('[immoscout24] ⚠️  Zugriff verweigert (403). ImmoScout24 blockiert evtl. Scraping.');
          console.warn('[immoscout24] Für produktiven Einsatz: Puppeteer/Playwright verwenden.');
          break;
        }
        console.error(`[immoscout24] HTTP-Fehler Seite ${page}:`, err.message);
        break;
      }

      const pageListings = this.parseHtml(html);

      if (pageListings.length === 0) {
        console.log(`[immoscout24] Keine Inserate auf Seite ${page} – fertig`);
        break;
      }

      for (const listing of pageListings) {
        if (listing.zip_code && !TARGET_ZIP_CODES.includes(listing.zip_code.substring(0, 4))) {
          continue;
        }
        allListings.push(listing);
        if (listing.source_id) activeSourceIds.push(listing.source_id);
      }

      console.log(`[immoscout24] Seite ${page}: ${pageListings.length} Inserate`);
    }

    await deactivateMissing(this.sourceName, activeSourceIds);
    return allListings;
  }

  /**
   * Parst das HTML von ImmoScout24.
   * Versucht zuerst __NEXT_DATA__, dann JSON-LD, dann HTML-Scraping als Fallback.
   */
  private parseHtml(html: string): ScrapedListing[] {
    const $ = cheerio.load(html);

    // Methode 1: __NEXT_DATA__ (gleich wie Homegate)
    const nextDataScript = $('#__NEXT_DATA__').html();
    if (nextDataScript) {
      try {
        const nextData = JSON.parse(nextDataScript);
        const listings = this.extractFromNextData(nextData);
        if (listings.length > 0) return listings;
      } catch {
        console.warn('[immoscout24] Fehler beim Parsen von __NEXT_DATA__');
      }
    }

    // Methode 2: JSON-LD Structured Data
    const jsonLdScripts = $('script[type="application/ld+json"]');
    const listings: ScrapedListing[] = [];
    jsonLdScripts.each((_i, el) => {
      try {
        const data = JSON.parse($(el).html() ?? '{}');
        if (data['@type'] === 'Apartment' || data['@type'] === 'ApartmentComplex') {
          const listing = this.mapJsonLdToListing(data);
          if (listing) listings.push(listing);
        }
      } catch { /* ignorieren */ }
    });

    if (listings.length > 0) return listings;

    // Methode 3: HTML-Elemente direkt parsen (letzte Option)
    // ImmoScout24 nutzt data-Attribute für Inserat-IDs
    $('[data-test="result-list-item"]').each((_i, el) => {
      const link = $(el).find('a[href*="/de/d/"]').first();
      const href = link.attr('href') ?? '';
      const idMatch = href.match(/\/de\/d\/[^/]+-(\d+)/);
      if (!idMatch) return;

      const id = idMatch[1];
      const title = $(el).find('h2, h3, [data-test="title"]').first().text().trim();
      const priceText = $(el).find('[data-test="price"]').text().trim();
      const roomsText = $(el).find('[data-test="rooms"]').text().trim();

      const price = parseInt(priceText.replace(/[^0-9]/g, '')) || null;
      const rooms = parseFloat(roomsText) || null;

      if (!id || !title) return;

      listings.push({
        title,
        description: null,
        address: null,
        zip_code: null,
        city: null,
        district: null,
        rooms,
        area_m2: null,
        floor: null,
        rent_net: null,
        rent_gross: price,
        additional_costs: null,
        has_garden: false,
        has_terrace: false,
        has_balcony: false,
        has_lift: false,
        has_own_washer: false,
        has_parking: false,
        parking_cost: null,
        is_minergie: false,
        is_child_friendly: false,
        property_type: 'wohnung',
        available_from: null,
        source: this.sourceName,
        source_url: `https://www.immoscout24.ch${href}`,
        source_id: id,
        source_ref: null,
        agency_name: null,
        agency_url: null,
        image_urls: [],
        latitude: null,
        longitude: null,
        is_active: true,
      });
    });

    if (listings.length === 0) {
      console.warn('[immoscout24] ⚠️  Keine Inserate gefunden. Seitenstruktur hat sich evtl. geändert.');
    }

    return listings;
  }

  /**
   * Extrahiert Listings aus der Next.js-Datenstruktur von ImmoScout24.
   */
  private extractFromNextData(data: any): ScrapedListing[] {
    // ImmoScout24 Next.js Struktur (kann variieren)
    const results =
      data?.props?.pageProps?.searchResult?.listingResultItems ??
      data?.props?.pageProps?.listings ??
      data?.props?.pageProps?.data?.results ??
      [];

    if (!Array.isArray(results) || results.length === 0) return [];

    return results
      .map((item: any) => this.mapNextDataItem(item))
      .filter(Boolean) as ScrapedListing[];
  }

  private mapNextDataItem(item: any): ScrapedListing | null {
    const listing = item?.listing ?? item;
    if (!listing?.id) return null;

    const addr = listing.address ?? {};
    const props = listing.characteristics ?? listing.properties ?? {};
    const prices = listing.prices ?? listing.rent ?? {};

    return {
      title: listing.title ?? 'Wohnung',
      description: listing.description ?? null,
      address: [addr.street, addr.houseNumber].filter(Boolean).join(' ') || null,
      zip_code: String(addr.postalCode ?? addr.zip ?? ''),
      city: addr.city ?? addr.locality ?? null,
      district: addr.district ?? null,

      rooms: parseFloat(props.numberOfRooms ?? 0) || null,
      area_m2: parseInt(props.livingSpace ?? 0) || null,
      floor: parseInt(props.floor ?? 0) || null,
      rent_net: parseInt(prices.rent?.net ?? prices.net ?? 0) || null,
      rent_gross: parseInt(prices.rent?.gross ?? prices.gross ?? 0) || null,
      additional_costs: null,

      has_garden: Boolean(props.garden),
      has_terrace: Boolean(props.terrace),
      has_balcony: Boolean(props.balcony || props.terrace),
      has_lift: Boolean(props.elevator || props.lift),
      has_own_washer: Boolean(props.washingMachine),
      has_parking: Boolean(props.garage || props.parking),
      parking_cost: null,
      is_minergie: Boolean(props.minergie),
      is_child_friendly: false,
      property_type: 'wohnung',

      available_from: listing.availableFrom ?? null,

      source: this.sourceName,
      source_url: `https://www.immoscout24.ch/de/d/${listing.id}`,
      source_id: String(listing.id),
      source_ref: listing.referenceNumber ?? null,

      agency_name: listing.agency?.name ?? null,
      agency_url: null,
      image_urls: (listing.images ?? []).slice(0, 10).map((img: any) => img.url ?? img),

      latitude: parseFloat(addr.geoPoint?.latitude ?? 0) || null,
      longitude: parseFloat(addr.geoPoint?.longitude ?? 0) || null,
      is_active: true,
    };
  }

  private mapJsonLdToListing(data: any): ScrapedListing | null {
    if (!data.url) return null;
    const idMatch = data.url.match(/\d+$/);
    const id = idMatch ? idMatch[0] : null;
    if (!id) return null;

    return {
      title: data.name ?? 'Wohnung',
      description: data.description ?? null,
      address: data.address?.streetAddress ?? null,
      zip_code: data.address?.postalCode ?? null,
      city: data.address?.addressLocality ?? null,
      district: null,
      rooms: parseFloat(data.numberOfRooms ?? 0) || null,
      area_m2: parseInt(data.floorSize?.value ?? 0) || null,
      floor: null,
      rent_net: null,
      rent_gross: parseInt(data.offers?.price ?? 0) || null,
      additional_costs: null,
      has_garden: false, has_terrace: false, has_balcony: false,
      has_lift: false, has_own_washer: false, has_parking: false,
      parking_cost: null, is_minergie: false, is_child_friendly: false,
      property_type: 'wohnung',
      available_from: null,
      source: this.sourceName,
      source_url: data.url,
      source_id: id,
      source_ref: null,
      agency_name: null, agency_url: null,
      image_urls: data.image ? [data.image] : [],
      latitude: parseFloat(data.geo?.latitude ?? 0) || null,
      longitude: parseFloat(data.geo?.longitude ?? 0) || null,
      is_active: true,
    };
  }
}
