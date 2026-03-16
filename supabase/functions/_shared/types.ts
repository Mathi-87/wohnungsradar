/**
 * Gemeinsame Typdefinitionen für alle Supabase Edge Functions
 */

// Ein Inserat wie es vom Scraper geliefert wird (vor dem Speichern)
export interface ScrapedListing {
  title: string;
  description?: string | null;
  address?: string | null;
  zip_code?: string | null;
  city?: string | null;
  district?: string | null;
  rooms?: number | null;
  area_m2?: number | null;
  floor?: number | null;
  rent_net?: number | null;
  rent_gross?: number | null;
  additional_costs?: number | null;
  has_garden?: boolean;
  has_terrace?: boolean;
  has_balcony?: boolean;
  has_lift?: boolean;
  has_own_washer?: boolean;
  has_parking?: boolean;
  parking_cost?: number | null;
  is_minergie?: boolean;
  is_child_friendly?: boolean;
  property_type?: string | null;
  available_from?: string | null;
  source: string;
  source_url: string;
  source_id?: string | null;
  source_ref?: string | null;
  agency_name?: string | null;
  agency_url?: string | null;
  image_urls?: string[];
  latitude?: number | null;
  longitude?: number | null;
  is_active?: boolean;
}

// Ergebnis eines Scraper-Laufs
export interface ScrapeResult {
  source: string;
  newCount: number;
  updatedCount: number;
  errorCount: number;
  error?: string;
}
