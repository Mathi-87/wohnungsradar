/**
 * FilterBar – Suchfilter-Leiste
 *
 * Ermöglicht das Filtern der Wohnungsinserate nach:
 * - Zimmeranzahl
 * - Maximalmiete
 * - Mindestfläche
 * - Garten / Minergie
 * - Quelle (Portal)
 */

import type { ListingFilters } from '../types';

interface Props {
  filters: ListingFilters;
  onChange: (filters: ListingFilters) => void;
  totalCount: number;
}

// PLZ-Gruppen für die Region Bern (für die PLZ-Auswahl)
const ZIP_OPTIONS = [
  { label: 'Alle Gebiete', value: '' },
  { label: 'Bern Stadt', value: '3000,3001,3002,3003,3004,3005,3006,3007,3008,3009,3010,3011,3012,3013,3014,3015,3018,3027' },
  { label: 'Köniz / Schliern / Liebefeld', value: '3097,3098' },
  { label: 'Wabern', value: '3084' },
  { label: 'Ostermundigen', value: '3072,3073,3074' },
  { label: 'Ittigen', value: '3063' },
];

export function FilterBar({ filters, onChange, totalCount }: Props) {
  // Hilfsfunktion um einzelne Filter zu ändern ohne den Rest zu verlieren
  const set = (patch: Partial<ListingFilters>) => onChange({ ...filters, ...patch, offset: 0 });

  return (
    <div style={styles.container}>
      {/* Ergebnis-Zähler */}
      <div style={styles.count}>
        <strong>{totalCount}</strong> Inserate gefunden
      </div>

      {/* Gebiet / PLZ */}
      <div style={styles.group}>
        <label style={styles.label}>Gebiet</label>
        <select
          style={styles.select}
          value={filters.zip_codes?.join(',') ?? ''}
          onChange={e => {
            const val = e.target.value;
            set({ zip_codes: val ? val.split(',') : undefined });
          }}
        >
          {ZIP_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Zimmer */}
      <div style={styles.group}>
        <label style={styles.label}>Zimmer</label>
        <div style={styles.row}>
          <select
            style={{ ...styles.select, width: 80 }}
            value={filters.rooms_min ?? ''}
            onChange={e => set({ rooms_min: e.target.value ? parseFloat(e.target.value) : undefined })}
          >
            <option value="">ab</option>
            {[3, 3.5, 4, 4.5, 5, 5.5, 6].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span style={{ padding: '0 4px' }}>–</span>
          <select
            style={{ ...styles.select, width: 80 }}
            value={filters.rooms_max ?? ''}
            onChange={e => set({ rooms_max: e.target.value ? parseFloat(e.target.value) : undefined })}
          >
            <option value="">bis</option>
            {[4, 4.5, 5, 5.5, 6, 6.5, 7].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Maximalmiete */}
      <div style={styles.group}>
        <label style={styles.label}>Max. Miete (CHF brutto)</label>
        <select
          style={styles.select}
          value={filters.rent_max ?? ''}
          onChange={e => set({ rent_max: e.target.value ? parseInt(e.target.value) : undefined })}
        >
          <option value="">Kein Limit</option>
          <option value="2000">2'000</option>
          <option value="2500">2'500</option>
          <option value="3000">3'000</option>
          <option value="3500">3'500</option>
          <option value="4000">4'000</option>
        </select>
      </div>

      {/* Mindestfläche */}
      <div style={styles.group}>
        <label style={styles.label}>Mind. Fläche (m²)</label>
        <select
          style={styles.select}
          value={filters.area_min ?? ''}
          onChange={e => set({ area_min: e.target.value ? parseInt(e.target.value) : undefined })}
        >
          <option value="">Kein Minimum</option>
          <option value="80">80 m²</option>
          <option value="100">100 m²</option>
          <option value="120">120 m²</option>
          <option value="140">140 m²</option>
        </select>
      </div>

      {/* Checkboxen */}
      <div style={styles.group}>
        <label style={styles.label}>Extras</label>
        <div style={styles.checkboxGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={filters.has_garden ?? false}
              onChange={e => set({ has_garden: e.target.checked || undefined })}
            />
            &nbsp;🌿 Garten
          </label>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={filters.is_minergie ?? false}
              onChange={e => set({ is_minergie: e.target.checked || undefined })}
            />
            &nbsp;♻️ Minergie
          </label>
        </div>
      </div>

      {/* Quelle */}
      <div style={styles.group}>
        <label style={styles.label}>Quelle</label>
        <select
          style={styles.select}
          value={filters.source ?? ''}
          onChange={e => set({ source: e.target.value || undefined })}
        >
          <option value="">Alle Portale</option>
          <option value="flatfox">Flatfox</option>
          <option value="homegate">Homegate</option>
          <option value="immoscout24">ImmoScout24</option>
        </select>
      </div>

      {/* Reset */}
      <button
        style={styles.resetBtn}
        onClick={() => onChange({ is_active: true, limit: 50, offset: 0 })}
      >
        Filter zurücksetzen
      </button>
    </div>
  );
}

// ── Styles (Inline, kein CSS-Framework nötig) ──────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignItems: 'flex-end',
    padding: '16px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #dee2e6',
  },
  count: {
    width: '100%',
    color: '#6c757d',
    fontSize: '14px',
    marginBottom: '-8px',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#495057',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  select: {
    padding: '6px 10px',
    borderRadius: '4px',
    border: '1px solid #ced4da',
    fontSize: '14px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    minWidth: '150px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
  },
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  checkboxLabel: {
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  resetBtn: {
    padding: '6px 14px',
    backgroundColor: '#6c757d',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    alignSelf: 'flex-end',
  },
};
