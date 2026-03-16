/**
 * API-Client für WohnungsRadar
 *
 * Kommuniziert direkt mit Supabase (kein separater Backend-Server nötig).
 * - Listings & Quellen: Supabase Datenbank direkt abfragen
 * - Scraper starten: Supabase Edge Function aufrufen
 *
 * Umgebungsvariablen (.env):
 *   VITE_SUPABASE_URL   = https://xxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY = eyJ...
 */

import { createClient } from '@supabase/supabase-js';
import type { Listing, ListingFilters, ScrapeSource, SearchProfile, SearchProfileInput } from './types';

// Supabase Client (Anon Key – öffentlich, RLS schützt die Daten)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY müssen in .env gesetzt sein');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Auth ───────────────────────────────────────────────────

/** Aktuell eingeloggter User (null = ausgeloggt) */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Einloggen mit E-Mail + Passwort */
export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Registrieren mit E-Mail + Passwort */
export async function signUp(email: string, password: string) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

/** Ausloggen */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ── Suchprofile ────────────────────────────────────────────

/** Alle Suchprofile des aktuellen Users laden */
export async function fetchSearchProfiles(): Promise<SearchProfile[]> {
  const { data, error } = await supabase
    .from('search_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SearchProfile[];
}

/** Neues Suchprofil erstellen */
export async function createSearchProfile(input: SearchProfileInput): Promise<SearchProfile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');

  const { data, error } = await supabase
    .from('search_profiles')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as SearchProfile;
}

/** Suchprofil aktualisieren */
export async function updateSearchProfile(id: string, input: Partial<SearchProfileInput>): Promise<SearchProfile> {
  const { data, error } = await supabase
    .from('search_profiles')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as SearchProfile;
}

/** Suchprofil löschen */
export async function deleteSearchProfile(id: string): Promise<void> {
  const { error } = await supabase
    .from('search_profiles')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Listings ───────────────────────────────────────────────

/**
 * Lädt Wohnungsinserate mit optionalen Filtern direkt aus Supabase.
 */
export async function fetchListings(filters: ListingFilters = {}): Promise<{
  listings: Listing[];
  total: number;
}> {
  let query = supabase
    .from('listings')
    .select('*', { count: 'exact' });

  // Nur aktive Inserate
  query = query.eq('is_active', filters.is_active !== false ? true : filters.is_active);

  // Zimmer-Filter
  if (filters.rooms_min !== undefined) query = query.gte('rooms', filters.rooms_min);
  if (filters.rooms_max !== undefined) query = query.lte('rooms', filters.rooms_max);

  // Miete-Filter
  if (filters.rent_min !== undefined) query = query.gte('rent_gross', filters.rent_min);
  if (filters.rent_max !== undefined) query = query.lte('rent_gross', filters.rent_max);

  // Fläche-Filter
  if (filters.area_min !== undefined) query = query.gte('area_m2', filters.area_min);
  if (filters.area_max !== undefined) query = query.lte('area_m2', filters.area_max);

  // PLZ-Filter
  if (filters.zip_codes?.length) query = query.in('zip_code', filters.zip_codes);

  // Quelle-Filter
  if (filters.source) query = query.eq('source', filters.source);

  // Feature-Filter (Boolean)
  if (filters.has_garden)        query = query.eq('has_garden', true);
  if (filters.has_terrace)       query = query.eq('has_terrace', true);
  if (filters.has_balcony)       query = query.eq('has_balcony', true);
  if (filters.has_lift)          query = query.eq('has_lift', true);
  if (filters.has_own_washer)    query = query.eq('has_own_washer', true);
  if (filters.has_parking)       query = query.eq('has_parking', true);
  if (filters.is_minergie)       query = query.eq('is_minergie', true);
  if (filters.is_child_friendly) query = query.eq('is_child_friendly', true);

  // Volltext-Suche
  if (filters.search) {
    query = query.or(
      `title.ilike.%${filters.search}%,address.ilike.%${filters.search}%,city.ilike.%${filters.search}%`
    );
  }

  // Sortierung
  const sortCol = filters.sort_by ?? 'first_seen_at';
  const sortAsc = filters.sort_order === 'asc';
  query = query.order(sortCol, { ascending: sortAsc });

  // Paginierung
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    listings: (data ?? []) as Listing[],
    total: count ?? 0,
  };
}

/**
 * Lädt ein einzelnes Inserat anhand der ID.
 */
export async function fetchListing(id: string): Promise<Listing> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Listing;
}

// ── Quellen ────────────────────────────────────────────────

/**
 * Lädt alle Scraping-Quellen mit Status direkt aus Supabase.
 */
export async function fetchSources(): Promise<ScrapeSource[]> {
  const { data, error } = await supabase
    .from('scrape_sources')
    .select('*')
    .order('tier', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ScrapeSource[];
}

// ── Scraper-Steuerung ──────────────────────────────────────

/**
 * Startet alle Scraper manuell via Supabase Edge Function.
 */
export async function triggerScraper(source?: string): Promise<{ message: string }> {
  const functionName = source ? `scrape-${source}` : 'scrape-all';

  const { error } = await supabase.functions.invoke(functionName, {
    body: {},
  });

  if (error) throw error;
  return { message: `${functionName} wurde gestartet` };
}

/**
 * Prüft ob gerade ein Scraper aktiv ist (via scrape_sources Tabelle).
 */
export async function fetchScraperStatus(): Promise<{ running: boolean; startedAt: string | null }> {
  const { data } = await supabase
    .from('scrape_sources')
    .select('last_scraped_at')
    .order('last_scraped_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Gilt als "laufend" wenn letzter Scrape < 2 Minuten her ist
  const lastRun = data?.last_scraped_at ? new Date(data.last_scraped_at) : null;
  const running = lastRun ? (Date.now() - lastRun.getTime()) < 2 * 60 * 1000 : false;

  return { running, startedAt: lastRun?.toISOString() ?? null };
}
