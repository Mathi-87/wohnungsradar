/**
 * Deduplizierungs-Logik
 *
 * Verhindert dass dasselbe Inserat mehrfach gespeichert wird.
 * Zwei Strategien:
 * 1. source + source_id (exakter Match auf Quell-Plattform)
 * 2. SHA-256 Hash aus Adresse + Zimmer + Fläche + Miete
 */

import { getSupabaseAdmin } from './supabase-client.ts';

// Berechnet SHA-256 Hash für Deduplizierung (via Web Crypto API – kein Node.js nötig)
export async function computeDedupHash(listing: {
  address?: string | null;
  zip_code?: string | null;
  rooms?: number | null;
  area_m2?: number | null;
  rent_net?: number | null;
}): Promise<string> {
  const normalized = [
    (listing.address ?? '').toLowerCase().trim().replace(/\s+/g, ' '),
    String(listing.zip_code ?? ''),
    String(listing.rooms ?? ''),
    String(listing.area_m2 ?? ''),
    String(listing.rent_net ?? ''),
  ].join('|');

  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Prüft ob ein Inserat schon existiert – gibt die ID zurück oder null
export async function findDuplicate(
  hash: string,
  source: string,
  sourceId?: string | null,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  // Zuerst nach exakter source_id suchen (schnellster Match)
  if (sourceId) {
    const { data } = await supabase
      .from('listings')
      .select('id')
      .eq('source', source)
      .eq('source_id', sourceId)
      .maybeSingle();
    if (data) return data.id;
  }

  // Dann nach Hash suchen (erkennt Duplikate über Quellen hinweg)
  const { data } = await supabase
    .from('listings')
    .select('id')
    .eq('dedup_hash', hash)
    .maybeSingle();

  return data?.id ?? null;
}

// Markiert Inserate die nicht mehr gefunden wurden als inaktiv
export async function deactivateMissing(
  source: string,
  activeSourceIds: string[],
): Promise<void> {
  if (activeSourceIds.length === 0) return;

  const supabase = getSupabaseAdmin();

  // Alle aktuell aktiven Einträge dieser Quelle holen
  const { data: existing } = await supabase
    .from('listings')
    .select('id, source_id')
    .eq('source', source)
    .eq('is_active', true);

  if (!existing || existing.length === 0) return;

  // IDs die nicht mehr in der aktuellen Liste sind → deaktivieren
  const toDeactivate = existing
    .filter(row => row.source_id && !activeSourceIds.includes(row.source_id))
    .map(row => row.id);

  if (toDeactivate.length > 0) {
    await supabase
      .from('listings')
      .update({ is_active: false })
      .in('id', toDeactivate);

    console.log(`[${source}] ${toDeactivate.length} Inserate deaktiviert`);
  }
}
