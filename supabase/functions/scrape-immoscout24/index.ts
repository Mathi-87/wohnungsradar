/**
 * ImmoScout24 Scraper – Supabase Edge Function
 *
 * immoscout24.ch ist die zweitgrösste Immobilienplattform der Schweiz.
 * Parst __NEXT_DATA__ via Regex (kein cheerio nötig).
 *
 * Hinweis: Falls ImmoScout24 mit 403 antwortet, blockieren sie den Scraper.
 * In diesem Fall müsste auf Puppeteer/Playwright gewechselt werden.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { runScraper, rateLimit, updateSourceError } from '../_shared/base-scraper.ts';
import { deactivateMissing } from '../_shared/deduplicator.ts';
import type { ScrapedListing } from '../_shared/types.ts';

const SOURCE_NAME = 'immoscout24';
const SEARCH_URL = 'https://www.immoscout24.ch/de/wohnung/mieten/kanton-bern';

const TARGET_ZIP_CODES = new Set([
  '3000','3001','3002','3003','3004','3005','3006','3007','3008','3009',
  '3010','3011','3012','3013','3014','3015','3018','3027','3084','3097','3098',
  '3063','3072','3073','3074','3075','3076','3077','3078',
]);

function extractNextData(html: string): any | null {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function mapNextDataItem(item: any): ScrapedListing | null {
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
    is_minergie: Boolean(props.minergie),
    is_child_friendly: false,
    property_type: 'wohnung',
    available_from: listing.availableFrom ?? null,
    source: SOURCE_NAME,
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

async function scrapeImmoScout24(): Promise<ScrapedListing[]> {
  const allListings: ScrapedListing[] = [];
  const activeSourceIds: string[] = [];

  const params = new URLSearchParams({ 'nrf': '4', 'xrf': '7', 'mgpr': '3500' });

  for (let page = 1; page <= 10; page++) {
    await rateLimit();

    params.set('pn', String(page));
    const pageUrl = `${SEARCH_URL}?${params.toString()}`;
    console.log(`[immoscout24] Lade Seite ${page}`);

    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'WohnungsRadar/1.0 (privat, nicht-kommerziell)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-CH,de;q=0.9',
      },
    });

    if (response.status === 403) {
      console.warn('[immoscout24] ⚠️  403 Zugriff verweigert – ImmoScout24 blockiert Scraping');
      break;
    }

    if (!response.ok) {
      console.error(`[immoscout24] HTTP ${response.status} auf Seite ${page}`);
      break;
    }

    const html = await response.text();
    const nextData = extractNextData(html);

    if (!nextData) {
      console.warn('[immoscout24] Kein __NEXT_DATA__ gefunden');
      break;
    }

    const results =
      nextData?.props?.pageProps?.searchResult?.listingResultItems ??
      nextData?.props?.pageProps?.listings ??
      nextData?.props?.pageProps?.data?.results ??
      [];

    if (!Array.isArray(results) || results.length === 0) {
      console.log(`[immoscout24] Keine Inserate auf Seite ${page} – fertig`);
      break;
    }

    for (const item of results) {
      const listing = mapNextDataItem(item);
      if (!listing) continue;
      if (listing.zip_code && !TARGET_ZIP_CODES.has(listing.zip_code.substring(0, 4))) continue;
      allListings.push(listing);
      if (listing.source_id) activeSourceIds.push(listing.source_id);
    }

    console.log(`[immoscout24] Seite ${page}: ${results.length} Inserate`);
  }

  await deactivateMissing(SOURCE_NAME, activeSourceIds);
  return allListings;
}

serve(async (_req) => {
  try {
    console.log('[immoscout24] Starte Scraping...');
    const listings = await scrapeImmoScout24();
    const result = await runScraper(SOURCE_NAME, listings);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = String(err);
    console.error('[immoscout24] Unerwarteter Fehler:', msg);
    await updateSourceError(SOURCE_NAME, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
