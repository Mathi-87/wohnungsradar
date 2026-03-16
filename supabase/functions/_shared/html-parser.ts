/**
 * HTML-Parser Utilities für Verwaltungs- und Genossenschafts-Scraper
 *
 * Da diese Websites kein standardisiertes JSON anbieten, extrahieren wir
 * Daten aus dem HTML-Quelltext per Regex. Die Funktionen sind defensiv
 * und geben bei keinem Treffer null zurück (kein Crash).
 */

// ── Zahlenwerte extrahieren ──────────────────────────────────

/** Zimmeranzahl (z.B. "4.5 Zimmer", "4,5 Zi.", "4.5-Zi-Wohnung") */
export function extractRooms(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*[-]?\s*(?:Zimmer|Zi\.|Räume?|Rooms?)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return isNaN(n) || n > 20 ? null : n;
}

/** Fläche in m² (z.B. "120 m²", "ca. 120 qm", "120m2") */
export function extractArea(text: string): number | null {
  const m = text.match(/(?:ca\.?\s*)?(\d+(?:[.,]\d+)?)\s*(?:m²|m2|qm)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return isNaN(n) || n > 1000 ? null : n;
}

/**
 * Mietpreis in CHF extrahieren.
 * Erkennt: "CHF 2'500.–", "Fr. 2500.-", "2'500 CHF/Mt.", "Mietzins: 2500"
 */
export function extractRent(text: string): number | null {
  // CHF/Fr. vor der Zahl
  let m = text.match(/(?:CHF|Fr\.)\s*([\d''\s]+)/i);
  if (!m) {
    // CHF/Fr. nach der Zahl
    m = text.match(/([\d''\s]{3,})\s*(?:CHF|Fr\.)/i);
  }
  if (!m) return null;
  const n = parseInt(m[1].replace(/['\s'']/g, ''));
  return isNaN(n) || n < 100 || n > 50_000 ? null : n;
}

/** 4-stellige PLZ im Raum Bern (30xx–31xx, auch 25xx Murten, etc.) */
export function extractZip(text: string): string | null {
  // Breites Muster – PLZ steht oft vor dem Ortsnamen
  const m = text.match(/\b(3\d{3})\b/);
  return m ? m[1] : null;
}

/**
 * Datum für Verfügbarkeit parsen.
 * Erkennt: "01.03.2025", "1. März 2025", "ab sofort" (→ heute), "sofort"
 */
export function extractDate(text: string): string | null {
  // Numerisch DD.MM.YYYY
  let m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  // Ausgeschrieben "1. März 2025"
  const MONTHS: Record<string, string> = {
    januar: '01', februar: '02', 'märz': '03', april: '04', mai: '05', juni: '06',
    juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
    janv: '01', 'févr': '02', mars: '03', avr: '04', juin: '06', juil: '07',
  };
  m = text.match(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`;
  }
  // "ab sofort" oder "sofort"
  if (/ab\s*sofort|sofort\s*verf/i.test(text)) {
    return new Date().toISOString().substring(0, 10);
  }
  return null;
}

// ── HTML bereinigen ──────────────────────────────────────────

/** HTML-Tags entfernen + gängige Entities dekodieren */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Block-Extraktion ─────────────────────────────────────────

/**
 * Findet alle vollständigen HTML-Elemente die einen gegebenen Start-Tag
 * enthalten (balancierter Tag-Matching).
 *
 * @param html    Vollständiger HTML-String
 * @param pattern Regex die auf den öffnenden Start-Tag matcht
 * @param tag     Elementname für den Balance-Check (z.B. "div", "article")
 */
export function extractBlocks(html: string, pattern: RegExp, tag: string): string[] {
  const blocks: string[] = [];
  const openTag = new RegExp(pattern.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = openTag.exec(html)) !== null) {
    const start = match.index;
    let pos = start + match[0].length;
    let depth = 1;
    const openStr = `<${tag}`;
    const closeStr = `</${tag}>`;

    while (pos < html.length && depth > 0) {
      const nextOpen = html.indexOf(openStr, pos);
      const nextClose = html.indexOf(closeStr, pos);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 1;
      } else {
        depth--;
        pos = nextClose + closeStr.length;
      }
    }
    blocks.push(html.slice(start, pos));
  }

  return blocks;
}

// ── JSON-LD Extraktion ───────────────────────────────────────

/**
 * Liest alle <script type="application/ld+json"> Blöcke aus und gibt
 * die geparsten Objekte zurück. Ignoriert Parse-Fehler.
 */
export function extractJsonLd(html: string): any[] {
  const results: any[] = [];
  const regex = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      // Kann ein einzelnes Objekt oder ein Array sein
      if (Array.isArray(parsed)) results.push(...parsed);
      else results.push(parsed);
    } catch { /* Fehler ignorieren */ }
  }
  return results;
}

/**
 * Sucht JSON-LD-Objekte vom Typ "Apartment", "Residence" oder
 * "RealEstateListing" und mappt sie auf ScrapedListing-Felder.
 * Gibt null zurück wenn kein passendes Objekt gefunden.
 */
export function parseJsonLdListing(obj: any): {
  title?: string;
  description?: string;
  address?: string;
  zip_code?: string;
  city?: string;
  rooms?: number | null;
  area_m2?: number | null;
  rent_gross?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  image_urls?: string[];
  available_from?: string | null;
} | null {
  const type: string = obj?.['@type'] ?? '';
  if (!['Apartment', 'House', 'Accommodation', 'RealEstateListing', 'Offer'].includes(type)) {
    return null;
  }

  const geo = obj?.geo ?? obj?.address?.geo ?? {};
  const addr = obj?.address ?? {};

  return {
    title: obj?.name ?? obj?.headline ?? undefined,
    description: obj?.description ?? undefined,
    address: [addr?.streetAddress, addr?.addressLocality].filter(Boolean).join(', ') || undefined,
    zip_code: addr?.postalCode ?? undefined,
    city: addr?.addressLocality ?? undefined,
    rooms: extractRooms(String(obj?.numberOfRooms ?? '')),
    area_m2: parseFloat(obj?.floorSize?.value ?? 0) || extractArea(String(obj?.description ?? '')),
    rent_gross: parseFloat(obj?.offers?.price ?? obj?.priceRange ?? 0) || null,
    latitude: parseFloat(geo?.latitude ?? 0) || null,
    longitude: parseFloat(geo?.longitude ?? 0) || null,
    image_urls: obj?.image
      ? (Array.isArray(obj.image) ? obj.image : [obj.image]).map((i: any) => i?.url ?? i)
      : undefined,
    available_from: extractDate(String(obj?.availabilityStarts ?? obj?.dateAvailable ?? '')),
  };
}
