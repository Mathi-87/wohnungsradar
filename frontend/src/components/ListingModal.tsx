/**
 * ListingModal – Detail-Ansicht eines Inserats
 *
 * Zeigt alle Informationen eines Wohnungsinserats in einem Modal.
 * Öffnet sich wenn man auf eine Listing-Karte klickt.
 */

import { computeScore, formatCHF, formatDate, getSourceLabel } from '../types';
import type { Listing } from '../types';

interface Props {
  listing: Listing;
  onClose: () => void;
}

export function ListingModal({ listing, onClose }: Props) {
  const score = computeScore(listing);

  // Klick auf Hintergrund schliesst das Modal
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div style={styles.backdrop} onClick={handleBackdropClick}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>{listing.title}</h2>
            <p style={styles.subtitle}>
              {getSourceLabel(listing.source)} ·{' '}
              {listing.address ?? listing.city ?? '–'}
              {listing.zip_code ? `, ${listing.zip_code}` : ''}
              {listing.city && listing.address ? ` ${listing.city}` : ''}
            </p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Bild-Galerie */}
        {listing.image_urls && listing.image_urls.length > 0 && (
          <div style={styles.gallery}>
            <img
              src={listing.image_urls[0]}
              alt={listing.title}
              style={styles.mainImage}
            />
            {listing.image_urls.length > 1 && (
              <div style={styles.thumbRow}>
                {listing.image_urls.slice(1, 5).map((url, i) => (
                  <img key={i} src={url} alt="" style={styles.thumb} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inhalt */}
        <div style={styles.body}>
          {/* Score */}
          <div style={styles.scoreRow}>
            <div style={{ ...styles.scoreBadge, backgroundColor: scoreColor(score) }}>
              Match-Score: {score}/100 Punkte
            </div>
            <span style={styles.scoreNote}>
              (Basierend auf deinem Suchprofil: 4.5–6.5 Zi., max. CHF 3'000, Bern-Region)
            </span>
          </div>

          {/* Kerndaten */}
          <Section title="Eckdaten">
            <Grid>
              <Fact label="Zimmer" value={listing.rooms !== null ? `${listing.rooms} Zi.` : '–'} />
              <Fact label="Wohnfläche" value={listing.area_m2 !== null ? `${listing.area_m2} m²` : '–'} />
              <Fact label="Etage" value={listing.floor !== null ? `${listing.floor}. Etage` : '–'} />
              <Fact label="Nettomiete" value={formatCHF(listing.rent_net)} />
              <Fact label="Nebenkosten" value={formatCHF(listing.additional_costs)} />
              <Fact label="Bruttomiete" value={formatCHF(listing.rent_gross)} highlight />
              <Fact label="Verfügbar ab" value={formatDate(listing.available_from)} />
              <Fact label="Objekttyp" value={listing.property_type ?? '–'} />
            </Grid>
          </Section>

          {/* Ausstattung */}
          <Section title="Ausstattung">
            <div style={styles.featureGrid}>
              <Feature active={listing.has_garden} emoji="🌿" label="Garten" />
              <Feature active={listing.has_terrace} emoji="☀️" label="Terrasse" />
              <Feature active={listing.has_balcony} emoji="🪴" label="Balkon" />
              <Feature active={listing.is_minergie} emoji="♻️" label="Minergie" />
              <Feature active={listing.has_own_washer} emoji="🫧" label="Eigene Waschmaschine" />
              <Feature active={listing.has_lift} emoji="🛗" label="Lift" />
              <Feature active={listing.has_parking} emoji="🅿️" label="Parkplatz" />
              <Feature active={listing.is_child_friendly} emoji="👶" label="Kinderfreundlich" />
            </div>
          </Section>

          {/* Beschreibung */}
          {listing.description && (
            <Section title="Beschreibung">
              <p style={styles.description}>{listing.description}</p>
            </Section>
          )}

          {/* Verwaltung */}
          {listing.agency_name && (
            <Section title="Verwaltung">
              <p style={{ margin: 0 }}>
                {listing.agency_name}
                {listing.agency_url && (
                  <> · <a href={listing.agency_url} target="_blank" rel="noopener noreferrer">Website</a></>
                )}
              </p>
            </Section>
          )}

          {/* Meta */}
          <Section title="Tracking">
            <Grid>
              <Fact label="Quelle" value={getSourceLabel(listing.source)} />
              <Fact label="Erstmals gesehen" value={formatDate(listing.first_seen_at)} />
              <Fact label="Zuletzt gesehen" value={formatDate(listing.last_seen_at)} />
              {listing.source_ref && <Fact label="Referenz-Nr." value={listing.source_ref} />}
            </Grid>
          </Section>
        </div>

        {/* Fusszeile */}
        <div style={styles.footerBar}>
          <a
            href={listing.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.cta}
          >
            Zum Originalinserat auf {getSourceLabel(listing.source)} →
          </a>
          <button style={styles.cancelBtn} onClick={onClose}>Schliessen</button>
        </div>
      </div>
    </div>
  );
}

// Hilfkomponenten für strukturierte Darstellung
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h4 style={{ margin: '0 0 10px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6c757d' }}>
        {title}
      </h4>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
      {children}
    </div>
  );
}

function Fact({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '15px', fontWeight: highlight ? 700 : 400, color: highlight ? '#198754' : '#212529' }}>
        {value}
      </div>
    </div>
  );
}

function Feature({ active, emoji, label }: { active: boolean; emoji: string; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px',
      color: active ? '#212529' : '#adb5bd',
    }}>
      <span>{emoji}</span>
      <span style={{ textDecoration: active ? 'none' : 'line-through' }}>{label}</span>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 70) return '#28a745';
  if (score >= 40) return '#ffc107';
  return '#6c757d';
}

// ── Styles ─────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '700px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '20px',
    borderBottom: '1px solid #dee2e6',
    gap: '16px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '14px',
    color: '#6c757d',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#6c757d',
    padding: '4px',
    flexShrink: 0,
  },
  gallery: {
    backgroundColor: '#f8f9fa',
  },
  mainImage: {
    width: '100%',
    height: '300px',
    objectFit: 'cover',
    display: 'block',
  },
  thumbRow: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    backgroundColor: '#e9ecef',
  },
  thumb: {
    width: '80px',
    height: '60px',
    objectFit: 'cover',
    borderRadius: '4px',
  },
  body: {
    padding: '20px',
    overflowY: 'auto',
    flex: 1,
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
  },
  scoreBadge: {
    padding: '6px 14px',
    borderRadius: '20px',
    color: '#fff',
    fontWeight: 700,
    fontSize: '14px',
    whiteSpace: 'nowrap',
  },
  scoreNote: {
    fontSize: '12px',
    color: '#6c757d',
  },
  featureGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '8px',
  },
  description: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.6,
    color: '#495057',
    whiteSpace: 'pre-wrap',
  },
  footerBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderTop: '1px solid #dee2e6',
    gap: '12px',
  },
  cta: {
    display: 'inline-block',
    padding: '10px 20px',
    backgroundColor: '#0d6efd',
    color: '#fff',
    borderRadius: '6px',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '14px',
  },
  cancelBtn: {
    padding: '10px 16px',
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};
