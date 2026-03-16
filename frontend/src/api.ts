/**
 * API-Client für das WohnungsRadar-Backend
 *
 * Alle Funktionen um mit dem Backend zu kommunizieren.
 * Die Backend-URL wird aus der .env-Datei gelesen (VITE_API_URL).
 */

import axios from 'axios';
import type { Listing, ListingFilters, ScrapeSource } from './types';

// Backend-URL: In .env als VITE_API_URL definieren
// Lokal: http://localhost:3001, auf Render: die Render-URL
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const http = axios.create({
  baseURL: API_BASE,
  timeout: 15_000,
});

// ── Listings ───────────────────────────────────────────────

/**
 * Lädt Wohnungsinserate mit optionalen Filtern.
 */
export async function fetchListings(filters: ListingFilters = {}): Promise<{
  listings: Listing[];
  total: number;
}> {
  // Filter in Query-Parameter umwandeln
  const params: Record<string, string> = {};

  if (filters.zip_codes?.length) params.zip_codes = filters.zip_codes.join(',');
  if (filters.rooms_min !== undefined) params.rooms_min = String(filters.rooms_min);
  if (filters.rooms_max !== undefined) params.rooms_max = String(filters.rooms_max);
  if (filters.rent_max !== undefined) params.rent_max = String(filters.rent_max);
  if (filters.area_min !== undefined) params.area_min = String(filters.area_min);
  if (filters.has_garden) params.has_garden = 'true';
  if (filters.is_minergie) params.is_minergie = 'true';
  if (filters.source) params.source = filters.source;
  if (filters.limit !== undefined) params.limit = String(filters.limit);
  if (filters.offset !== undefined) params.offset = String(filters.offset);

  const response = await http.get('/api/listings', { params });
  return response.data;
}

/**
 * Lädt ein einzelnes Inserat anhand der ID.
 */
export async function fetchListing(id: string): Promise<Listing> {
  const response = await http.get(`/api/listings/${id}`);
  return response.data;
}

// ── Quellen ────────────────────────────────────────────────

/**
 * Lädt alle Scraping-Quellen mit ihrem Status.
 */
export async function fetchSources(): Promise<ScrapeSource[]> {
  const response = await http.get('/api/sources');
  return response.data;
}

// ── Scraper-Steuerung ──────────────────────────────────────

/**
 * Startet alle Scraper manuell (gibt sofort zurück, Scraping läuft im Hintergrund).
 */
export async function triggerScraper(source?: string): Promise<{ message: string }> {
  const url = source ? `/api/scraper/run/${source}` : '/api/scraper/run';
  const response = await http.post(url);
  return response.data;
}

/**
 * Prüft ob gerade ein Scraper-Lauf aktiv ist.
 */
export async function fetchScraperStatus(): Promise<{ running: boolean; startedAt: string | null }> {
  const response = await http.get('/api/scraper/status');
  return response.data;
}
