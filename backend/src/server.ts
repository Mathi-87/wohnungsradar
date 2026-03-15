/**
 * WohnungsRadar – Haupt-Server
 *
 * Startet den Express-Webserver und registriert alle API-Routen.
 * Läuft auf Render als "Web Service".
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { listingsRouter } from './routes/listings';
import { sourcesRouter } from './routes/sources';

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Middleware ──────────────────────────────────────────────

// CORS: Frontend (auf anderem Port / Domain) darf die API aufrufen
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// JSON-Body in Requests parsen
app.use(express.json());

// ── Routen ─────────────────────────────────────────────────

// Health-Check: einfacher Ping um zu prüfen ob der Server läuft
// GET /health → { status: 'ok', timestamp: '...' }
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Listings-API: Inserate lesen
// GET /api/listings          → Liste mit Filtern
// GET /api/listings/:id      → Einzelnes Inserat
app.use('/api/listings', listingsRouter);

// Quellen-API: Scraping-Quellen und deren Status
// GET /api/sources           → Alle Quellen mit Status
app.use('/api/sources', sourcesRouter);

// ── Server starten ─────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ WohnungsRadar Backend läuft auf Port ${PORT}`);
  console.log(`   Health-Check: http://localhost:${PORT}/health`);
  console.log(`   Listings API: http://localhost:${PORT}/api/listings`);
});

export default app;
