/**
 * FilterBar – Umfassende Suchfilter-Leiste
 *
 * Bietet flexible Filtermöglichkeiten:
 * - Freitextsuche (Titel / Adresse)
 * - PLZ-Auswahl (Mehrfachauswahl aus Gebieten + freie Eingabe)
 * - Zimmeranzahl (Min / Max als Zahleneingabe)
 * - Mietpreis (Min / Max in CHF)
 * - Wohnfläche (Min / Max in m²)
 * - Ausstattung (alle verfügbaren Features als Checkboxen)
 * - Quelle (Portal-Auswahl)
 * - Sortierung (nach Datum, Preis, Zimmer, Fläche)
 * - Erweiterte Filter (ein-/ausklappbar)
 */

import { useState } from 'react';
import type { ListingFilters } from '../types';

interface Props {
  filters: ListingFilters;
  onChange: (filters: ListingFilters) => void;
  totalCount: number;
}

// Vordefinierte PLZ-Gruppen für die Region Bern
const ZIP_GROUPS = [
  { label: 'Bern Stadt', zips: ['3000','3001','3002','3003','3004','3005','3006','3007','3008','3009','3010','3011','3012','3013','3014','3015','3018','3027'] },
  { label: 'Köniz / Schliern / Liebefeld', zips: ['3097','3098'] },
  { label: 'Wabern', zips: ['3084'] },
  { label: 'Ostermundigen', zips: ['3072','3073','3074'] },
  { label: 'Ittigen', zips: ['3063'] },
  { label: 'Muri / Gümligen', zips: ['3074','3073'] },
  { label: 'Worb', zips: ['3076'] },
  { label: 'Münsingen', zips: ['3110'] },
  { label: 'Zollikofen', zips: ['3052'] },
  { label: 'Bolligen', zips: ['3065'] },
];

// Alle PLZ-Gruppen zusammengeführt (für "Alle Region Bern")
const ALL_REGION_ZIPS = Array.from(new Set(ZIP_GROUPS.flatMap(g => g.zips)));

