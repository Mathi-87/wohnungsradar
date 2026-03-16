/**
 * TypeScript-Typen für das Frontend
 * (identisch mit den Backend-Typen in backend/src/lib/types.ts)
 */

export interface Listing {
  id: string;
  title: string;
  description: string | null;
  address: string | null;
  zip_code: string | null;
  city: string | null;
  district: string | null;
  rooms: number | null;
  area_m2: number | null;
  floor: number | null;
  rent_net: number | null;
  rent_gross: number | null;
  additional_costs: number | null;
  has_garden: boolean;
  has_terrace: boolean;
  has_balcony: boolean;
  has_lift: boolean;
  has_own_washer: boolean;
  has_parking: boolean;
  parking_cost: number | null;
  is_minergie: boolean;
  is_child_friendly: boolean;
  property_type: string | null;
  available_from: string | null;
  source: string;
  source_url: string;
  source_id: string | null;
  source_ref: string | null;
  agency_name: string | null;
  agency_url: string | null;
  image_urls: string[] | null;
  dedup_hash: string | null;
  canonical_id: string | null;
  latitude: number | null;
  longitude: number | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ListingFilters {
  // Geografisch
  zip_codes?: string[];
  // Zimmer
  rooms_min?: number;
  rooms_max?: number;
  // Miete
  rent_min?: number;
  rent_max?: number;
  // Fläche
  area_min?: number;
  area_max?: number;
  // Ausstattung (true = Filter aktiv, undefined = egal)
  has_garden?: boolean;
  has_terrace?: boolean;
  has_balcony?: boolean;
  has_lift?: boolean;
  has_own_washer?: boolean;
  has_parking?: boolean;
  is_minergie?: boolean;
  is_child_friendly?: boolean;
  // Freitextsuche (Titel / Adresse)
  search?: string;
  // Quelle und Status
  source?: string;
  is_active?: boolean;
  // Sortierung
  sort_by?: 'first_seen_at' | 'rent_gross' | 'rooms' | 'area_m2';
  sort_order?: 'asc' | 'desc';
  // Paginierung
  limit?: number;
  offset?: number;
}

/**
 * Suchprofil – definiert Kriterien für automatische Benachrichtigungen.
 * Gehört einem eingeloggten User (user_id = Supabase Auth UUID).
 */
export interface SearchProfile {
  id: string;
  user_id: string;
  name: string;
  zip_codes: string[] | null;   // PLZ-Filter, z.B. ["3011","3012"]
  rooms_min: number | null;
  rooms_max: number | null;
  rent_gross_max: number | null;
  area_min: number | null;
  has_garden: boolean;
  has_balcony: boolean;
  has_lift: boolean;
  is_minergie: boolean;
  notify_email: boolean;        // E-Mail-Benachrichtigung aktiv?
  is_active: boolean;
  created_at: string;
}

// Felder die beim Erstellen / Bearbeiten ausgefüllt werden
export type SearchProfileInput = Omit<SearchProfile, 'id' | 'user_id' | 'created_at'>;

export interface ScrapeSource {
  id: string;
  name: string;
  tier: number;
  type: 'portal' | 'verwaltung' | 'genossenschaft' | 'other';
  display_name: string | null;
  base_url: string;
  scrape_url: string | null;
  scrape_interval_minutes: number;
  last_scraped_at: string | null;
  last_error: string | null;
  consecutive_errors: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

/**
 * Berechnet einen Matching-Score für ein Inserat basierend auf unserem Suchprofil.
 * Punkte für Eigenschaften die wir priorisieren.
 * Maximal 100 Punkte.
 */
export function computeScore(listing: Listing): number {
  let score = 0;

  // Zimmer im Bereich 4.5–6.5
  if (listing.rooms !== null) {
    if (listing.rooms >= 4.5 && listing.rooms <= 6.5) score += 20;
    else if (listing.rooms >= 4 && listing.rooms <= 7) score += 10;
  }

  // Preis im Budget (max. CHF 3000 brutto)
  if (listing.rent_gross !== null && listing.rent_gross <= 3000) score += 20;
  else if (listing.rent_gross !== null && listing.rent_gross <= 3300) score += 10;

  // Aussenflächen (nach Priorität)
  if (listing.has_garden) score += 15;
  else if (listing.has_terrace) score += 10;
  else if (listing.has_balcony) score += 5;

  // Must-Haves
  if (listing.is_minergie) score += 10;
  if (listing.is_child_friendly) score += 10;

  // Nice-to-Haves
  if (listing.has_own_washer) score += 5;
  if (listing.has_lift) score += 5;
  if (listing.has_parking) score += 5;

  // Fläche (Soft-Filter: min. 100 m²)
  if (listing.area_m2 !== null && listing.area_m2 >= 100) score += 10;

  return Math.min(score, 100);
}

/**
 * Formatiert einen Schweizer Franken-Betrag (z.B. 2500 → "CHF 2'500")
 */
export function formatCHF(amount: number | null): string {
  if (amount === null) return '–';
  return `CHF ${amount.toLocaleString('de-CH')}`;
}

/**
 * Formatiert ein Datum in deutsches Format (z.B. "2024-03-15" → "15.03.2024")
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '–';
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Gibt den Anzeigenamen einer Quelle zurück.
 */
export function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    flatfox: 'Flatfox',
    homegate: 'Homegate',
    immoscout24: 'ImmoScout24',
    newhome: 'Newhome',
  };
  return labels[source] ?? source;
}
