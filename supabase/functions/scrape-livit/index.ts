/**
 * Livit Scraper – Supabase Edge Function
 *
 * Livit ist eine grosse Schweizer Immobilienverwaltung mit vielen Objekten
 * im Raum Bern. Die Website basiert auf Next.js, weshalb wir zuerst den
 * __NEXT_DATA__-Block versuchen. Falls dieser fehlt oder leer ist, parsen
 * wir das HTML direkt mit Regex-Blöcken.
 *
 * PLZ-Filter ist aktiv, da Livit national tätig ist.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { runScraper, rateLimit, updateSourceError } from '../_shared/base-scraper.ts';
import { deactivateMissing } from '../_shared/deduplicator.ts';
import {
  extractBlocks,
  extractJsonLd,
  parseJsonLdListing,
  stripHtml,
  extractRooms,
  extractArea,
  extractRent,
  extractZip,
  extractDate,
} from '../_shared/html-parser.ts';
import type { ScrapedListing } from '../_shared/types.ts';

const SOURCE_NAME = 'livit';
const SEARCH_URL = 'https://www.livit.ch/de/mieten/wohnungen/?cantons=BE';
const BASE_URL = 'https://www.livit.ch';

// PLZ-Codes für Bern und die Agglomeration (Grossraum Bern)
const BERN_ZIPS = new Set([
  '3000','3001','3002','3003','3004','3005','3006','3007','3008','3009',
  '3010','3011','3012','3013','3014','3015','3018','3027','3084','3097','3098',
  '3063','3072','3073','3074','3075','3076','3077','3078',
]);

// Extrahiert das __NEXT_DATA__ JSON aus dem HTML (Next.js SSR-Block)
function extractNextData(html: string): any | null {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// Sucht rekursiv nach einem Listings-Array im Next.js JSON
function deepFindListings(obj: any, depth = 0): any[] {
  if (depth > 10 || !obj || typeof obj !== 'object') return [];
  // Livit könnte Objekte als Array mit id-Feld liefern
  if (Array.isArray(obj) && obj.length > 0 && (obj[0]?.id || obj[0]?.objectId || obj[0]?.slug)) {
    return obj;
  }
  for (const key of Object.keys(obj)) {
    const result = deepFindListings(obj[key], depth + 1);
    if (result.length > 0) return result;
  }
  return [];
}

// Baut die vollständige URL aus einem relativen oder absoluten Pfad
function buildUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return `${BASE_URL}${href}`;
  return `${BASE_URL}/${href}`;
}

// Erstellt eine stabile source_id aus einem URL-Pfad oder Text-Hash
function makeSourceId(href: string, fallback: string): string {
  if (href) {
    // Letztes Pfadsegment als ID, z.B. "/de/mieten/wohnungen/3001-bern-12345" → "12345"
    const parts = href.replace(/\/$/, '').split('/');
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  // Fallback: einfacher Hash aus dem Text
  let hash = 0;
  for (let i = 0; i < fallback.length; i++) {
    hash = (hash * 31 + fallback.charCodeAt(i)) & 0x7fffffff;
  }
  return `livit-${hash}`;
}

// Mappt ein Next.js Listing-Objekt auf das interne ScrapedListing-Format
function mapNextDataItem(item: any): ScrapedListing | null {
  if (!item || typeof item !== 'object') return null;

  const id = String(item.id ?? item.objectId ?? item.slug ?? '');
  if (!id) return null;

  const address = item.address ?? item.location ?? {};
  const prices = item.prices ?? item.rent ?? item.cost ?? {};
  const props = item.characteristics ?? item.properties ?? item.features ?? {};

  // Relativer oder absoluter Link zum Inserat
  const relHref = item.url ?? item.detailUrl ?? item.href ?? item.path ?? '';
  const sourceUrl = relHref
    ? buildUrl(relHref)
    : `${BASE_URL}/de/mieten/wohnungen/${id}`;

  return {
    title: item.title ?? item.name ?? item.description?.substring(0, 100) ?? 'Wohnung',
    description: item.description ?? item.text ?? null,
    address: [address.street, address.houseNumber ?? address.streetNumber]
      .filter(Boolean).join(' ') || null,
    zip_code: String(address.zip ?? address.zipCode ?? address.postalCode ?? ''),
    city: address.city ?? address.locality ?? null,
    rooms: parseFloat(props.rooms ?? props.numberOfRooms ?? 0) || null,
    area_m2: parseInt(props.area ?? props.livingSpace ?? props.floorSize ?? 0) || null,
    floor: parseInt(props.floor ?? props.floorLevel ?? 0) || null,
    rent_net: parseInt(prices.net ?? prices.netRent ?? prices.netto ?? 0) || null,
    rent_gross: parseInt(prices.gross ?? prices.grossRent ?? prices.brutto ?? prices.total ?? 0) || null,
    additional_costs: parseInt(prices.extra ?? prices.additionalCosts ?? prices.nebenkosten ?? 0) || null,
    has_balcony: Boolean(props.balcony ?? props.balkon ?? false),
    has_garden: Boolean(props.garden ?? props.garten ?? false),
    has_terrace: Boolean(props.terrace ?? props.terrasse ?? false),
    has_lift: Boolean(props.elevator ?? props.lift ?? props.aufzug ?? false),
    has_parking: Boolean(props.garage ?? props.parking ?? props.parkplatz ?? false),
    property_type: 'wohnung',
    available_from: item.availableFrom ?? item.moveInDate ?? null,
    image_urls: (item.images ?? item.photos ?? [])
      .slice(0, 10)
      .map((img: any) => img?.url ?? img?.src ?? img),
    latitude: parseFloat(address.lat ?? address.latitude ?? 0) || null,
    longitude: parseFloat(address.lng ?? address.lon ?? address.longitude ?? 0) || null,
    source: SOURCE_NAME,
    source_url: sourceUrl,
    source_id: id,
    source_ref: item.referenceNumber ?? item.refNr ?? null,
    agency_name: 'Livit AG',
    is_active: true,
  };
}

async function scrapeLivit(): Promise<ScrapedListing[]> {
  const listings: ScrapedListing[] = [];
  const activeIds: string[] = [];

  await rateLimit();
  console.log('[livit] Lade Suchseite...');

  const response = await fetch(SEARCH_URL, {
    headers: {
      'User-Agent': 'WohnungsRadar/1.0 (privat, nicht-kommerziell)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'de-CH,de;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  // ── 1. Versuch: Next.js __NEXT_DATA__ ────────────────────────────────────
  const nextData = extractNextData(html);

  if (nextData) {
    console.log('[livit] __NEXT_DATA__ gefunden, suche Inserate...');

    // Bekannte Pfade in der Next.js Struktur versuchen
    const rawListings: any[] =
      nextData?.props?.pageProps?.listings ??
      nextData?.props?.pageProps?.results ??
      nextData?.props?.pageProps?.data?.listings ??
      nextData?.props?.pageProps?.data?.results ??
      deepFindListings(nextData);

    if (rawListings.length > 0) {
      console.log(`[livit] ${rawListings.length} Inserate via __NEXT_DATA__ gefunden`);

      for (const raw of rawListings) {
        const listing = mapNextDataItem(raw);
        if (!listing) continue;

        // PLZ-Filter: nur Grossraum Bern behalten
        const zip4 = (listing.zip_code ?? '').substring(0, 4);
        if (zip4 && !BERN_ZIPS.has(zip4)) continue;

        listings.push(listing);
        if (listing.source_id) activeIds.push(listing.source_id);
      }

      await deactivateMissing(SOURCE_NAME, activeIds);
      return listings;
    }
  }

  // ── 2. Versuch: JSON-LD ───────────────────────────────────────────────────
  console.log('[livit] Kein __NEXT_DATA__ – versuche JSON-LD...');
  const jsonLdObjects = extractJsonLd(html);

  for (const obj of jsonLdObjects) {
    const parsed = parseJsonLdListing(obj);
    if (!parsed) continue;

    const zip4 = (parsed.zip_code ?? '').substring(0, 4);
    if (zip4 && !BERN_ZIPS.has(zip4)) continue;

    // URL aus JSON-LD extrahieren (falls vorhanden)
    const href = obj?.url ?? '';
    const sourceUrl = buildUrl(href) || SEARCH_URL;
    const sourceId = makeSourceId(href, parsed.title ?? '');

    listings.push({
      title: parsed.title ?? 'Wohnung',
      description: parsed.description ?? null,
      address: parsed.address ?? null,
      zip_code: parsed.zip_code ?? null,
      city: parsed.city ?? null,
      rooms: parsed.rooms ?? null,
      area_m2: parsed.area_m2 ?? null,
      rent_gross: parsed.rent_gross ?? null,
      image_urls: parsed.image_urls ?? [],
      available_from: parsed.available_from ?? null,
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      property_type: 'wohnung',
      agency_name: 'Livit AG',
      source: SOURCE_NAME,
      source_url: sourceUrl,
      source_id: sourceId,
      is_active: true,
    });
    activeIds.push(sourceId);
  }

  // ── 3. Versuch: HTML-Blöcke parsen ──────────────────────────────────────
  if (listings.length === 0) {
    console.log('[livit] Kein JSON-LD – parse HTML-Blöcke...');

    const blocks = extractBlocks(
      html,
      /<article[^>]*class="[^"]*(?:property|listing|object|objekt)[^"]*"/i,
      'article',
    );

    console.log(`[livit] ${blocks.length} HTML-Blöcke gefunden`);

    for (const block of blocks) {
      const text = stripHtml(block);

      // Link zum Detailinserat extrahieren
      const hrefMatch = block.match(/href="([^"]*(?:mieten|wohnung|objekt|detail)[^"]*)"/i);
      const href = hrefMatch ? hrefMatch[1] : '';
      const sourceUrl = buildUrl(href) || SEARCH_URL;
      const sourceId = makeSourceId(href, text);

      // Adresse: erste Zeile die wie eine Adresse aussieht
      const addrMatch = text.match(/([A-ZÄÖÜ][a-zäöüß]+(?:strasse|gasse|weg|allee|platz|rain|matte)\s+\d+[a-z]?)/i);

      // PLZ aus dem Text
      const zip = extractZip(text);
      if (zip && !BERN_ZIPS.has(zip)) continue;

      const rooms = extractRooms(text);
      const area = extractArea(text);
      const rent = extractRent(text);

      // Mindestanforderung: zumindest Miete oder Zimmer müssen vorhanden sein
      if (!rooms && !rent && !area) continue;

      listings.push({
        title: text.substring(0, 120) || 'Wohnung',
        address: addrMatch ? addrMatch[1] : null,
        zip_code: zip,
        rooms,
        area_m2: area,
        rent_gross: rent,
        available_from: extractDate(text),
        property_type: 'wohnung',
        agency_name: 'Livit AG',
        source: SOURCE_NAME,
        source_url: sourceUrl,
        source_id: sourceId,
        is_active: true,
      });
      activeIds.push(sourceId);
    }
  }

  console.log(`[livit] Total ${listings.length} Inserate gesammelt`);
  await deactivateMissing(SOURCE_NAME, activeIds);
  return listings;
}

serve(async (_req) => {
  try {
    console.log('[livit] Starte Scraping...');
    const listings = await scrapeLivit();
    const result = await runScraper(SOURCE_NAME, listings);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = String(err);
    console.error('[livit] Unerwarteter Fehler:', msg);
    await updateSourceError(SOURCE_NAME, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
