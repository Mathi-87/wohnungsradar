/**
 * SearchProfiles – Suchprofil-Verwaltung
 *
 * Zeigt alle Suchprofile des eingeloggten Users und erlaubt:
 * - Neues Profil erstellen
 * - Profil bearbeiten
 * - Profil aktivieren / deaktivieren
 * - Profil löschen
 */

import { useEffect, useState } from 'react';
import type { SearchProfile, SearchProfileInput } from '../types';
import {
  fetchSearchProfiles,
  createSearchProfile,
  updateSearchProfile,
  deleteSearchProfile,
} from '../api';
import { SearchProfileForm } from './SearchProfileForm';

export function SearchProfiles() {
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<SearchProfile | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setProfiles(await fetchSearchProfiles());
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(data: SearchProfileInput) {
    if (editProfile) {
      await updateSearchProfile(editProfile.id, data);
    } else {
      await createSearchProfile(data);
    }
    await load();
  }

  async function handleToggleActive(profile: SearchProfile) {
    await updateSearchProfile(profile.id, { is_active: !profile.is_active });
    setProfiles(ps => ps.map(p => p.id === profile.id ? { ...p, is_active: !p.is_active } : p));
  }

  async function handleDelete(profile: SearchProfile) {
    if (!confirm(`Suchprofil "${profile.name}" wirklich löschen?`)) return;
    await deleteSearchProfile(profile.id);
    setProfiles(ps => ps.filter(p => p.id !== profile.id));
  }

  return (
    <div>
      {/* Header */}
      <div style={styles.pageHeader}>
        <div>
          <h2 style={styles.pageTitle}>Meine Suchprofile</h2>
          <p style={styles.pageSubtitle}>
            Lege Kriterien fest und erhalte E-Mail-Benachrichtigungen bei neuen Inseraten.
          </p>
        </div>
        <button
          style={styles.newBtn}
          onClick={() => { setEditProfile(null); setFormOpen(true); }}
        >
          + Neues Profil
        </button>
      </div>

      {/* Status */}
      {loading && <div style={styles.status}>⏳ Lade Suchprofile...</div>}
      {error && <div style={styles.error}>{error}</div>}

      {/* Leer */}
      {!loading && !error && profiles.length === 0 && (
        <div style={styles.emptyState}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <h3 style={{ margin: '0 0 8px' }}>Noch keine Suchprofile</h3>
          <p style={{ color: '#6c757d', margin: '0 0 24px' }}>
            Erstelle ein Profil um automatische Benachrichtigungen zu erhalten.
          </p>
          <button
            style={styles.newBtn}
            onClick={() => { setEditProfile(null); setFormOpen(true); }}
          >
            Erstes Profil erstellen
          </button>
        </div>
      )}

      {/* Profil-Karten */}
      <div style={styles.profileList}>
        {profiles.map(profile => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            onEdit={() => { setEditProfile(profile); setFormOpen(true); }}
            onToggle={() => handleToggleActive(profile)}
            onDelete={() => handleDelete(profile)}
          />
        ))}
      </div>

      {/* Formular-Modal */}
      {formOpen && (
        <SearchProfileForm
          initial={editProfile ?? undefined}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditProfile(null); }}
        />
      )}
    </div>
  );
}

// ── Einzelne Profil-Karte ────────────────────────────────────
function ProfileCard({
  profile,
  onEdit,
  onToggle,
  onDelete,
}: {
  profile: SearchProfile;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  // Kriterien lesbar darstellen
  const criteria: string[] = [];
  if (profile.zip_codes?.length) criteria.push(`PLZ: ${profile.zip_codes.join(', ')}`);
  if (profile.rooms_min || profile.rooms_max) {
    const min = profile.rooms_min ?? '?';
    const max = profile.rooms_max ?? '?';
    criteria.push(`${min}–${max} Zimmer`);
  }
  if (profile.rent_gross_max) criteria.push(`max. CHF ${profile.rent_gross_max.toLocaleString('de-CH')} Miete`);
  if (profile.area_min) criteria.push(`min. ${profile.area_min} m²`);
  if (profile.has_garden) criteria.push('Garten');
  if (profile.has_balcony) criteria.push('Balkon');
  if (profile.has_lift) criteria.push('Lift');
  if (profile.is_minergie) criteria.push('Minergie');

  return (
    <div style={{ ...styles.card, opacity: profile.is_active ? 1 : 0.6 }}>
      <div style={styles.cardHeader}>
        <div>
          <div style={styles.profileName}>{profile.name}</div>
          <div style={styles.profileMeta}>
            {profile.notify_email ? '📧 E-Mail-Benachrichtigung aktiv' : '🔕 Keine E-Mail-Benachrichtigung'}
          </div>
        </div>
        <div style={styles.statusBadge(profile.is_active)}>
          {profile.is_active ? 'Aktiv' : 'Pausiert'}
        </div>
      </div>

      {/* Kriterien */}
      {criteria.length > 0 ? (
        <div style={styles.criteriaList}>
          {criteria.map((c, i) => (
            <span key={i} style={styles.criteriaTag}>{c}</span>
          ))}
        </div>
      ) : (
        <p style={styles.noCriteria}>Alle Inserate (kein Filter gesetzt)</p>
      )}

      {/* Aktionen */}
      <div style={styles.cardActions}>
        <button style={styles.actionBtn} onClick={onEdit}>✏️ Bearbeiten</button>
        <button style={styles.actionBtn} onClick={onToggle}>
          {profile.is_active ? '⏸ Pausieren' : '▶️ Aktivieren'}
        </button>
        <button style={{ ...styles.actionBtn, color: '#dc3545' }} onClick={onDelete}>
          🗑 Löschen
        </button>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles: Record<string, any> = {
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  pageTitle: { margin: '0 0 4px', fontSize: '22px', color: '#1a2332' },
  pageSubtitle: { margin: 0, fontSize: '14px', color: '#6c757d' },
  newBtn: {
    padding: '10px 20px',
    backgroundColor: '#0d6efd',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  status: { padding: '40px', textAlign: 'center', color: '#6c757d' },
  error: {
    padding: '16px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1px solid #dee2e6',
  },
  profileList: { display: 'flex', flexDirection: 'column', gap: '16px' },
  card: {
    backgroundColor: '#fff',
    border: '1px solid #dee2e6',
    borderRadius: '12px',
    padding: '20px',
    transition: 'opacity 0.2s',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '14px',
  },
  profileName: { fontSize: '17px', fontWeight: 600, color: '#1a2332' },
  profileMeta: { fontSize: '13px', color: '#6c757d', marginTop: '3px' },
  statusBadge: (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    backgroundColor: active ? '#d4edda' : '#f8f9fa',
    color: active ? '#155724' : '#6c757d',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    border: `1px solid ${active ? '#c3e6cb' : '#dee2e6'}`,
    whiteSpace: 'nowrap',
  }),
  criteriaList: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' },
  criteriaTag: {
    padding: '4px 10px',
    backgroundColor: '#e9ecef',
    borderRadius: '20px',
    fontSize: '13px',
    color: '#495057',
  },
  noCriteria: { fontSize: '13px', color: '#adb5bd', margin: '0 0 16px', fontStyle: 'italic' },
  cardActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  actionBtn: {
    padding: '6px 12px',
    border: '1px solid #dee2e6',
    backgroundColor: '#fff',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    color: '#495057',
  },
};
