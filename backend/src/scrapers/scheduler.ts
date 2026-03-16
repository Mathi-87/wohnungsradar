/**
 * Scraping-Scheduler
 *
 * Startet die Scraper regelmässig nach einem Zeitplan (Cron-Jobs).
 * - Tier 1 Portale (Flatfox, Homegate, ImmoScout24): jede Stunde
 *
 * Der Scheduler wird beim Serverstart automatisch gestartet (in server.ts).
 * Auf Render läuft der Server dauerhaft, also laufen auch die Cron-Jobs.
 *
 * ACHTUNG: Render Free Tier schläft nach 15 Min. Inaktivität ein.
 * → Entweder Render paid nutzen, oder regelmässige HTTP-Pings einrichten.
 */

import cron from 'node-cron';
import { FlatfoxScraper } from './portals/flatfox';
import { HomegateScraper } from './portals/homegate';
import { ImmoScout24Scraper } from './portals/immoscout24';

// Alle verfügbaren Scraper-Klassen
const ALL_SCRAPERS = [
  FlatfoxScraper,
  HomegateScraper,
  ImmoScout24Scraper,
];

// Verhindert dass zwei Scraper-Läufe gleichzeitig starten
let isRunning = false;

/**
 * Führt alle Scraper nacheinander aus.
 * Nacheinander (nicht parallel) um Rate-Limits zu respektieren.
 */
export async function runAllScrapers(): Promise<void> {
  if (isRunning) {
    console.log('[scheduler] Scraper-Lauf übersprungen (vorheriger läuft noch)');
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  console.log(`\n[scheduler] === Starte Scraper-Lauf ${new Date().toISOString()} ===`);

  let totalNew = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const ScraperClass of ALL_SCRAPERS) {
    const scraper = new ScraperClass();
    try {
      const result = await scraper.run();
      totalNew += result.newCount;
      totalUpdated += result.updatedCount;
      totalErrors += result.errorCount;
    } catch (err) {
      console.error(`[scheduler] Unerwarteter Fehler bei ${ScraperClass.name}:`, err);
      totalErrors++;
    }
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`[scheduler] === Fertig in ${durationSec}s: ${totalNew} neu, ${totalUpdated} aktualisiert, ${totalErrors} Fehler ===\n`);

  isRunning = false;
}

/**
 * Startet den automatischen Cron-Scheduler.
 * Wird beim Serverstart aufgerufen.
 *
 * Zeitplan:
 * - "0 * * * *" = Jede Stunde zur vollen Stunde
 */
export function startScheduler(): void {
  console.log('[scheduler] Cron-Scheduler gestartet (läuft jede Stunde)');

  // Jede Stunde: Alle Tier-1-Portale scrapen
  cron.schedule('0 * * * *', async () => {
    await runAllScrapers();
  });

  // Beim ersten Start sofort einen Lauf starten (nach 10 Sekunden Verzögerung)
  // damit der Server zuerst vollständig hochfährt
  setTimeout(async () => {
    console.log('[scheduler] Erster Scraper-Lauf nach Serverstart...');
    await runAllScrapers();
  }, 10_000); // 10 Sekunden
}
