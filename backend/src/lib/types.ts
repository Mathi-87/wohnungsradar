/**
 * TypeScript-Typen für das Datenmodell
 *
 * Diese Typen spiegeln das Datenbankschema (supabase/schema.sql) wider.
 * Sie werden im Frontend und Backend gleich verwendet.
 */

// Ein einzelnes Wohnungsinserat
export interface Listing {
  id: string;

  // Kerndaten
  title: string;
  description: string | null;
  address: string | null;
  zip_code: string | null;
  city: string | null;
  district: string | null;

  // Wohnungsdaten
  rooms: number | null;
  area_m2: number | null;
  floor: number | null;
  rent_net: number | null;
  rent_gross: number | null;
  additional_costs: number | null;

  // Ausstattung
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

  // Verfügbarkeit
  available_from: string | null;  // ISO-Datum

  // Quelle
  source: string;
  source_url: string;
  source_id: string | null;
  source_ref: string | null;

  // Verwaltung
  agency_name: string | null;
  agency_url: string | null;

  // Bilder
  image_urls: string[] | null;

  // Deduplizierung
  dedup_hash: string | null;
  canonical_id: string | null;

  // Geo
  latitude: number | null;
  longitude: number | null;

  // Meta
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Filter-Parameter für die Listings-API
export interface ListingFilters {
  zip_codes?: string[];       // PLZ-Filter z.B. ['3097', '3084']
  rooms_min?: number;         // Mindest-Zimmeranzahl
  rooms_max?: number;         // Max-Zimmeranzahl
  rent_max?: number;          // Maximale Bruttomiete
  area_min?: number;          // Mindestfläche in m²
  has_garden?: boolean;
  has_terrace?: boolean;
  has_balcony?: boolean;
  is_minergie?: boolean;
  source?: string;            // Filter nach Quelle
  is_active?: boolean;        // Standard: true
  limit?: number;             // Max. Anzahl Resultate (Standard: 50)
  offset?: number;            // Für Paginierung
}

// Eine Scraping-Quelle
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
