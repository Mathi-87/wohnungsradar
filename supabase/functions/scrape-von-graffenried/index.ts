/**
 * Von Graffenried Liegenschaften Scraper – Supabase Edge Function
 *
 * Lokale Berner Liegenschaftsverwaltung (graffenried-liegenschaften.ch).
 * Alle Objekte sind im Raum Bern/Köniz, daher ist kein PLZ-Filter nötig.
 *
 * Strategie:
 * 1. JSON-LD versuchen
 * 2. HTML-Blöcke parsen (<article> oder <div> mit property/listing/objekt/wohnung)
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

const SOURCE_NAME = 'von_graffenried';
const SEARCH_URL = 'https://www.graffenried-liegenschaften.ch/wohnungen-mieten/';
const BASE_URL = 'https://www.graffenried-liegenschaften.ch';

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
    const parts = href.replace(/\/$/, '').split('/');
    const last = parts[parts.length - 1];
    if (last && last.length > 2) return `vg-${last}`;
  }
  // Fallback: djb2-ähnlicher Hash
  let hash = 5381;
  for (let i = 0; i < Math.min(fallback.length, 200); i++) {
    hash = ((hash * 33) ^ fallback.charCodeAt(i)) & 0x7fffffff;
  }
  return `vg-${hash}`;
}

async function scrapeVonGraffenried(): Promise<ScrapedListing[]> {
  const listings: ScrapedListing[] = [];
  const activeIds: string[] = [];

  await rateLimit();
  console.log('[von_graffenried] Lade Suchseite...');

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
  console.log('[von_graffenried] Suche JSON-LD...');
  const jsonLdObjects = extractJsonLd(html);

  for (const obj of jsonLdObjects) {
    const parsed = parseJsonLdListing(obj);
    if (!parsed) continue;

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
      agency_name: 'Von Graffenried Liegenschaften',
      source: SOURCE_NAME,
      source_url: sourceUrl,
      source_id: sourceId,
      is_active: true,
    });
    activeIds.push(sourceId);
  }

  if (jsonLdObjects.length > 0) {
    console.log(`[von_graffenried] ${listings.length} Inserate via JSON-LD gefunden`);
  }

  // ── 2. Versuch: HTML-Blöcke parsen ──────────────────────────────────────
  if (listings.length === 0) {
    console.log('[von_graffenried] Kein JSON-LD – parse HTML-Blöcke...');

    // Zuerst <article>-Tags versuchen
    let blocks = extractBlocks(
      html,
      /<article[^>]*class="[^"]*(?:property|listing|objekt|wohnung)[^"]*"/i,
      'article',
    );

    // Fallback: <div>-Tags
    if (blocks.length === 0) {
      blocks = extractBlocks(
        html,
        /<div[^>]*class="[^"]*(?:property|listing|objekt|wohnung)[^"]*"/i,
        'div',
      );
    }

    console.log(`[von_graffenried] ${blocks.length} HTML-Blöcke gefunden`);

    for (const block of blocks) {
      const text = stripHtml(block);

      if (text.length < 30) continue;

      // Link zum Detailinserat extrahieren
      const hrefMatch = block.match(/href="([^"]*(?:wohnung|mieten|objekt|detail|liegenschaft)[^"]*)"/i);
      const href = hrefMatch ? hrefMatch[1] : '';
      const sourceUrl = buildUrl(href) || SEARCH_URL;
      const sourceId = makeSourceId(href, text);

      // Adresse extrahieren
      const addrMatch = text.match(/([A-ZÄÖÜ][a-zäöüß]+(?:strasse|gasse|weg|allee|platz|rain|matte)\s+\d+[a-z]?)/i);

      const zip = extractZip(text);
      const rooms = extractRooms(text);
      const area = extractArea(text);
      const rent = extractRent(text);

      // Mindestanforderung
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
        agency_name: 'Von Graffenried Liegenschaften',
        source: SOURCE_NAME,
        source_url: sourceUrl,
        source_id: sourceId,
        is_active: true,
      });
      activeIds.push(sourceId);
    }
  }

  console.log(`[von_graffenried] Total ${listings.length} Inserate gesammelt`);
  await deactivateMissing(SOURCE_NAME, activeIds);
  return listings;
}

serve(async (_req) => {
  try {
    console.log('[von_graffenried] Starte Scraping...');
    const listings = await scrapeVonGraffenried();
    const result = await runScraper(SOURCE_NAME, listings);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = String(err);
    console.error('[von_graffenried] Unerwarteter Fehler:', msg);
    await updateSourceError(SOURCE_NAME, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
