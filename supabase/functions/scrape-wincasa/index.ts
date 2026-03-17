/**
 * Wincasa Scraper – Supabase Edge Function
 *
 * Wincasa ist eine grosse Schweizer Immobilienverwaltung mit Objekten in
 * der gesamten Schweiz. Da das System wahrscheinlich kein Next.js nutzt,
 * versuchen wir zuerst JSON-LD, dann klassisches HTML-Block-Parsing.
 *
 * PLZ-Filter ist aktiv, da Wincasa national tätig ist.
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

const SOURCE_NAME = 'wincasa';
const SEARCH_URL = 'https://www.wincasa.ch/mieten/wohnungen/';
const BASE_URL = 'https://www.wincasa.ch';

// PLZ-Codes für Bern und die Agglomeration (Grossraum Bern)
const BERN_ZIPS = new Set([
  '3000','3001','3002','3003','3004','3005','3006','3007','3008','3009',
  '3010','3011','3012','3013','3014','3015','3018','3027','3084','3097','3098',
  '3063','3072','3073','3074','3075','3076','3077','3078',
]);

// Baut die vollständige URL aus einem relativen oder absoluten Pfad
function buildUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return `${BASE_URL}${href}`;
  return `${BASE_URL}/${href}`;
}

// Erstellt eine stabile source_id aus dem URL-Pfad oder einem Text-Hash
function makeSourceId(href: string, fallback: string): string {
  if (href) {
    // Letztes nicht-leeres Pfadsegment als ID nutzen
    const parts = href.replace(/\/$/, '').split('/');
    const last = parts[parts.length - 1];
    if (last && last.length > 2) return `wincasa-${last}`;
  }
  // Fallback: einfacher djb2-ähnlicher Hash aus dem Text
  let hash = 5381;
  for (let i = 0; i < Math.min(fallback.length, 200); i++) {
    hash = ((hash * 33) ^ fallback.charCodeAt(i)) & 0x7fffffff;
  }
  return `wincasa-${hash}`;
}

async function scrapeWincasa(): Promise<ScrapedListing[]> {
  const listings: ScrapedListing[] = [];
  const activeIds: string[] = [];

  await rateLimit();
  console.log('[wincasa] Lade Suchseite...');

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

  // ── 1. Versuch: JSON-LD ───────────────────────────────────────────────────
  console.log('[wincasa] Suche JSON-LD...');
  const jsonLdObjects = extractJsonLd(html);

  for (const obj of jsonLdObjects) {
    const parsed = parseJsonLdListing(obj);
    if (!parsed) continue;

    // PLZ-Filter anwenden
    const zip4 = (parsed.zip_code ?? '').substring(0, 4);
    if (zip4 && !BERN_ZIPS.has(zip4)) continue;

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
      agency_name: 'Wincasa AG',
      source: SOURCE_NAME,
      source_url: sourceUrl,
      source_id: sourceId,
      is_active: true,
    });
    activeIds.push(sourceId);
  }

  if (jsonLdObjects.length > 0) {
    console.log(`[wincasa] ${listings.length} Inserate via JSON-LD gefunden`);
  }

  // ── 2. Versuch: HTML-Blöcke parsen ──────────────────────────────────────
  if (listings.length === 0) {
    console.log('[wincasa] Kein JSON-LD – parse HTML-Blöcke...');

    // Wincasa nutzt typischerweise <div class="...object..."> oder ähnliche Klassen
    const blocks = extractBlocks(
      html,
      /<div[^>]*class="[^"]*(?:object|property|listing|immobilie)[^"]*"/i,
      'div',
    );

    console.log(`[wincasa] ${blocks.length} HTML-Blöcke gefunden`);

    for (const block of blocks) {
      const text = stripHtml(block);

      // Mindestlänge: zu kurze Blöcke überspringen (vermutlich Layout-Divs)
      if (text.length < 30) continue;

      // Link zum Detailinserat extrahieren
      const hrefMatch = block.match(/href="([^"]*(?:mieten|wohnung|objekt|detail|immobilie)[^"]*)"/i);
      const href = hrefMatch ? hrefMatch[1] : '';
      const sourceUrl = buildUrl(href) || SEARCH_URL;
      const sourceId = makeSourceId(href, text);

      // PLZ aus dem Text
      const zip = extractZip(text);
      if (zip && !BERN_ZIPS.has(zip)) continue;

      // Adresse: Zeile die nach einer Strassenadresse aussieht
      const addrMatch = text.match(/([A-ZÄÖÜ][a-zäöüß]+(?:strasse|gasse|weg|allee|platz|rain|matte|boden)\s+\d+[a-z]?)/i);

      const rooms = extractRooms(text);
      const area = extractArea(text);
      const rent = extractRent(text);

      // Mindestanforderung: zumindest ein Merkmal muss vorhanden sein
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
        agency_name: 'Wincasa AG',
        source: SOURCE_NAME,
        source_url: sourceUrl,
        source_id: sourceId,
        is_active: true,
      });
      activeIds.push(sourceId);
    }
  }

  console.log(`[wincasa] Total ${listings.length} Inserate gesammelt`);
  await deactivateMissing(SOURCE_NAME, activeIds);
  return listings;
}

serve(async (_req) => {
  try {
    console.log('[wincasa] Starte Scraping...');
    const listings = await scrapeWincasa();
    const result = await runScraper(SOURCE_NAME, listings);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = String(err);
    console.error('[wincasa] Unerwarteter Fehler:', msg);
    await updateSourceError(SOURCE_NAME, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
