/**
 * Flatfox Scraper – Supabase Edge Function
 *
 * Flatfox (flatfox.ch) hat eine öffentliche JSON-API, die ohne Login zugänglich ist.
 * Wir fragen Wohnungen in der Region Bern ab (via Geo-Bounding-Box).
 *
 * Aufgerufen von: scrape-all (orchestriert alle Scraper)
 * Zeitplan: stündlich via pg_cron → scrape-all
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { runScraper, rateLimit, updateSourceError } from '../_shared/base-scraper.ts';
import { deactivateMissing } from '../_shared/deduplicator.ts';
import type { ScrapedListing } from '../_shared/types.ts';

const SOURCE_NAME = 'flatfox';

// Bounding-Box für Region Bern (ca. 20km Radius)
// Deckt ab: Bern, Köniz, Ostermundigen, Ittigen, Wabern, Liebefeld
const BERN_BOUNDS = { west: 7.2971, east: 7.5858, south: 46.8972, north: 47.0442 };
const PAGE_SIZE = 100;

// Flatfox API Typen
interface FlatfoxResponse {
  count: number;
  next: string | null;
  results: FlatfoxItem[];
}

interface FlatfoxItem {
  pk: number;
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
  living_area: number | null;
  price_display: number | null;
  price_net: number | null;
  price_extra: number | null;
  move_in_date: string | null;
  images: Array<{ url: string }>;
  category: string;
  offer_type: string;
  agency: { name: string | null; url: string | null } | null;
  features?: string[];
  is_available: boolean;
}

function mapToListing(item: FlatfoxItem): ScrapedListing {
  const features = item.features ?? [];
  return {
    title: item.title ?? `Wohnung in ${item.city ?? 'Bern'}`,
    description: item.description,
    address: item.street,
    zip_code: item.zipcode,
    city: item.city,
    district: null,
    rooms: item.rooms,
    area_m2: item.living_area,
    floor: item.floor,
    rent_net: item.price_net,
    rent_gross: item.price_display,
    additional_costs: item.price_extra,
    has_garden: features.includes('GARDEN'),
    has_terrace: features.includes('TERRACE'),
    has_balcony: features.includes('BALCONY') || features.includes('TERRACE'),
    has_lift: features.includes('ELEVATOR'),
    has_own_washer: features.includes('WASHING_MACHINE'),
    has_parking: features.includes('GARAGE') || features.includes('PARKING'),
    is_minergie: features.includes('MINERGIE') || features.includes('MINERGIE_P'),
    is_child_friendly: false,
    property_type: item.category === 'APARTMENT' ? 'wohnung' : item.category.toLowerCase(),
    available_from: item.move_in_date,
    source: SOURCE_NAME,
    source_url: `https://flatfox.ch/de/${item.slug ?? item.pk}/`,
    source_id: String(item.pk),
    agency_name: item.agency?.name ?? null,
    agency_url: item.agency?.url ?? null,
    image_urls: item.images?.slice(0, 10).map(img => img.url) ?? [],
    latitude: item.latitude,
    longitude: item.longitude,
    is_active: item.is_available,
  };
}

async function scrapeFlatfox(): Promise<ScrapedListing[]> {
  const allListings: ScrapedListing[] = [];
  const activeSourceIds: string[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore && offset < 1000) {
    await rateLimit();

    const url = new URL('https://flatfox.ch/api/v1/public-listing/');
    url.searchParams.set('ordering', '-insertion_date');
    url.searchParams.set('west', String(BERN_BOUNDS.west));
    url.searchParams.set('east', String(BERN_BOUNDS.east));
    url.searchParams.set('south', String(BERN_BOUNDS.south));
    url.searchParams.set('north', String(BERN_BOUNDS.north));
    url.searchParams.set('offer_type', 'RENT');
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(offset));

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'WohnungsRadar/1.0 (privat, nicht-kommerziell)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[flatfox] HTTP ${response.status}`);
      break;
    }

    const data: FlatfoxResponse = await response.json();
    console.log(`[flatfox] Seite ${offset / PAGE_SIZE + 1}: ${data.results.length} von ${data.count}`);

    for (const item of data.results) {
      if (item.offer_type !== 'RENT') continue;
      allListings.push(mapToListing(item));
      activeSourceIds.push(String(item.pk));
    }

    hasMore = data.next !== null;
    offset += PAGE_SIZE;
  }

  await deactivateMissing(SOURCE_NAME, activeSourceIds);
  return allListings;
}

serve(async (_req) => {
  try {
    console.log('[flatfox] Starte Scraping...');
    const listings = await scrapeFlatfox();
    const result = await runScraper(SOURCE_NAME, listings);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = String(err);
    console.error('[flatfox] Unerwarteter Fehler:', msg);
    await updateSourceError(SOURCE_NAME, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
