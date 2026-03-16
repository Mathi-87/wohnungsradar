/**
 * SourcesStatus – Quellen-Status-Seite
 *
 * Zeigt alle konfigurierten Scraping-Quellen und deren Status:
 * - Wann zuletzt gescrapt wurde
 * - Ob ein Fehler vorliegt
 * - Wie oft gescrapt wird
 *
 * Ermöglicht auch das manuelle Auslösen eines Scraper-Laufs.
 */

import { useEffect, useState } from 'react';
import { formatDate } from '../types';
import type { ScrapeSource } from '../types';
import { fetchSources, triggerScraper, fetchScraperStatus } from '../api';

export function SourcesStatus() {
  const [sources, setSources] = useState<ScrapeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scraperRunning, setScraperRunning] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  // Quellen laden
  useEffect(() => {
    loadSources();
    checkScraperStatus();
  }, []);

  async function loadSources() {
    try {
      setLoading(true);
      const data = await fetchSources();
      setSources(data);
    } catch {
      setError('Quellen konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }

  async function checkScraperStatus() {
    try {
      const status = await fetchScraperStatus();
      setScraperRunning(status.running);
    } catch { /* ignorieren */ }
  }

  // Alle Scraper manuell starten
  async function handleTriggerAll() {
    try {
      setScraperRunning(true);
      setTriggerMsg(null);
      const result = await triggerScraper();
      setTriggerMsg(result.message);
    } catch {
      setTriggerMsg('Fehler beim Starten der Scraper');
      setScraperRunning(false);
    }
  }

  // Einzelnen Scraper starten
  async function handleTriggerOne(sourceName: string) {
    try {
      setTriggerMsg(null);
      const result = await triggerScraper(sourceName);
      setTriggerMsg(`${sourceName}: ${result.message ?? 'Gestartet'}`);
    } catch {
      setTriggerMsg(`Fehler beim Starten von ${sourceName}`);
    }
  }

  // Tier-Bezeichnungen
  const tierLabels: Record<number, string> = {
    1: 'Tier 1 – Grosse Portale',
    2: 'Tier 2 – Verwaltungen',
    3: 'Tier 3 – Genossenschaften',
    4: 'Tier 4 – Sonstige',
  };

  // Quellen nach Tier gruppieren
  const grouped = sources.reduce((acc, source) => {
    const tier = source.tier;
    if (!acc[tier]) acc[tier] = [];
    acc[tier].push(source);
    return acc;
  }, {} as Record<number, ScrapeSource[]>);

  if (loading) return <div style={styles.loading}>Lade Quellen...</div>;
  if (error) return <div style={styles.error}>{error}</div>;

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <h2 style={styles.heading}>Scraping-Quellen</h2>
        <div style={styles.controls}>
          {scraperRunning && (
            <span style={styles.runningBadge}>⏳ Scraper läuft...</span>
          )}
          <button
            style={{ ...styles.btn, ...(scraperRunning ? styles.btnDisabled : {}) }}
            onClick={handleTriggerAll}
            disabled={scraperRunning}
          >
            ▶ Alle Scraper jetzt starten
          </button>
        </div>
      </div>

      {triggerMsg && (
        <div style={styles.triggerMsg}>{triggerMsg}</div>
      )}

      {/* Nach Tier gruppiert anzeigen */}
      {[1, 2, 3, 4].map(tier => {
        const tierSources = grouped[tier];
        if (!tierSources?.length) return null;

        return (
          <div key={tier} style={styles.tierSection}>
            <h3 style={styles.tierTitle}>{tierLabels[tier]}</h3>
            <div style={styles.table}>
              {tierSources.map(source => (
                <SourceRow
                  key={source.id}
                  source={source}
                  onTrigger={() => handleTriggerOne(source.name)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {sources.length === 0 && (
        <div style={styles.empty}>
          Keine Quellen konfiguriert. Das DB-Schema muss noch in Supabase ausgeführt werden.
        </div>
      )}
    </div>
  );
}

// Einzelne Zeile in der Quellen-Tabelle
function SourceRow({ source, onTrigger }: { source: ScrapeSource; onTrigger: () => void }) {
  const hasError = Boolean(source.last_error);
  const isRecent = source.last_scraped_at
    ? (Date.now() - new Date(source.last_scraped_at).getTime()) < 2 * 60 * 60 * 1000 // < 2 Stunden
    : false;

  return (
    <div style={{ ...styles.row, ...(hasError ? styles.rowError : {}) }}>
      {/* Status-Indikator */}
      <div style={styles.statusDot}>
        {!source.is_active ? '⚫' : hasError ? '🔴' : isRecent ? '🟢' : '🟡'}
      </div>

      {/* Name & URL */}
      <div style={styles.nameCol}>
        <strong>{source.display_name ?? source.name}</strong>
        <a href={source.base_url} target="_blank" rel="noopener noreferrer" style={styles.urlLink}>
          {source.base_url}
        </a>
      </div>

      {/* Letzter Lauf */}
      <div style={styles.dateCol}>
        {source.last_scraped_at
          ? <span title={source.last_scraped_at}>{formatDate(source.last_scraped_at)}</span>
          : <span style={{ color: '#adb5bd' }}>Noch nie</span>
        }
      </div>

      {/* Intervall */}
      <div style={styles.intervalCol}>
        alle {source.scrape_interval_minutes} Min.
      </div>

      {/* Fehler */}
      <div style={styles.errorCol}>
        {hasError && (
          <span title={source.last_error ?? ''} style={styles.errorText}>
            ⚠️ {source.last_error?.substring(0, 60)}...
          </span>
        )}
      </div>

      {/* Trigger-Button (nur für Tier 1 – Portale) */}
      {source.tier === 1 && (
        <button style={styles.triggerBtn} onClick={onTrigger}>
          ▶
        </button>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '0' },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  heading: { margin: 0, fontSize: '20px' },
  controls: { display: 'flex', alignItems: 'center', gap: '12px' },
  runningBadge: {
    fontSize: '13px',
    color: '#856404',
    backgroundColor: '#fff3cd',
    padding: '4px 12px',
    borderRadius: '12px',
  },
  btn: {
    padding: '8px 16px',
    backgroundColor: '#0d6efd',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  },
  btnDisabled: {
    backgroundColor: '#6c757d',
    cursor: 'not-allowed',
  },
  triggerMsg: {
    padding: '10px 14px',
    backgroundColor: '#d1e7dd',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  tierSection: { marginBottom: '24px' },
  tierTitle: {
    fontSize: '14px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#6c757d',
    margin: '0 0 8px',
  },
  table: {
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 14px',
    gap: '12px',
    borderBottom: '1px solid #f1f3f5',
    backgroundColor: '#fff',
    fontSize: '13px',
  },
  rowError: { backgroundColor: '#fff5f5' },
  statusDot: { fontSize: '14px', flexShrink: 0, width: '20px' },
  nameCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: '0 0 200px',
  },
  urlLink: {
    fontSize: '11px',
    color: '#6c757d',
    textDecoration: 'none',
  },
  dateCol: { flex: '0 0 100px', color: '#495057' },
  intervalCol: { flex: '0 0 120px', color: '#6c757d' },
  errorCol: { flex: 1, overflow: 'hidden' },
  errorText: { color: '#dc3545', fontSize: '12px' },
  triggerBtn: {
    padding: '4px 10px',
    backgroundColor: '#e9f5e9',
    border: '1px solid #b8ddb8',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#198754',
    flexShrink: 0,
  },
  loading: { padding: '40px', textAlign: 'center', color: '#6c757d' },
  error: { padding: '20px', color: '#dc3545' },
  empty: { padding: '40px', textAlign: 'center', color: '#6c757d' },
};