export function FilterBar({ filters, onChange, totalCount }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [zipText, setZipText] = useState(''); // Freie PLZ-Eingabe

  // Einzelne Filter ändern ohne den Rest zu verlieren
  const set = (patch: Partial<ListingFilters>) =>
    onChange({ ...filters, ...patch, offset: 0 });

  // Hilfsfunktion: Zahl aus Input auslesen (oder undefined wenn leer)
  const num = (val: string): number | undefined =>
    val.trim() === '' ? undefined : parseFloat(val);

  // PLZ-Gruppe toggled: wird sie aktiviert oder deaktiviert?
  const toggleZipGroup = (zips: string[]) => {
    const current = filters.zip_codes ?? [];
    const allActive = zips.every(z => current.includes(z));
    if (allActive) {
      // Entfernen
      const next = current.filter(z => !zips.includes(z));
      set({ zip_codes: next.length > 0 ? next : undefined });
    } else {
      // Hinzufügen (Duplikate vermeiden)
      const next = Array.from(new Set([...current, ...zips]));
      set({ zip_codes: next });
    }
  };

  // Prüfen ob eine PLZ-Gruppe aktiv ist (alle ihre PLZs sind ausgewählt)
  const isGroupActive = (zips: string[]) =>
    zips.every(z => (filters.zip_codes ?? []).includes(z));

  // Freie PLZ-Eingabe verarbeiten (Enter oder Blur)
  const applyZipText = () => {
    const entered = zipText.trim();
    if (!entered) return;
    const parsed = entered.split(/[\s,;]+/).filter(Boolean);
    const current = filters.zip_codes ?? [];
    const next = Array.from(new Set([...current, ...parsed]));
    set({ zip_codes: next });
    setZipText('');
  };

  // Feature-Checkbox-Felder
  type BoolKey = 'has_garden' | 'has_terrace' | 'has_balcony' | 'has_lift' |
                 'has_own_washer' | 'has_parking' | 'is_minergie' | 'is_child_friendly';

  const toggleFeature = (key: BoolKey) => {
    set({ [key]: filters[key] ? undefined : true });
  };

  const activeFilterCount = [
    filters.zip_codes?.length,
    filters.rooms_min, filters.rooms_max,
    filters.rent_min, filters.rent_max,
    filters.area_min, filters.area_max,
    filters.has_garden, filters.has_terrace, filters.has_balcony,
    filters.has_lift, filters.has_own_washer, filters.has_parking,
    filters.is_minergie, filters.is_child_friendly,
    filters.source, filters.search,
  ].filter(Boolean).length;

  return (
    <div style={s.container}>

      {/* ── Zeile 1: Trefferzahl + Suchtext + Sortierung ── */}
      <div style={s.topRow}>
        <div style={s.count}>
          <strong>{totalCount.toLocaleString('de-CH')}</strong> Inserate gefunden
          {activeFilterCount > 0 && (
            <span style={s.badge}>{activeFilterCount} Filter aktiv</span>
          )}
        </div>
        <div style={s.searchSort}>
          {/* Freitextsuche */}
          <input
            style={s.searchInput}
            type="text"
            placeholder="Suche in Titel / Adresse..."
            value={filters.search ?? ''}
            onChange={e => set({ search: e.target.value || undefined })}
          />
          {/* Sortierung */}
          <select
            style={s.select}
            value={`${filters.sort_by ?? 'first_seen_at'}|${filters.sort_order ?? 'desc'}`}
            onChange={e => {
              const [by, order] = e.target.value.split('|');
              set({
                sort_by: by as ListingFilters['sort_by'],
                sort_order: order as ListingFilters['sort_order'],
              });
            }}
          >
            <option value="first_seen_at|desc">Neueste zuerst</option>
            <option value="first_seen_at|asc">Älteste zuerst</option>
            <option value="rent_gross|asc">Preis aufsteigend</option>
            <option value="rent_gross|desc">Preis absteigend</option>
            <option value="rooms|asc">Zimmer aufsteigend</option>
            <option value="rooms|desc">Zimmer absteigend</option>
            <option value="area_m2|desc">Fläche grösste zuerst</option>
            <option value="area_m2|asc">Fläche kleinste zuerst</option>
          </select>
        </div>
      </div>

      {/* ── Zeile 2: Hauptfilter ── */}
      <div style={s.mainFilters}>

        {/* Zimmer */}
        <div style={s.group}>
          <label style={s.label}>Zimmer</label>
          <div style={s.rangeRow}>
            <input
              style={s.numInput}
              type="number"
              step="0.5"
              min="1"
              max="20"
              placeholder="ab"
              value={filters.rooms_min ?? ''}
              onChange={e => set({ rooms_min: num(e.target.value) })}
            />
            <span style={s.dash}>–</span>
            <input
              style={s.numInput}
              type="number"
              step="0.5"
              min="1"
              max="20"
              placeholder="bis"
              value={filters.rooms_max ?? ''}
              onChange={e => set({ rooms_max: num(e.target.value) })}
            />
          </div>
        </div>

        {/* Miete */}
        <div style={s.group}>
          <label style={s.label}>Miete (CHF brutto)</label>
          <div style={s.rangeRow}>
            <input
              style={s.numInput}
              type="number"
              step="100"
              min="0"
              placeholder="ab"
              value={filters.rent_min ?? ''}
              onChange={e => set({ rent_min: num(e.target.value) })}
            />
            <span style={s.dash}>–</span>
            <input
              style={s.numInput}
              type="number"
              step="100"
              min="0"
              placeholder="max"
              value={filters.rent_max ?? ''}
              onChange={e => set({ rent_max: num(e.target.value) })}
            />
          </div>
        </div>

        {/* Fläche */}
        <div style={s.group}>
          <label style={s.label}>Fläche (m²)</label>
          <div style={s.rangeRow}>
            <input
              style={s.numInput}
              type="number"
              step="5"
              min="0"
              placeholder="ab"
              value={filters.area_min ?? ''}
              onChange={e => set({ area_min: num(e.target.value) })}
            />
            <span style={s.dash}>–</span>
            <input
              style={s.numInput}
              type="number"
              step="5"
              min="0"
              placeholder="max"
              value={filters.area_max ?? ''}
              onChange={e => set({ area_max: num(e.target.value) })}
            />
          </div>
        </div>

        {/* Quelle */}
        <div style={s.group}>
          <label style={s.label}>Quelle</label>
          <select
            style={s.select}
            value={filters.source ?? ''}
            onChange={e => set({ source: e.target.value || undefined })}
          >
            <option value="">Alle Portale</option>
            <option value="flatfox">Flatfox</option>
            <option value="homegate">Homegate</option>
            <option value="immoscout24">ImmoScout24</option>
          </select>
        </div>
      </div>

      {/* ── Zeile 3: PLZ-Auswahl (Chips) ── */}
      <div style={s.zipSection}>
        <label style={s.label}>Gebiet / PLZ</label>
        <div style={s.chipRow}>
          {/* "Alle Region" Chip */}
          <button
            style={{
              ...s.chip,
              ...(filters.zip_codes === undefined ? s.chipActive : {}),
            }}
            onClick={() => set({ zip_codes: undefined })}
          >
            Alle Region
          </button>
          {ZIP_GROUPS.map(group => (
            <button
              key={group.label}
              style={{
                ...s.chip,
                ...(isGroupActive(group.zips) ? s.chipActive : {}),
              }}
              onClick={() => toggleZipGroup(group.zips)}
            >
              {group.label}
            </button>
          ))}
          {/* Freie PLZ-Eingabe */}
          <input
            style={s.zipInput}
            type="text"
            placeholder="PLZ eingeben (z.B. 3006)"
            value={zipText}
            onChange={e => setZipText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyZipText()}
            onBlur={applyZipText}
          />
        </div>
        {/* Aktive PLZs als Tags anzeigen */}
        {filters.zip_codes && filters.zip_codes.length > 0 && (
          <div style={s.activeZips}>
            <span style={{ color: '#6c757d', fontSize: '12px' }}>Aktive PLZs: </span>
            {filters.zip_codes.map(z => (
              <span key={z} style={s.zipTag}>
                {z}
                <button
                  style={s.removeTag}
                  onClick={() => {
                    const next = filters.zip_codes!.filter(x => x !== z);
                    set({ zip_codes: next.length > 0 ? next : undefined });
                  }}
                >×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Zeile 4: Ausstattung ── */}
      <div style={s.featureSection}>
        <label style={s.label}>Ausstattung</label>
        <div style={s.featureGrid}>
          {([
            { key: 'has_garden',      label: 'Garten',           icon: '🌿' },
            { key: 'has_terrace',     label: 'Terrasse',         icon: '🪴' },
            { key: 'has_balcony',     label: 'Balkon',           icon: '🏗️' },
            { key: 'has_lift',        label: 'Lift',             icon: '🛗' },
            { key: 'has_own_washer',  label: 'Waschmaschine',    icon: '🫧' },
            { key: 'has_parking',     label: 'Parkplatz',        icon: '🅿️' },
            { key: 'is_minergie',     label: 'Minergie',         icon: '♻️' },
            { key: 'is_child_friendly', label: 'Kinderfreundlich', icon: '👶' },
          ] as { key: BoolKey; label: string; icon: string }[]).map(({ key, label, icon }) => (
            <label key={key} style={s.featureLabel}>
              <input
                type="checkbox"
                checked={filters[key] === true}
                onChange={() => toggleFeature(key)}
                style={{ marginRight: 6 }}
              />
              {icon} {label}
            </label>
          ))}
        </div>
      </div>

      {/* ── Reset ── */}
      <div style={s.bottomRow}>
        <button
          style={s.resetBtn}
          onClick={() => onChange({ is_active: true, limit: 50, offset: 0 })}
        >
          Filter zurücksetzen
        </button>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
    border: '1px solid #dee2e6',
    padding: '16px 20px',
    marginBottom: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
  },
  count: {
    fontSize: '14px',
    color: '#6c757d',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  badge: {
    backgroundColor: '#0d6efd',
    color: '#fff',
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '99px',
    fontWeight: 600,
  },
  searchSort: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  searchInput: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #ced4da',
    fontSize: '14px',
    width: '240px',
    backgroundColor: '#fff',
  },
  mainFilters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignItems: 'flex-end',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#495057',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: '2px',
  },
  rangeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  numInput: {
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid #ced4da',
    fontSize: '14px',
    width: '80px',
    backgroundColor: '#fff',
    textAlign: 'center',
  },
  dash: {
    color: '#6c757d',
    fontSize: '14px',
    padding: '0 2px',
  },
  select: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid #ced4da',
    fontSize: '14px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    minWidth: '140px',
  },
  zipSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
  },
  chip: {
    padding: '4px 12px',
    borderRadius: '99px',
    border: '1px solid #ced4da',
    backgroundColor: '#fff',
    fontSize: '13px',
    cursor: 'pointer',
    color: '#495057',
    transition: 'all 0.15s',
  },
  chipActive: {
    backgroundColor: '#0d6efd',
    borderColor: '#0d6efd',
    color: '#fff',
    fontWeight: 600,
  },
  zipInput: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid #ced4da',
    fontSize: '13px',
    backgroundColor: '#fff',
    width: '180px',
  },
  activeZips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    alignItems: 'center',
  },
  zipTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    backgroundColor: '#e7f3ff',
    color: '#0a58ca',
    border: '1px solid #b6d4fe',
    borderRadius: '4px',
    fontSize: '12px',
    padding: '1px 6px',
  },
  removeTag: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#0a58ca',
    fontWeight: 700,
    fontSize: '14px',
    padding: 0,
    lineHeight: 1,
  },
  featureSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '6px',
  },
  featureLabel: {
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: '6px',
    backgroundColor: '#fff',
    border: '1px solid #e9ecef',
    userSelect: 'none',
  },
  bottomRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  resetBtn: {
    padding: '6px 16px',
    backgroundColor: '#6c757d',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
  },
};
