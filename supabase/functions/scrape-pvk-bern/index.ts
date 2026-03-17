/**
 * PVK Bern Scraper – Supabase Edge Function
 *
 * Die Pensionskasse des Kantons Bern (PVK Bern) verwaltet ca. 1550 Wohnungen
 * in Bern und der Umgebung. Inserate werden auf der eigenen Website gelistet.
 *
 * Strategie:
 * 1. JSON-LD Daten suchen
 * 2. HTML-Blöcke mit typischen CMS-Mustern parsen
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { runScraper, rateLimit, updateSourceError } from '../_shared/base-scraper.ts';
import { deactivateMissing } from '../_shared/deduplicator.ts';
import {
  extractBlocks, extractJsonLd, parseJsonLdListing,
  stripHtml, extractRooms, extractArea, extractRent, extractZip, extractDate,
} from '../_shared/html-parser.ts';
import type { ScrapedListing } from '../_shared/types.ts';

const SOURCE_NAME = 'pvk_bern';
const BASE_URL = 'https://www.pvkbern.ch';
const SEARCH_URL = 'https://www.pvkbern.ch/topics/vermoegensanlagen/immobilien/';

function makeSourceId(href: string): string {
  const parts = href.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || href.slice(-20);
}

function absoluteUrl(href: string): string {
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return BASE_URL + href;
  return BASE_URL + '/' + href;
}

function blockToListing(block: string, fallbackUrl: string): ScrapedListing | null {
  const text = stripHtml(block);
  if (!text || text.length < 20) return null;

  const linkMatch = block.match(/href="([^"]+)"/i);
  const href = linkMatch ? absoluteUrl(linkMatch[1]) : fallbackUrl;
  const id = makeSourceId(href);

  const titleMatch = block.match(/<(?:h[1-4]|strong)[^>]*>([\s\S]*?)<\/(?:h[1-4]|strong)>/i);
  const title = titleMatch ? stripHtml(titleMatch[1]) : text.substring(0, 80);
  if (!title || title.length < 5) return null;

  const rooms     = extractRooms(text);
  const area      = extractArea(text);
  const rent      = extractRent(text);
  const zip       = extractZip(text);
  const available = extractDate(text);

  if (!rooms && !area && !rent) return null;

  const addrMatch = text.match(/\b3\d{3}\b\s+([A-Za-zÄÖÜäöü\s\-]+?)(?:\s{2,}|\n|,|$)/);
  const city = addrMatch ? addrMatch[1].trim() : 'Bern';

  return {
    title,
    description: text.substring(0, 500),
    address: null,
    zip_code: zip,
    city,
    district: null,
    rooms,
    area_m2: area,
    floor: null,
    rent_net: null,
    rent_gross: rent,
    additional_costs: null,
    has_garden:      /garten/i.test(text),
    has_terrace:     /terrasse/i.test(text),
    has_balcony:     /balkon|terrasse/i.test(text),
    has_lift:        /lift|aufzug/i.test(text),
    has_own_washer:  /waschmaschine|waschturm/i.test(text),
    has_parking:     /parkplatz|garage|einstellplatz/i.test(text),
    is_minergie:     /minergie/i.test(text),
    is_child_friendly: /kinderfre|spielplatz/i.test(text),
    property_type: 'wohnung',
    available_from: available,
    source: SOURCE_NAME,
    source_url: href,
    source_id: id,
    source_ref: null,
    agency_name: 'PVK Bern',
    agency_url: BASE_URL,
    image_urls: [],
    latitude: null,
    longitude: null,
    is_active: true,
  };
}

async function scrapePvkBern(): Promise<ScrapedListing[]> {
  await rateLimit();
  console.log(`[${SOURCE_NAME}] Lade ${SEARCH_URL}`);

  const response = await fetch(SEARCH_URL, {
    headers: {
      'User-Agent': 'WohnungsRadar/1.0 (privat, nicht-kommerziell)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'de-CH,de;q=0.9',
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  const listings: ScrapedListing[] = [];
  const activeIds: string[] = [];

  // 1. JSON-LD
  for (const obj of extractJsonLd(html)) {
    const parsed = parseJsonLdListing(obj);
    if (!parsed?.title) continue;
    const id = makeSourceId(parsed.title);
    listings.push({
      title: parsed.title,
      description: parsed.description ?? null,
      address: parsed.address ?? null,
      zip_code: parsed.zip_code ?? null,
      city: parsed.city ?? 'Bern',
      district: null,
      rooms: parsed.rooms ?? null,
      area_m2: parsed.area_m2 ?? null,
      floor: null,
      rent_net: null,
      rent_gross: parsed.rent_gross ?? null,
      additional_costs: null,
      has_garden: false, has_terrace: false, has_balcony: false,
      has_lift: false, has_own_washer: false, has_parking: false,
      is_minergie: false, is_child_friendly: false,
      property_type: 'wohnung',
      available_from: parsed.available_from ?? null,
      source: SOURCE_NAME,
      source_url: SEARCH_URL,
      source_id: id,
      source_ref: null,
      agency_name: 'PVK Bern',
      agency_url: BASE_URL,
      image_urls: parsed.image_urls ?? [],
      latitude: parsed.latitude ?? null,
      longitude: parsed.longitude ?? null,
      is_active: true,
    });
    activeIds.push(id);
  }

  // 2. HTML-Blöcke
  if (listings.length === 0) {
    const patterns: Array<[RegExp, string]> = [
      [/<article[^>]*class="[^"]*(?:listing|objekt|property|item|immobilie)[^"]*"/i, 'article'],
      [/<div[^>]*class="[^"]*(?:listing|objekt|property|item|immobilie|wohnung)[^"]*"/i, 'div'],
      [/<li[^>]*class="[^"]*(?:listing|objekt|property|item)[^"]*"/i, 'li'],
    ];
    for (const [pattern, tag] of patterns) {
      const blocks = extractBlocks(html, pattern, tag);
      if (!blocks.length) continue;
      console.log(`[${SOURCE_NAME}] ${blocks.length} Blöcke (${tag}) gefunden`);
      for (const block of blocks) {
        const l = blockToListing(block, SEARCH_URL);
        if (!l) continue;
        listings.push(l);
        if (l.source_id) activeIds.push(l.source_id);
      }
      if (listings.length > 0) break;
    }
  }

  if (listings.length === 0) {
    console.log(`[${SOURCE_NAME}] Keine Inserate – möglicherweise leer oder JS-Rendering`);
  }

  await deactivateMissing(SOURCE_NAME, activeIds);
  return listings;
}

serve(async (_req) => {
  try {
    console.log(`[${SOURCE_NAME}] Starte Scraping...`);
    const listings = await scrapePvkBern();
    const result = await runScraper(SOURCE_NAME, listings);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = String(err);
    console.error(`[${SOURCE_NAME}] Fehler:`, msg);
    await updateSourceError(SOURCE_NAME, msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
