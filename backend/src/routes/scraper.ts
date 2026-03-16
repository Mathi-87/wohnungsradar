/**
 * Scraper-API-Route
 *
 * Ermöglicht das manuelle Auslösen von Scraper-Läufen via HTTP.
 * Nützlich für Tests und für den ersten Datenbankbefüllung.
 *
 * POST /api/scraper/run         → Alle Scraper ausführen
 * POST /api/scraper/run/:source → Einzelnen Scraper ausführen (z.B. 'flatfox')
 * GET  /api/scraper/status      → Ist ein Lauf aktiv?
 */

import { Router, Request, Response } from 'express';
import { runAllScrapers } from '../scrapers/scheduler';
import { FlatfoxScraper } from '../scrapers/portals/flatfox';
import { HomegateScraper } from '../scrapers/portals/homegate';
import { ImmoScout24Scraper } from '../scrapers/portals/immoscout24';

export const scraperRouter = Router();

// Zuordnung von Quellenname zu Scraper-Klasse
const SCRAPERS: Record<string, new () => { run: () => Promise<any> }> = {
  flatfox: FlatfoxScraper,
  homegate: HomegateScraper,
  immoscout24: ImmoScout24Scraper,
};

// Aktueller Status (shared state – reicht für Single-Instance-Deployment)
let runStatus: { running: boolean; startedAt: string | null } = {
  running: false,
  startedAt: null,
};

// ── GET /api/scraper/status ──────────────────────────────────
scraperRouter.get('/status', (_req: Request, res: Response) => {
  res.json(runStatus);
});

// ── POST /api/scraper/run ────────────────────────────────────
// Startet alle Scraper (läuft asynchron, gibt sofort 202 zurück)
scraperRouter.post('/run', (_req: Request, res: Response) => {
  if (runStatus.running) {
    return res.status(409).json({ message: 'Ein Scraper-Lauf ist bereits aktiv' });
  }

  runStatus = { running: true, startedAt: new Date().toISOString() };

  // Asynchron starten ohne auf Ergebnis zu warten
  runAllScrapers()
    .then(() => {
      runStatus = { running: false, startedAt: null };
    })
    .catch(err => {
      console.error('[scraper-route] Fehler beim Scraper-Lauf:', err);
      runStatus = { running: false, startedAt: null };
    });

  res.status(202).json({
    message: 'Scraper-Lauf gestartet',
    startedAt: runStatus.startedAt,
  });
});

// ── POST /api/scraper/run/:source ────────────────────────────
// Startet einen einzelnen Scraper (z.B. POST /api/scraper/run/flatfox)
scraperRouter.post('/run/:source', async (req: Request, res: Response) => {
  const { source } = req.params;
  const ScraperClass = SCRAPERS[source];

  if (!ScraperClass) {
    return res.status(404).json({
      message: `Unbekannte Quelle: '${source}'`,
      available: Object.keys(SCRAPERS),
    });
  }

  try {
    const scraper = new ScraperClass();
    const result = await scraper.run();
    res.json({ source, ...result });
  } catch (err) {
    console.error(`[scraper-route] Fehler bei ${source}:`, err);
    res.status(500).json({ error: String(err) });
  }
});
