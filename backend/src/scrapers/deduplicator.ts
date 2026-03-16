/**
 * Deduplizierung
 *
 * Gleiche Wohnungen erscheinen oft auf mehreren Portalen gleichzeitig.
 * Um Duplikate zu erkennen, berechnen wir einen Hash aus den wichtigsten
 * Kerndaten (Adresse, Zimmer, Fläche, Miete).
 *
 * Strategie:
 * 1. Hash-basiert: Gleiche normalisierte Adresse + Zimmer + Fläche + Miete → Duplikat
 * 2. Source-ID: Gleiche Quelle + gleiche Source-ID → Duplikat (Update)
 */

import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase';
import { ScrapedListing } from './base-scraper';

/**
 * Normalisiert eine Adresse für den Vergleich.
 * "Musterstrasse 12" und "musterstr. 12" sollen gleich sein.
 */
function normalizeAddress(address: string | null): string {
  if (!address) return '';

  return address
    .toLowerCase()
    .replace(/strasse/g, 'str')
    .replace(/gasse/g, 'g')
    .replace(/weg/g, 'w')
    .replace(/[^a-z0-9]/g, '') // Nur Buchstaben und Zahlen
    .trim();
}

/**
 * Berechnet den Dedup-Hash für ein Inserat.
 * Format: SHA256(adresse + zimmer + flaeche + miete_netto)
 */
export function computeDedupHash(listing: Partial<ScrapedListing>): string {
  const parts = [
    normalizeAddress(listing.address ?? null),
    String(listing.zip_code ?? ''),
    String(listing.rooms ?? ''),
    String(listing.area_m2 ?? ''),
    String(listing.rent_net ?? listing.rent_gross ?? ''),
  ];

  const raw = parts.join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Prüft ob ein Inserat bereits in der Datenbank existiert.
 * Gibt das existierende Listing zurück, oder null wenn neu.
 */
export async function findDuplicate(
  hash: string,
  source: string,
  sourceId: string | null,
): Promise<{ id: string } | null> {
  // Zuerst: Gleiche Quelle + Source-ID (sicherste Methode)
  if (sourceId) {
    const { data } = await supabaseAdmin
      .from('listings')
      .select('id')
      .eq('source', source)
      .eq('source_id', sourceId)
      .single();

    if (data) return data;
  }

  // Dann: Hash-basierte Suche (findet Duplikate über mehrere Portale)
  // Nur wenn der Hash genug Information enthält (nicht alles leer)
  if (hash && hash !== computeDedupHash({})) {
    const { data } = await supabaseAdmin
      .from('listings')
      .select('id')
      .eq('dedup_hash', hash)
      .limit(1)
      .maybeSingle();

    if (data) return data;
  }

  return null;
}

/**
 * Markiert Inserate als inaktiv, die bei einem Scrape-Lauf nicht mehr gefunden wurden.
 * Wird nach jedem vollständigen Scrape-Lauf aufgerufen.
 *
 * @param source       Name der Quelle (z.B. 'flatfox')
 * @param activeIds    IDs der Inserate die aktuell noch aktiv sind
 */
export async function deactivateMissing(source: string, activeSourceIds: string[]): Promise<number> {
  // Alle aktiven Inserate dieser Quelle holen
  const { data: allActive } = await supabaseAdmin
    .from('listings')
    .select('id, source_id')
    .eq('source', source)
    .eq('is_active', true);

  if (!allActive?.length) return 0;

  // Welche sind nicht mehr in der aktuellen Liste?
  const toDeactivate = allActive
    .filter(l => l.source_id && !activeSourceIds.includes(l.source_id))
    .map(l => l.id);

  if (!toDeactivate.length) return 0;

  // Als inaktiv markieren (nicht löschen – für die Geschichte)
  await supabaseAdmin
    .from('listings')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .in('id', toDeactivate);

  console.log(`[dedup] ${toDeactivate.length} Inserate von '${source}' als inaktiv markiert`);
  return toDeactivate.length;
}
