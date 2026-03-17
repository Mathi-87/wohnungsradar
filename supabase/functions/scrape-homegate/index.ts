/**
 * Homegate Scraper – Supabase Edge Function
 *
 * homegate.ch ist die grösste Immobilienplattform der Schweiz.
 * Die Seite nutzt Next.js SSR und bettet Daten als JSON im HTML ein
 * (<script id="__NEXT_DATA__">). Wir lesen diesen Block per Regex aus,
 * ohne einen Browser oder cheerio zu benötigen.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { runScraper, rateLimit, updateSourceError } from '../_shared/base-scraper.ts';
import { deactivateMissing } from '../_shared/deduplicator.ts';
import type { ScrapedListing } from '../_shared/types.ts';

const SOURCE_NAME = 'homegate';
const BASE_URL = 'https://www.homegate.ch/mieten/wohnung/kanton-bern/trefferliste';

// PLZ-Codes für Bern und Agglomeration
const TARGET_ZIP_CODES = new Set([
  '3000','3001','3002','3003','3004','3005','3006','3007','3008','3009',
  '3010','3011','3012','3013','3014','3015','3018','3027','3084','3097','3098',
  '3063','3072','3073','3074','3075','3076','3077','3078',
]);

// Extrahiert das __NEXT_DATA__ JSON aus dem HTML (ohne cheerio, nur Regex)
function extractNextData(html: string): any | null {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// Sucht rekursiv nach einem Listings-Array im JSON (Fallback bei Strukturänderungen)
function deepFindListings(obj: any, depth = 0): any[] {
  if (depth > 10 || !obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj) && obj.length > 0 && obj[0]?.listing?.id) {
    return obj.map((item: any) => item.listing);
  }
  for (const key of Object.keys(obj)) {
    const result = deepFindListings(obj[key], depth + 1);
    if (result.length > 0) return result;
  }
  return [];
}

function mapToListing(item: any): ScrapedListing | null {
  if (!item || typeof item !== 'object') return null;
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
    is_minergie: Boolean(properties.minergie ?? false),
    is_child_friendly: false,
    property_type: 'wohnung',
    available_from: item.availableFrom ?? null,
    source: SOURCE_NAME,
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

async function scrapeHomegate(): Promise<ScrapedListing[]> {
  const allListings: ScrapedListing[] = [];
  const activeSourceIds: string[] = [];

  const params = new URLSearchParams({ 'ac': '4', 'ah': '7', 'ag': '3500', 'ot': '1' });
  const baseUrl = `${BASE_URL}?${params.toString()}`;

  for (let page = 1; page <= 10; page++) {
    await rateLimit();

    const pageUrl = page === 1 ? baseUrl : `${baseUrl}&ep=${page}`;
    console.log(`[homegate] Lade Seite ${page}`);

    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'WohnungsRadar/1.0 (privat, nicht-kommerziell)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-CH,de;q=0.9',
      },
    });

    if (!response.ok) {
      console.error(`[homegate] HTTP ${response.status} auf Seite ${page}`);
      break;
    }

    const html = await response.text();
    const nextData = extractNextData(html);

    if (!nextData) {
      console.warn('[homegate] Kein __NEXT_DATA__ gefunden – Struktur geändert?');
      break;
    }

    const resultsRaw =
      nextData?.props?.pageProps?.searchResult ??
      nextData?.props?.pageProps?.listings ??
      nextData?.props?.pageProps?.data?.results;

    const rawListings: any[] = Array.isArray(resultsRaw)
      ? resultsRaw
      : deepFindListings(nextData);

    if (rawListings.length === 0) {
      console.log(`[homegate] Keine Inserate auf Seite ${page} – fertig`);
      break;
    }

    for (const raw of rawListings) {
      const listing = mapToListing(raw);
      if (!listing) continue;
      if (listing.zip_code && !TARGET_ZIP_CODES.has(listing.zip_code.substring(0, 4))) continue;
      allListings.push(listing);
      if (listing.source_id) activeSourceIds.push(listing.source_id);
    }

    console.log(`[homegate] Seite ${page}: ${rawListings.length} Inserate`);
  }

  await deactivateMissing(SOURCE_NAME, activeSourceIds);
  return allListings;
}

serve(async (_req) => {
  try {
    console.log('[homegate] Starte Scraping...');
    const listings = await scrapeHomegate();
    const result = await runScraper(SOURCE_NAME, listings);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = String(err);
    console.error('[homegate] Unerwarteter Fehler:', msg);
    await updateSourceError(SOURCE_NAME, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
