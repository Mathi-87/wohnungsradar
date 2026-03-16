/**
 * Stadt Bern Mietobjekte Scraper – Supabase Edge Function
 *
 * Die Stadt Bern publiziert ihre städtischen Mietwohnungen auf der offiziellen
 * Website bern.ch. Die Seite basiert auf einem Standard-CMS (wahrscheinlich
 * Liferay oder ähnlich) und verwendet einfaches HTML ohne JavaScript-Framework.
 *
 * Kein PLZ-Filter nötig – alle Objekte sind städtische Wohnungen in Bern.
 *
 * Strategie:
 * 1. JSON-LD versuchen
 * 2. HTML-Blöcke parsen (<article>, <div> oder <li>)
 * 3. Fallback: alle Links die auf Mietobjekte zeigen
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

const SOURCE_NAME = 'immo_stadt_bern';
const SEARCH_URL = 'https://www.bern.ch/themen/wohnen-und-quartiere/wohnraumfoerderung/mietobjekte';
const BASE_URL = 'https://www.bern.ch';

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
    if (last && last.length > 2) return `bern-${last}`;
  }
  // Fallback: djb2-ähnlicher Hash
  let hash = 5381;
  for (let i = 0; i < Math.min(fallback.length, 200); i++) {
    hash = ((hash * 33) ^ fallback.charCodeAt(i)) & 0x7fffffff;
  }
  return `bern-${hash}`;
}

async function scrapeImmStadtBern(): Promise<ScrapedListing[]> {
  const listings: ScrapedListing[] = [];
  const activeIds: string[] = [];

  await rateLimit();
  console.log('[immo_stadt_bern] Lade Seite mit Mietobjekten...');

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
  console.log('[immo_stadt_bern] Suche JSON-LD...');
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
      agency_name: 'Stadt Bern – Immobilien',
      source: SOURCE_NAME,
      source_url: sourceUrl,
      source_id: sourceId,
      is_active: true,
    });
    activeIds.push(sourceId);
  }

  if (jsonLdObjects.length > 0) {
    console.log(`[immo_stadt_bern] ${listings.length} Inserate via JSON-LD gefunden`);
  }

  // ── 2. Versuch: HTML-Blöcke parsen ──────────────────────────────────────
  if (listings.length === 0) {
    console.log('[immo_stadt_bern] Kein JSON-LD – parse HTML-Blöcke...');

    // Versuche <article>-Tags zuerst
    let blocks = extractBlocks(
      html,
      /<article[^>]*class="[^"]*(?:listing|item|mietobjekt|objekt)[^"]*"/i,
      'article',
    );

    // Fallback: <div>-Tags
    if (blocks.length === 0) {
      blocks = extractBlocks(
        html,
        /<div[^>]*class="[^"]*(?:listing|item|mietobjekt|objekt)[^"]*"/i,
        'div',
      );
    }

    // Weiterer Fallback: <li>-Tags
    if (blocks.length === 0) {
      blocks = extractBlocks(
        html,
        /<li[^>]*class="[^"]*(?:listing|item|mietobjekt|objekt)[^"]*"/i,
        'li',
      );
    }

    // Letzter Versuch: Links die auf Wohnungs-/Mietobjekt-Seiten zeigen
    if (blocks.length === 0) {
      const linkMatches = html.matchAll(/href="([^"]*(?:mietobjekt|miet|wohnung|mieten)[^"]*)"[^>]*>([^<]{5,120})</gi);
      for (const m of linkMatches) {
        const href = m[1];
        const title = m[2].trim();
        if (!title || title.length < 5) continue;
        const sourceUrl = buildUrl(href);
        // Nur interne Links (bern.ch)
        if (!sourceUrl.includes('bern.ch')) continue;
        const sourceId = makeSourceId(href, title);
        if (activeIds.includes(sourceId)) continue;

        listings.push({
          title: title.substring(0, 120),
          property_type: 'wohnung',
          agency_name: 'Stadt Bern – Immobilien',
          source: SOURCE_NAME,
          source_url: sourceUrl || SEARCH_URL,
          source_id: sourceId,
          is_active: true,
        });
        activeIds.push(sourceId);
      }
    }

    console.log(`[immo_stadt_bern] ${blocks.length} HTML-Blöcke gefunden`);

    for (const block of blocks) {
      const text = stripHtml(block);

      if (text.length < 30) continue;

      // Link zum Detailinserat
      const hrefMatch = block.match(/href="([^"]*(?:mietobjekt|mieten|wohnung|objekt|detail)[^"]*)"/i);
      const href = hrefMatch ? hrefMatch[1] : '';
      const sourceUrl = buildUrl(href) || SEARCH_URL;
      const sourceId = makeSourceId(href, text);

      if (activeIds.includes(sourceId)) continue;

      // Adresse extrahieren
      const addrMatch = text.match(/([A-ZÄÖÜ][a-zäöüß]+(?:strasse|gasse|weg|allee|platz|rain|matte)\s+\d+[a-z]?)/i);

      const zip = extractZip(text);
      const rooms = extractRooms(text);
      const area = extractArea(text);
      const rent = extractRent(text);

      if (!rooms && !rent && !area) continue;

      listings.push({
        title: text.substring(0, 120) || 'Mietobjekt',
        address: addrMatch ? addrMatch[1] : null,
        zip_code: zip,
        rooms,
        area_m2: area,
        rent_gross: rent,
        available_from: extractDate(text),
        property_type: 'wohnung',
        agency_name: 'Stadt Bern – Immobilien',
        source: SOURCE_NAME,
        source_url: sourceUrl,
        source_id: sourceId,
        is_active: true,
      });
      activeIds.push(sourceId);
    }
  }

  console.log(`[immo_stadt_bern] Total ${listings.length} Inserate gesammelt`);
  await deactivateMissing(SOURCE_NAME, activeIds);
  return listings;
}

serve(async (_req) => {
  try {
    console.log('[immo_stadt_bern] Starte Scraping...');
    const listings = await scrapeImmStadtBern();
    const result = await runScraper(SOURCE_NAME, listings);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = String(err);
    console.error('[immo_stadt_bern] Unerwarteter Fehler:', msg);
    await updateSourceError(SOURCE_NAME, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
