/**
 * Listings-API-Route
 *
 * GET /api/listings          – Alle aktiven Inserate (mit optionalen Filtern)
 * GET /api/listings/:id      – Ein einzelnes Inserat
 *
 * Filter werden als Query-Parameter übergeben, z.B.:
 * /api/listings?rooms_min=4&rent_max=3000&zip_codes=3097,3084
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { ListingFilters } from '../lib/types';

export const listingsRouter = Router();

// ── GET /api/listings ──────────────────────────────────────
// Gibt eine Liste von Inseraten zurück, gefiltert nach Query-Parametern
listingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    // Query-Parameter auslesen und in den richtigen Typ umwandeln
    const filters: ListingFilters = {
      zip_codes:  req.query.zip_codes ? String(req.query.zip_codes).split(',') : undefined,
      rooms_min:  req.query.rooms_min  ? parseFloat(String(req.query.rooms_min))  : undefined,
      rooms_max:  req.query.rooms_max  ? parseFloat(String(req.query.rooms_max))  : undefined,
      rent_max:   req.query.rent_max   ? parseInt(String(req.query.rent_max))     : undefined,
      area_min:   req.query.area_min   ? parseInt(String(req.query.area_min))     : undefined,
      has_garden: req.query.has_garden === 'true' ? true : undefined,
      is_minergie: req.query.is_minergie === 'true' ? true : undefined,
      source:     req.query.source     ? String(req.query.source) : undefined,
      is_active:  req.query.is_active  === 'false' ? false : true,  // Standard: nur aktive
      limit:      req.query.limit      ? parseInt(String(req.query.limit))  : 50,
      offset:     req.query.offset     ? parseInt(String(req.query.offset)) : 0,
    };

    // Supabase-Query aufbauen
    let query = supabase
      .from('listings')
      .select('*')
      .eq('is_active', filters.is_active ?? true)
      .order('first_seen_at', { ascending: false })  // Neueste zuerst
      .range(filters.offset!, filters.offset! + filters.limit! - 1);

    // Filter anwenden (nur wenn angegeben)
    if (filters.zip_codes?.length) {
      query = query.in('zip_code', filters.zip_codes);
    }
    if (filters.rooms_min !== undefined) {
      query = query.gte('rooms', filters.rooms_min);
    }
    if (filters.rooms_max !== undefined) {
      query = query.lte('rooms', filters.rooms_max);
    }
    if (filters.rent_max !== undefined) {
      query = query.lte('rent_gross', filters.rent_max);
    }
    if (filters.area_min !== undefined) {
      query = query.gte('area_m2', filters.area_min);
    }
    if (filters.has_garden) {
      query = query.eq('has_garden', true);
    }
    if (filters.is_minergie) {
      query = query.eq('is_minergie', true);
    }
    if (filters.source) {
      query = query.eq('source', filters.source);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      listings: data,
      total: count,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (err) {
    console.error('Fehler beim Laden der Listings:', err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});

// ── GET /api/listings/:id ──────────────────────────────────
// Gibt ein einzelnes Inserat anhand der UUID zurück
listingsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      // Supabase gibt PGRST116 wenn kein Eintrag gefunden
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
