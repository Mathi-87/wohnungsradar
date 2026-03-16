/**
 * Newhome Scraper – Supabase Edge Function
 *
 * newhome.ch ist das Immobilienportal der Schweizer Kantonalbanken.
 * Die Seite nutzt Next.js SSR – die Inserate sind als JSON im HTML
 * eingebettet (<script id="__NEXT_DATA__">).
 *
 * Suchparameter:
 *   - Typ: Wohnung mieten
 *   - Kanton: Bern (BE)
 *   - Zimmer: ab 4
 *   - Bruttomiete: max. CHF 3'500
 *
 * Rate-Limiting: 1 Request pro Sekunde (via rateLimit())
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { runScraper, rateLimit, updateSourceError } from '../_shared/base-scraper.ts';
import { deactivateMissing } from '../_shared/deduplicator.ts';
import type { ScrapedListing } from '../_shared/types.ts';

const SOURCE_NAME = 'newhome';

// Suchseite: Wohnungen mieten, Kanton Bern, ab 4 Zi., max. CHF 3500
const SEARCH_URL =
  'https://www.newhome.ch/de/wohnung/mieten/kanton-bern/' +
  '?r=4&priceToGross=3500&sortBy=date_desc';

// Relevante PLZ in Bern und Agglomeration
const TARGET_ZIP_CODES = new Set([
  '3000','3001','3002','3003','3004','3005','3006','3007','3008','3009',
  '3010','3011','3012','3013','3014','3015','3018','3027','3084','3097','3098',
  '3063','3072','3073','3074','3075','3076','3077','3078',
]);

// Extrahiert das __NEXT_DATA__ JSON aus dem HTML
function extractNextData(html: string): any | null {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// Sucht rekursiv nach einem Listings-Array (Fallback bei Strukturänderungen)
function deepFindListings(obj: any, depth = 0): any[] {
  if (depth > 10 || !obj || typeof obj !== 'object') return [];
  // Newhome-Struktur: Array von Objekten mit id + verschiedenen Listing-Feldern
  if (Array.isArray(obj) && obj.length > 0) {
    const first = obj[0];
    if (first?.id && (first?.rooms !== undefined || first?.numberOfRooms !== undefined ||
        first?.rent !== undefined || first?.price !== undefined)) {
      return obj;
    }
    // Wrapper-Format: { listing: {...} }
    if (first?.listing?.id) return obj.map((i: any) => i.listing);
  }
  for (const key of Object.keys(obj)) {
    const result = deepFindListings(obj[key], depth + 1);
    if (result.length > 0) return result;
  }
  return [];
}

// Mappt ein Newhome-Objekt auf unser internes Format
function mapToListing(item: any): ScrapedListing | null {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id ?? item.listingId ?? item.objectId ?? '');
  if (!id) return null;

  const address = item.address ?? item.location ?? {};
  const price = item.price ?? item.rent ?? item.prices ?? {};
  const features = item.features ?? item.attributes ?? item.characteristics ?? {};

  // Miete: newhome verwendet oft "gross" und "net" direkt oder verschachtelt
  const rentGross =
    parseInt(price.gross ?? price.grossRent ?? price.totalRent ?? price.total ?? 0) || null;
  const rentNet =
    parseInt(price.net ?? price.netRent ?? price.netto ?? 0) || null;

  return {
    title: item.title ?? item.description?.substring(0, 100) ?? 'Wohnung',
    description: item.description ?? item.shortDescription ?? null,
    address: [address.street, address.streetNumber].filter(Boolean).join(' ') || null,
    zip_code: String(address.zip ?? address.postalCode ?? address.zipCode ?? '').substring(0, 4),
    city: address.city ?? address.locality ?? null,
    district: address.district ?? null,
    rooms:
      parseFloat(item.numberOfRooms ?? item.rooms ?? features.numberOfRooms ?? 0) || null,
    area_m2: parseInt(item.livingSpace ?? item.area ?? features.livingSpace ?? 0) || null,
    floor: parseInt(item.floor ?? features.floor ?? 0) || null,
    rent_net: rentNet,
    rent_gross: rentGross,
    additional_costs:
      parseInt(price.additional ?? price.extras ?? price.additionalCosts ?? 0) || null,
    has_garden: Boolean(features.garden ?? item.garden ?? false),
    has_terrace: Boolean(features.terrace ?? item.terrace ?? false),
    has_balcony: Boolean(features.balcony ?? item.balcony ?? features.terrace ?? false),
    has_lift: Boolean(features.elevator ?? features.lift ?? item.elevator ?? false),
    has_own_washer: Boolean(features.washingMachine ?? false),
    has_parking: Boolean(features.garage ?? features.parking ?? item.garage ?? false),
    is_minergie: Boolean(features.minergie ?? item.minergie ?? false),
    is_child_friendly: false,
    property_type: 'wohnung',
    available_from: item.availableFrom ?? item.moveInDate ?? null,
    source: SOURCE_NAME,
    source_url: `https://www.newhome.ch/de/wohnung/mieten/${id}`,
    source_id: id,
    source_ref: item.referenceNumber ?? item.refId ?? null,
    agency_name: item.agency?.name ?? item.advertiser?.name ?? null,
    agency_url: null,
    image_urls: (item.images ?? item.photos ?? []).slice(0, 10).map(
      (img: any) => (typeof img === 'string' ? img : img?.url ?? img?.src ?? null)
    ).filter(Boolean),
    latitude: parseFloat(address.coordinates?.lat ?? address.latitude ?? 0) || null,
    longitude: parseFloat(address.coordinates?.lng ?? address.longitude ?? 0) || null,
    is_active: true,
  };
}

async function scrapeNewhome(): Promise<ScrapedListing[]> {
  const allListings: ScrapedListing[] = [];
  const activeSourceIds: string[] = [];

  for (let page = 1; page <= 10; page++) {
    await rateLimit();

    const pageUrl = page === 1 ? SEARCH_URL : `${SEARCH_URL}&page=${page}`;
    console.log(`[newhome] Lade Seite ${page}`);

    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'WohnungsRadar/1.0 (privat, nicht-kommerziell)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-CH,de;q=0.9',
      },
    });

    if (response.status === 403 || response.status === 429) {
      console.warn(`[newhome] HTTP ${response.status} – Rate limit oder Blockierung`);
      break;
    }

    if (!response.ok) {
      console.error(`[newhome] HTTP ${response.status} auf Seite ${page}`);
      break;
    }

    const html = await response.text();
    const nextData = extractNextData(html);

    if (!nextData) {
      console.warn('[newhome] Kein __NEXT_DATA__ gefunden – Seitenstruktur geändert?');
      break;
    }

    // Pfad kann je nach Newhome-Version variieren
    const resultsRaw =
      nextData?.props?.pageProps?.listings ??
      nextData?.props?.pageProps?.searchResults ??
      nextData?.props?.pageProps?.results ??
      nextData?.props?.pageProps?.data?.listings ??
      nextData?.props?.pageProps?.data?.results;

    const rawListings: any[] = Array.isArray(resultsRaw)
      ? resultsRaw
      : deepFindListings(nextData);

    if (rawListings.length === 0) {
      console.log(`[newhome] Keine Inserate auf Seite ${page} – fertig`);
      break;
    }

    for (const raw of rawListings) {
      const listing = mapToListing(raw);
      if (!listing) continue;
      // PLZ-Filter: nur Bern und Agglomeration
      if (listing.zip_code && !TARGET_ZIP_CODES.has(listing.zip_code)) continue;
      allListings.push(listing);
      if (listing.source_id) activeSourceIds.push(listing.source_id);
    }

    console.log(`[newhome] Seite ${page}: ${rawListings.length} Inserate gesehen`);
  }

  // Inserate die nicht mehr erscheinen als inaktiv markieren
  await deactivateMissing(SOURCE_NAME, activeSourceIds);
  return allListings;
}

serve(async (_req) => {
  try {
    console.log('[newhome] Starte Scraping...');
    const listings = await scrapeNewhome();
    const result = await runScraper(SOURCE_NAME, listings);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = String(err);
    console.error('[newhome] Unerwarteter Fehler:', msg);
    await updateSourceError(SOURCE_NAME, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
