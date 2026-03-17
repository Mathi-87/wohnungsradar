/**
 * Scraping-Scheduler
 *
 * Startet die Scraper regelmässig nach einem gestaffelten Zeitplan:
 *
 * Tier 1 – Grosse Portale (Flatfox, Homegate, ImmoScout24): jede Stunde
 * Tier 2 – Verwaltungs-Websites (Von Graffenried, etc.):    alle 4 Stunden
 * Tier 3 – Genossenschaften (laos.io, Fambau, WOGENO, etc.): alle 12 Stunden
 *
 * Der Scheduler wird beim Serverstart automatisch gestartet (in server.ts).
 */

import cron from 'node-cron';

// Tier 1: Grosse Portale (viele neue Inserate, stündlich prüfen)
import { FlatfoxScraper } from './portals/flatfox';
import { HomegateScraper } from './portals/homegate';
import { ImmoScout24Scraper } from './portals/immoscout24';

// Tier 2: Verwaltungs-Websites (alle 4 Stunden)
import { VonGraffenriedScraper } from './verwaltungen/von-graffenried';

// Tier 3: Genossenschaften (alle 12 Stunden – selten neue Inserate)
import { LaosScraper } from './genossenschaften/laos';
import { FambauScraper } from './genossenschaften/fambau';
import { WbgNeuhausScraper } from './genossenschaften/wbg-neuhaus';
import { WogenoScraper } from './genossenschaften/wogeno';

// Abstrakter Typ für Scraper-Klassen (alle haben einen parameterlosen Konstruktor)
type ScraperClass = new () => { run(): Promise<{ newCount: number; updatedCount: number; errorCount: number }> };

const TIER1_SCRAPERS: ScraperClass[] = [
  FlatfoxScraper,
  HomegateScraper,
  ImmoScout24Scraper,
];

const TIER2_SCRAPERS: ScraperClass[] = [
  VonGraffenriedScraper,
];

const TIER3_SCRAPERS: ScraperClass[] = [
  LaosScraper,       // Aggregiert alle Berner Genossenschaften!
  FambauScraper,     // Grösste Berner Genossenschaft
  WbgNeuhausScraper, // Köniz/Wabern-Region
  WogenoScraper,     // Stadt Bern
];

// Verhindert gleichzeitige Scraper-Läufe pro Tier
const isRunning: Record<string, boolean> = { tier1: false, tier2: false, tier3: false };

/**
 * Führt eine Liste von Scrapern nacheinander aus.
 * Gibt Gesamtstatistiken zurück.
 */
export async function runScrapers(scraperClasses: ScraperClass[], tierName: string): Promise<void> {
  if (isRunning[tierName]) {
    console.log(`[scheduler] ${tierName} läuft noch – überspringe`);
    return;
  }

  isRunning[tierName] = true;
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  console.log(`\n[scheduler] === ${tierName.toUpperCase()} Start ${timestamp} ===`);

  let totalNew = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const ScraperClass of scraperClasses) {
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
  console.log(`[scheduler] === ${tierName.toUpperCase()} Fertig in ${durationSec}s: ${totalNew} neu, ${totalUpdated} aktualisiert, ${totalErrors} Fehler ===\n`);

  isRunning[tierName] = false;
}

/**
 * Rückwärtskompatible Funktion – führt ALLE Scraper aus (alle Tiers).
 * Wird von run-scraper.ts (GitHub Actions) aufgerufen.
 */
export async function runAllScrapers(): Promise<void> {
  await runScrapers(TIER1_SCRAPERS, 'tier1');
  await runScrapers(TIER2_SCRAPERS, 'tier2');
  await runScrapers(TIER3_SCRAPERS, 'tier3');
}

/**
 * Startet den automatischen Cron-Scheduler.
 * Wird beim Serverstart aufgerufen.
 *
 * Zeitpläne:
 * - Tier 1: "0 * * * *"    = jede Stunde zur vollen Stunde
 * - Tier 2: "0 * /4 * * *" = alle 4 Stunden (00:00, 04:00, 08:00, ...)
 * - Tier 3: "0 6,18 * * *"= 2x täglich (06:00 und 18:00 Uhr)
 */
export function startScheduler(): void {
  console.log('[scheduler] Cron-Scheduler gestartet');
  console.log('[scheduler]   Tier 1 (Portale):        stündlich');
  console.log('[scheduler]   Tier 2 (Verwaltungen):   alle 4 Stunden');
  console.log('[scheduler]   Tier 3 (Genossenschaften): 2× täglich');

  // Tier 1: Stündlich
  cron.schedule('0 * * * *', () => {
    runScrapers(TIER1_SCRAPERS, 'tier1').catch(err =>
      console.error('[scheduler] Tier1 Fehler:', err)
    );
  });

  // Tier 2: Alle 4 Stunden
  cron.schedule('0 */4 * * *', () => {
    runScrapers(TIER2_SCRAPERS, 'tier2').catch(err =>
      console.error('[scheduler] Tier2 Fehler:', err)
    );
  });

  // Tier 3: Morgens und Abends (06:00 und 18:00)
  cron.schedule('0 6,18 * * *', () => {
    runScrapers(TIER3_SCRAPERS, 'tier3').catch(err =>
      console.error('[scheduler] Tier3 Fehler:', err)
    );
  });

  // Beim ersten Start: alle Tiers mit kurzer Verzögerung ausführen
  setTimeout(async () => {
    console.log('[scheduler] Erster Lauf nach Serverstart...');
    await runScrapers(TIER1_SCRAPERS, 'tier1');
    await runScrapers(TIER2_SCRAPERS, 'tier2');
    await runScrapers(TIER3_SCRAPERS, 'tier3');
  }, 10_000); // 10 Sekunden warten bis Server vollständig hochgefahren
}
