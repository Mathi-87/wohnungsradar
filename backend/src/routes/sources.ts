/**
 * Quellen-API-Route
 *
 * GET /api/sources   – Alle Scraping-Quellen mit ihrem aktuellen Status
 *
 * Wird im Frontend für die "Quellen-Status"-Seite verwendet,
 * damit man sieht welche Scraper laufen und wann zuletzt gescrapt wurde.
 */

import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

export const sourcesRouter = Router();

// ── GET /api/sources ───────────────────────────────────────
sourcesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('scrape_sources')
      .select('*')
      .order('tier', { ascending: true })   // Tier 1 zuerst
      .order('name', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Fehler beim Laden der Quellen:', err);
    res.status(500).json({ error: 'Interner Serverfehler' });
  }
});
