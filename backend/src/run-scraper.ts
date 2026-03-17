/**
 * Scraper-Einstiegspunkt für GitHub Actions
 *
 * Dieser Script läuft einmalig, scrapt alle Portale und beendet sich dann.
 * Er wird vom GitHub Actions Workflow (.github/workflows/scraper.yml) aufgerufen.
 *
 * Anders als server.ts startet er keinen HTTP-Server und keinen Cron-Scheduler.
 */

import 'dotenv/config';
import { runAllScrapers } from './scrapers/scheduler';

async function main() {
  console.log('=== WohnungsRadar Scraper (GitHub Actions) ===');
  console.log(`Startzeit: ${new Date().toISOString()}`);

  try {
    await runAllScrapers();
    console.log('\nScraper erfolgreich abgeschlossen.');
    process.exit(0);
  } catch (err) {
    console.error('\nScraper fehlgeschlagen:', err);
    process.exit(1);
  }
}

main();
