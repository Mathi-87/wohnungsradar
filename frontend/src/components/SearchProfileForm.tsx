/**
 * SearchProfileForm – Modal zum Erstellen / Bearbeiten eines Suchprofils
 *
 * Felder:
 * - Name des Profils
 * - PLZ-Filter (kommagetrennt eingeben)
 * - Zimmer min/max
 * - Maximalmiete brutto
 * - Mindestfläche
 * - Ausstattungsmerkmale (Garten, Balkon, etc.)
 * - E-Mail-Benachrichtigung an/aus
 */

import { useState } from 'react';
import type { SearchProfile, SearchProfileInput } from '../types';

interface Props {
  initial?: SearchProfile;          // Wenn gesetzt: Bearbeiten-Modus
  onSave: (data: SearchProfileInput) => Promise<void>;
  onClose: () => void;
}

const EMPTY: SearchProfileInput = {
  name: '',
  zip_codes: null,
  rooms_min: null,
  rooms_max: null,
  rent_gross_max: null,
  area_min: null,
  has_garden: false,
  has_balcony: false,
  has_lift: false,
  is_minergie: false,
  notify_email: true,
  is_active: true,
};

export function SearchProfileForm({ initial, onSave, onClose }: Props) {
  const [form, setForm] = useState<SearchProfileInput>(
    initial ? {
      name: initial.name,
      zip_codes: initial.zip_codes,
      rooms_min: initial.rooms_min,
      rooms_max: initial.rooms_max,
      rent_gross_max: initial.rent_gross_max,
      area_min: initial.area_min,
      has_garden: initial.has_garden,
      has_balcony: initial.has_balcony,
      has_lift: initial.has_lift,
      is_minergie: initial.is_minergie,
      notify_email: initial.notify_email,
      is_active: initial.is_active,
    } : EMPTY
  );

  // PLZ als kommagetrennte Zeichenkette für das Eingabefeld
  const [zipInput, setZipInput] = useState(initial?.zip_codes?.join(', ') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SearchProfileInput>(key: K, value: SearchProfileInput[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function numOrNull(val: string): number | null {
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Bitte einen Namen eingeben.'); return; }

    // PLZ-Eingabe parsen: "3011, 3012 3013" → ["3011","3012","3013"]
    const zips = zipInput
      .split(/[\s,;]+/)
      .map(z => z.trim())
      .filter(z => /^\d{4}$/.test(z));

    const data: SearchProfileInput = {
      ...form,
      zip_codes: zips.length > 0 ? zips : null,
    };

    setLoading(true);
    try {
      await onSave(data);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={styles.title}>
          {initial ? 'Suchprofil bearbeiten' : 'Neues Suchprofil'}
        </h2>

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Name */}
          <Field label="Name des Profils *">
            <input
              style={styles.input}
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder='z.B. "Familienwohnung Bern"'
              autoFocus
              required
            />
          </Field>

          {/* PLZ */}
          <Field label="PLZ-Filter" hint="Kommagetrennt, z.B. 3011, 3012 – leer = alle PLZ">
            <input
              style={styles.input}
              type="text"
              value={zipInput}
              onChange={e => setZipInput(e.target.value)}
              placeholder="3011, 3012, 3013 ..."
            />
          </Field>

          {/* Zimmer */}
          <div style={styles.row}>
            <Field label="Zimmer min." style={{ flex: 1 }}>
              <input
                style={styles.input}
                type="number"
                step="0.5"
                min="1"
                max="20"
                value={form.rooms_min ?? ''}
                onChange={e => set('rooms_min', numOrNull(e.target.value))}
                placeholder="z.B. 4"
              />
            </Field>
            <Field label="Zimmer max." style={{ flex: 1 }}>
              <input
                style={styles.input}
                type="number"
                step="0.5"
                min="1"
                max="20"
                value={form.rooms_max ?? ''}
                onChange={e => set('rooms_max', numOrNull(e.target.value))}
                placeholder="z.B. 7"
              />
            </Field>
          </div>

          {/* Miete + Fläche */}
          <div style={styles.row}>
            <Field label="Max. Miete brutto (CHF)" style={{ flex: 1 }}>
              <input
                style={styles.input}
                type="number"
                step="100"
                min="0"
                value={form.rent_gross_max ?? ''}
                onChange={e => set('rent_gross_max', numOrNull(e.target.value))}
                placeholder="z.B. 3500"
              />
            </Field>
            <Field label="Mindestfläche (m²)" style={{ flex: 1 }}>
              <input
                style={styles.input}
                type="number"
                step="5"
                min="0"
                value={form.area_min ?? ''}
                onChange={e => set('area_min', numOrNull(e.target.value))}
                placeholder="z.B. 100"
              />
            </Field>
          </div>

          {/* Ausstattung */}
          <div style={styles.fieldGroup}>
            <div style={styles.label}>Ausstattung (nur Inserate mit diesen Merkmalen)</div>
            <div style={styles.checkboxGrid}>
              {([
                ['has_garden',  'Garten'],
                ['has_balcony', 'Balkon / Terrasse'],
                ['has_lift',    'Lift'],
                ['is_minergie', 'Minergie-Zertifikat'],
              ] as [keyof SearchProfileInput, string][]).map(([key, label]) => (
                <label key={key} style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={!!form[key]}
                    onChange={e => set(key, e.target.checked as any)}
                    style={{ marginRight: '6px' }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* E-Mail-Benachrichtigung */}
          <label style={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={form.notify_email}
              onChange={e => set('notify_email', e.target.checked)}
              style={{ marginRight: '8px', width: '16px', height: '16px' }}
            />
            <span>
              <strong>E-Mail-Benachrichtigung aktivieren</strong>
              <br />
              <span style={{ fontSize: '12px', color: '#6c757d' }}>
                Du wirst per E-Mail informiert wenn neue Inserate gefunden werden.
              </span>
            </span>
          </label>

          {error && <div style={styles.error}>{error}</div>}

          {/* Buttons */}
          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              Abbrechen
            </button>
            <button type="submit" disabled={loading} style={styles.saveBtn}>
              {loading ? 'Speichern...' : initial ? 'Änderungen speichern' : 'Profil erstellen'}
            </button>
          </div>
        </form>

        <button onClick={onClose} style={styles.closeBtn} aria-label="Schliessen">✕</button>
      </div>
    </div>
  );
}

// Hilfskomponente: Formularfeld mit Label
function Field({
  label,
  hint,
  style,
  children,
}: {
  label: string;
  hint?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      <label style={styles.label}>{label}</label>
      {hint && <span style={styles.hint}>{hint}</span>}
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '32px',
    width: '100%',
    maxWidth: '560px',
    position: 'relative',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  title: { margin: '0 0 24px', fontSize: '20px', color: '#1a2332' },
  form: { display: 'flex', flexDirection: 'column', gap: '18px' },
  row: { display: 'flex', gap: '12px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '14px', fontWeight: 500, color: '#495057' },
  hint: { fontSize: '12px', color: '#6c757d' },
  input: {
    padding: '10px 12px',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  },
  checkboxGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    color: '#495057',
    cursor: 'pointer',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '4px',
    cursor: 'pointer',
    padding: '12px',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    backgroundColor: '#f8f9fa',
    fontSize: '14px',
    color: '#1a2332',
  },
  error: {
    padding: '10px 12px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderRadius: '8px',
    fontSize: '13px',
  },
  actions: { display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' },
  cancelBtn: {
    padding: '10px 20px',
    border: '1px solid #dee2e6',
    backgroundColor: '#fff',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    color: '#495057',
  },
  saveBtn: {
    padding: '10px 24px',
    backgroundColor: '#0d6efd',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  closeBtn: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#6c757d',
    padding: '4px',
    lineHeight: 1,
  },
};
