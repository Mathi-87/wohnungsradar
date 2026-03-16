/**
 * Flatfox-Scraper
 *
 * Flatfox (flatfox.ch) hat eine öffentliche JSON-API, die ohne Login zugänglich ist.
 * Wir fragen Wohnungen in der Region Bern ab (via Geo-Bounding-Box).
 *
 * API-Endpunkt:
 *   GET https://flatfox.ch/api/v1/public-listing/
 *   Parameter: ordering, east, west, south, north, limit, offset
 *
 * Dokumentation: Nicht offiziell dokumentiert, aber stabil und öffentlich zugänglich.
 */

import { BaseScraper, ScrapedListing } from '../base-scraper';
import { deactivateMissing } from '../deduplicator';

// Bounding-Box für die Region Bern (ca. 20km Radius)
// Diese Koordinaten decken: Bern, Köniz, Ostermundigen, Ittigen, Wabern, Liebefeld ab
const BERN_BOUNDS = {
  west: 7.2971,
  east: 7.5858,
  south: 46.8972,
  north: 47.0442,
};

// Maximale Anzahl Inserate pro API-Request
const PAGE_SIZE = 100;

// Typdefinition für die Flatfox-API-Antwort
interface FlatfoxApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FlatfoxListing[];
}

interface FlatfoxListing {
  pk: number;
  url: string;
  slug: string;
  title: string;
  description: string | null;
  street: string | null;
  zipcode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  rooms: number | null;
  floor: number | null;
  living_area: number | null;       // Wohnfläche in m²
  price_display: number | null;     // Bruttomiete
  price_net: number | null;         // Nettomiete
  price_extra: number | null;       // Nebenkosten
  move_in_date: string | null;      // Verfügbar ab (YYYY-MM-DD)
  images: Array<{ url: string }>;
  category: string;                 // 'APARTMENT', 'HOUSE', etc.
  offer_type: string;               // 'RENT' oder 'BUY'
  agency: {
    name: string | null;
    url: string | null;
  } | null;
  features?: string[];              // z.B. ['GARDEN', 'BALCONY', 'MINERGIE']
  is_available: boolean;
  insertion_date: string;
}

export class FlatfoxScraper extends BaseScraper {
  readonly sourceName = 'flatfox';

  async scrape(): Promise<ScrapedListing[]> {
    const allListings: ScrapedListing[] = [];
    const activeSourceIds: string[] = [];
    let offset = 0;
    let hasMore = true;

    // Paginierung: Mehrere Seiten abrufen bis alle Inserate geladen sind
    while (hasMore) {
      await this.rateLimit(); // Rate-Limiting beachten

      const url = 'https://flatfox.ch/api/v1/public-listing/';
      const params = {
        ordering: '-insertion_date', // Neueste zuerst
        west: BERN_BOUNDS.west,
        east: BERN_BOUNDS.east,
        south: BERN_BOUNDS.south,
        north: BERN_BOUNDS.north,
        offer_type: 'RENT',          // Nur Mietwohnungen
        limit: PAGE_SIZE,
        offset,
      };

      let response: FlatfoxApiResponse;
      try {
        const res = await this.http.get<FlatfoxApiResponse>(url, { params });
        response = res.data;
      } catch (err) {
        console.error(`[flatfox] API-Fehler bei Seite ${offset / PAGE_SIZE + 1}:`, err);
        break;
      }

      console.log(`[flatfox] Seite ${offset / PAGE_SIZE + 1}: ${response.results.length} von ${response.count} total`);

      // Jedes Inserat verarbeiten
      for (const item of response.results) {
        // Nur Mietwohnungen im passenden Preisbereich
        if (item.offer_type !== 'RENT') continue;

        const listing = this.mapToListing(item);
        allListings.push(listing);
        activeSourceIds.push(String(item.pk));
      }

      // Nächste Seite oder fertig
      hasMore = response.next !== null;
      offset += PAGE_SIZE;

      // Sicherheits-Limit: Nicht mehr als 1000 Inserate auf einmal
      if (offset >= 1000) break;
    }

    // Inserate die nicht mehr vorhanden sind als inaktiv markieren
    await deactivateMissing(this.sourceName, activeSourceIds);

    return allListings;
  }

  /**
   * Wandelt ein Flatfox-Inserat in unser internes Format um.
   */
  private mapToListing(item: FlatfoxListing): ScrapedListing {
    const features = item.features ?? [];

    // Adresse zusammensetzen
    const address = item.street
      ? `${item.street}${item.zipcode ? ', ' + item.zipcode : ''}${item.city ? ' ' + item.city : ''}`
      : null;

    return {
      // Kerndaten
      title: item.title ?? `Wohnung in ${item.city ?? 'Bern'}`,
      description: item.description,
      address: item.street,
      zip_code: item.zipcode,
      city: item.city,
      district: null, // Flatfox liefert keinen Stadtteil

      // Wohnungsdaten
      rooms: item.rooms,
      area_m2: item.living_area,
      floor: item.floor,
      rent_net: item.price_net,
      rent_gross: item.price_display,
      additional_costs: item.price_extra,

      // Features aus dem features-Array extrahieren
      has_garden: features.includes('GARDEN'),
      has_terrace: features.includes('TERRACE'),
      has_balcony: features.includes('BALCONY') || features.includes('TERRACE'),
      has_lift: features.includes('ELEVATOR'),
      has_own_washer: features.includes('WASHING_MACHINE'),
      has_parking: features.includes('GARAGE') || features.includes('PARKING'),
      parking_cost: null,
      is_minergie: features.includes('MINERGIE') || features.includes('MINERGIE_P'),
      is_child_friendly: false, // Flatfox hat kein solches Tag
      property_type: this.mapCategory(item.category),

      // Verfügbarkeit
      available_from: item.move_in_date,

      // Quell-Tracking
      source: this.sourceName,
      source_url: `https://flatfox.ch/de/${item.slug ?? item.pk}/`,
      source_id: String(item.pk),
      source_ref: null,

      // Verwaltung
      agency_name: item.agency?.name ?? null,
      agency_url: item.agency?.url ?? null,

      // Bilder (erste 10)
      image_urls: item.images?.slice(0, 10).map(img => img.url) ?? [],

      // Geo
      latitude: item.latitude,
      longitude: item.longitude,

      // Status
      is_active: item.is_available,
    };
  }

  /**
   * Wandelt Flatfox-Kategorie in unseren property_type um.
   */
  private mapCategory(category: string): string {
    const map: Record<string, string> = {
      'APARTMENT': 'wohnung',
      'HOUSE': 'haus',
      'ROOM': 'zimmer',
      'STUDIO': 'studio',
      'ATTIC': 'attika',
      'MAISONETTE': 'maisonette',
      'LOFT': 'loft',
    };
    return map[category] ?? 'wohnung';
  }
}
