/**
 * Listings-API-Route
 *
 * GET /api/listings          – Alle aktiven Inserate (mit optionalen Filtern)
 * GET /api/listings/:id      – Ein einzelnes Inserat
 *
 * Unterstützte Filter-Parameter:
 * - zip_codes         PLZ-Liste (kommagetrennt), z.B. "3097,3084"
 * - rooms_min / rooms_max   Zimmerzahl-Bereich
 * - rent_min / rent_max     Mietpreis-Bereich (brutto, CHF)
 * - area_min / area_max     Fläche-Bereich (m²)
 * - has_garden, has_terrace, has_balcony, has_lift,
 *   has_own_washer, has_parking, is_minergie, is_child_friendly
 * - search            Freitext (sucht in Titel und Adresse)
 * - source            Portal (z.B. "flatfox")
 * - sort_by           Feld zum Sortieren (first_seen_at|rent_gross|rooms|area_m2)
 * - sort_order        asc | desc
 * - limit / offset    Paginierung
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { ListingFilters } from '../lib/types';

export const listingsRouter = Router();

// Erlaubte Sort-Felder (Whitelist gegen SQL-Injection)
const ALLOWED_SORT_FIELDS = ['first_seen_at', 'rent_gross', 'rooms', 'area_m2'] as const;
type SortField = (typeof ALLOWED_SORT_FIELDS)[number];

// ── GET /api/listings ──────────────────────────────────────
listingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    // Query-Parameter auslesen
    const filters: ListingFilters = {
      zip_codes:       req.query.zip_codes    ? String(req.query.zip_codes).split(',') : undefined,
      rooms_min:       req.query.rooms_min    ? parseFloat(String(req.query.rooms_min))  : undefined,
      rooms_max:       req.query.rooms_max    ? parseFloat(String(req.query.rooms_max))  : undefined,
      rent_min:        req.query.rent_min     ? parseInt(String(req.query.rent_min))     : undefined,
      rent_max:        req.query.rent_max     ? parseInt(String(req.query.rent_max))     : undefined,
      area_min:        req.query.area_min     ? parseInt(String(req.query.area_min))     : undefined,
      area_max:        req.query.area_max     ? parseInt(String(req.query.area_max))     : undefined,
      has_garden:      req.query.has_garden      === 'true' ? true : undefined,
      has_terrace:     req.query.has_terrace     === 'true' ? true : undefined,
      has_balcony:     req.query.has_balcony     === 'true' ? true : undefined,
      has_lift:        req.query.has_lift        === 'true' ? true : undefined,
      has_own_washer:  req.query.has_own_washer  === 'true' ? true : undefined,
      has_parking:     req.query.has_parking     === 'true' ? true : undefined,
      is_minergie:     req.query.is_minergie     === 'true' ? true : undefined,
      is_child_friendly: req.query.is_child_friendly === 'true' ? true : undefined,
      search:          req.query.search       ? String(req.query.search)           : undefined,
      source:          req.query.source       ? String(req.query.source)           : undefined,
      is_active:       req.query.is_active    === 'false' ? false : true,
      sort_by:         ALLOWED_SORT_FIELDS.includes(req.query.sort_by as SortField)
                         ? (req.query.sort_by as SortField)
                         : 'first_seen_at',
      sort_order:      req.query.sort_order === 'asc' ? 'asc' : 'desc',
      limit:           req.query.limit  ? Math.min(parseInt(String(req.query.limit)),  200) : 50,
      offset:          req.query.offset ? parseInt(String(req.query.offset))              : 0,
    };

    // Supabase-Query aufbauen – count: 'exact' für die Gesamt-Trefferzahl
    let query = supabase
      .from('listings')
      .select('*', { count: 'exact' })
      .eq('is_active', filters.is_active ?? true)
      .order(filters.sort_by!, { ascending: filters.sort_order === 'asc' })
      .range(filters.offset!, filters.offset! + filters.limit! - 1);

    // ── Geografisch ──
    if (filters.zip_codes?.length) {
      query = query.in('zip_code', filters.zip_codes);
    }

    // ── Zimmer ──
    if (filters.rooms_min !== undefined) query = query.gte('rooms', filters.rooms_min);
    if (filters.rooms_max !== undefined) query = query.lte('rooms', filters.rooms_max);

    // ── Miete ──
    if (filters.rent_min !== undefined) query = query.gte('rent_gross', filters.rent_min);
    if (filters.rent_max !== undefined) query = query.lte('rent_gross', filters.rent_max);

    // ── Fläche ──
    if (filters.area_min !== undefined) query = query.gte('area_m2', filters.area_min);
    if (filters.area_max !== undefined) query = query.lte('area_m2', filters.area_max);

    // ── Ausstattung ──
    if (filters.has_garden)       query = query.eq('has_garden', true);
    if (filters.has_terrace)      query = query.eq('has_terrace', true);
    if (filters.has_balcony)      query = query.eq('has_balcony', true);
    if (filters.has_lift)         query = query.eq('has_lift', true);
    if (filters.has_own_washer)   query = query.eq('has_own_washer', true);
    if (filters.has_parking)      query = query.eq('has_parking', true);
    if (filters.is_minergie)      query = query.eq('is_minergie', true);
    if (filters.is_child_friendly) query = query.eq('is_child_friendly', true);

    // ── Freitextsuche (Titel ODER Adresse) ──
    // Supabase: .or() mit ilike (case-insensitiv)
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      query = query.or(`title.ilike.${term},address.ilike.${term}`);
    }

    // ── Quelle ──
    if (filters.source) query = query.eq('source', filters.source);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      listings: data ?? [],
      total:    count ?? 0,
      limit:    filters.limit,
      offset:   filters.offset,
    });
  } catch (err) {
    console.error('Fehler beim Laden der Listings:', err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// ── GET /api/listings/:id ──────────────────────────────────
listingsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Inserat nicht gefunden' });
      }
      throw error;
    }

    res.json(data);
  } catch (err) {
    console.error('Fehler beim Laden des Inserats:', err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});
