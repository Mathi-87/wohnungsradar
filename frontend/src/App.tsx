/**
 * WohnungsRadar – Haupt-App
 *
 * Navigationspunkte:
 * 1. "Inserate"  → Listing-Liste mit Filtern + Detail-Modal
 * 2. "Quellen"   → Status der Scraping-Quellen
 */

import { useEffect, useState, useCallback } from 'react';
import type { Listing, ListingFilters } from './types';
import { fetchListings } from './api';
import { FilterBar } from './components/FilterBar';
import { ListingCard } from './components/ListingCard';
import { ListingModal } from './components/ListingModal';
import { SourcesStatus } from './components/SourcesStatus';
import './App.css';

// Standard-Suchprofil (aus der Spezifikation)
const DEFAULT_FILTERS: ListingFilters = {
  rooms_min: 4,
  rooms_max: 7,
  rent_max: 3500,
  is_active: true,
  limit: 50,
  offset: 0,
};

type Page = 'listings' | 'sources';

function App() {
  const [page, setPage] = useState<Page>('listings');
  const [listings, setListings] = useState<Listing[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<ListingFilters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Listing | null>(null);

  // Inserate laden wenn Filter sich ändert
  const loadListings = useCallback(async () => {
    if (page !== 'listings') return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchListings(filters);
      setListings(result.listings ?? []);
      setTotalCount(result.total ?? result.listings?.length ?? 0);
    } catch (err: any) {
      if (err.code === 'ERR_NETWORK') {
        setError('Keine Verbindung zum Backend. Läuft der Server? (npm run dev im backend-Ordner)');
      } else {
        setError('Fehler beim Laden der Inserate');
      }
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  return (
    <div style={styles.app}>
      {/* Navigation */}
      <header style={styles.header}>
        <div style={styles.logo}>
          🏠 WohnungsRadar
          <span style={styles.logoSub}>Region Bern</span>
        </div>
        <nav style={styles.nav}>
          <NavBtn active={page === 'listings'} onClick={() => setPage('listings')}>
            Inserate
          </NavBtn>
          <NavBtn active={page === 'sources'} onClick={() => setPage('sources')}>
            Quellen
          </NavBtn>
        </nav>
      </header>

      {/* Hauptinhalt */}
      <main style={styles.main}>
        {page === 'listings' && (
          <>
            {/* Filter */}
            <FilterBar
              filters={filters}
              onChange={setFilters}
              totalCount={totalCount}
            />

            {/* Lade-Status / Fehler */}
            {loading && <div style={styles.statusMsg}>⏳ Lade Inserate...</div>}
            {error && <div style={styles.errorMsg}>{error}</div>}

            {/* Leere Suche */}
            {!loading && !error && listings.length === 0 && (
              <div style={styles.emptyState}>
                <div style={{ fontSize: '48px' }}>🏠</div>
                <h3>Keine Inserate gefunden</h3>
                <p>Versuche die Filter anzupassen oder starte einen Scraper-Lauf unter "Quellen".</p>
              </div>
            )}

            {/* Listing-Grid */}
            {!loading && listings.length > 0 && (
              <>
                <div style={styles.grid}>
                  {listings.map(listing => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      onClick={() => setSelected(listing)}
                    />
                  ))}
                </div>

                {/* Paginierung */}
                {totalCount > (filters.limit ?? 50) && (
                  <div style={styles.pagination}>
                    <button
                      style={styles.pageBtn}
                      disabled={(filters.offset ?? 0) === 0}
                      onClick={() => setFilters(f => ({ ...f, offset: Math.max(0, (f.offset ?? 0) - (f.limit ?? 50)) }))}
                    >
                      ← Zurück
                    </button>
                    <span style={styles.pageInfo}>
                      Seite {Math.floor((filters.offset ?? 0) / (filters.limit ?? 50)) + 1} /{' '}
                      {Math.ceil(totalCount / (filters.limit ?? 50))}
                    </span>
                    <button
                      style={styles.pageBtn}
                      disabled={(filters.offset ?? 0) + (filters.limit ?? 50) >= totalCount}
                      onClick={() => setFilters(f => ({ ...f, offset: (f.offset ?? 0) + (f.limit ?? 50) }))}
                    >
                      Weiter →
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {page === 'sources' && <SourcesStatus />}
      </main>

      {/* Detail-Modal */}
      {selected && (
        <ListingModal
          listing={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// Navigations-Button
function NavBtn({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : {}) }}
    >
      {children}
    </button>
  );
}

// ── Styles ─────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: '100vh',
    backgroundColor: '#f4f6f9',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    backgroundColor: '#1a2332',
    color: '#fff',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '60px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
  logo: {
    fontSize: '20px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'baseline',
    gap: '10px',
  },
  logoSub: {
    fontSize: '12px',
    fontWeight: 400,
    color: '#8899aa',
  },
  nav: { display: 'flex', gap: '4px' },
  navBtn: {
    padding: '6px 16px',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    borderRadius: '6px',
    color: '#8899aa',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  navBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  main: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '20px',
  },
  statusMsg: { padding: '40px', textAlign: 'center', color: '#6c757d' },
  errorMsg: {
    padding: '16px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  emptyState: { textAlign: 'center', padding: '60px 20px', color: '#6c757d' },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
    marginTop: '32px',
    paddingBottom: '32px',
  },
  pageBtn: {
    padding: '8px 20px',
    backgroundColor: '#fff',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  pageInfo: { color: '#6c757d', fontSize: '14px' },
};

export default App;
