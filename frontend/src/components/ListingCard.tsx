/**
 * ListingCard – Karte für ein einzelnes Wohnungsinserat
 *
 * Zeigt die wichtigsten Infos kompakt an:
 * - Bild (falls vorhanden)
 * - Titel, Adresse
 * - Zimmer, Fläche, Miete
 * - Tags (Garten, Minergie, etc.)
 * - Score-Anzeige (wie gut das Inserat zum Suchprofil passt)
 * - Link zum Original-Inserat
 */

import { computeScore, formatCHF, formatDate, getSourceLabel } from '../types';
import type { Listing } from '../types';

interface Props {
  listing: Listing;
  onClick: () => void; // Öffnet das Detail-Modal
}

export function ListingCard({ listing, onClick }: Props) {
  const score = computeScore(listing);
  const image = listing.image_urls?.[0];

  return (
    <div style={styles.card} onClick={onClick}>
      {/* Bild */}
      <div style={styles.imageBox}>
        {image ? (
          <img src={image} alt={listing.title} style={styles.image} />
        ) : (
          <div style={styles.imagePlaceholder}>🏠</div>
        )}
        {/* Score-Badge */}
        <div style={{ ...styles.scoreBadge, backgroundColor: scoreColor(score) }}>
          {score} Pkt.
        </div>
      </div>

      {/* Inhalt */}
      <div style={styles.content}>
        {/* Titel & Quelle */}
        <div style={styles.titleRow}>
          <h3 style={styles.title}>{listing.title}</h3>
          <span style={styles.sourceTag}>{getSourceLabel(listing.source)}</span>
        </div>

        {/* Adresse */}
        <p style={styles.address}>
          📍 {listing.address ?? listing.city ?? '–'}
          {listing.zip_code ? `, ${listing.zip_code}` : ''}
          {listing.city && listing.address ? ` ${listing.city}` : ''}
        </p>

        {/* Kerndaten */}
        <div style={styles.facts}>
          <span style={styles.fact}>
            🛏 <strong>{listing.rooms ?? '–'}</strong> Zi.
          </span>
          <span style={styles.fact}>
            📐 <strong>{listing.area_m2 ?? '–'}</strong> m²
          </span>
          <span style={{ ...styles.fact, ...styles.price }}>
            💰 <strong>{formatCHF(listing.rent_gross)}</strong>/Mt.
          </span>
        </div>

        {/* Verfügbar ab */}
        {listing.available_from && (
          <p style={styles.availableFrom}>
            Verfügbar ab: {formatDate(listing.available_from)}
          </p>
        )}

        {/* Feature-Tags */}
        <div style={styles.tags}>
          {listing.has_garden && <Tag emoji="🌿" label="Garten" />}
          {listing.has_terrace && <Tag emoji="☀️" label="Terrasse" />}
          {listing.has_balcony && !listing.has_terrace && <Tag emoji="🪴" label="Balkon" />}
          {listing.is_minergie && <Tag emoji="♻️" label="Minergie" />}
          {listing.has_own_washer && <Tag emoji="🫧" label="Waschmaschine" />}
          {listing.has_lift && <Tag emoji="🛗" label="Lift" />}
          {listing.has_parking && <Tag emoji="🅿️" label="Parkplatz" />}
          {listing.area_m2 !== null && listing.area_m2 < 100 && (
            <Tag emoji="⚠️" label="< 100 m²" color="#ffc107" />
          )}
        </div>

        {/* Fusszeile */}
        <div style={styles.footer}>
          <span style={styles.date}>
            Gesehen: {formatDate(listing.first_seen_at)}
          </span>
          <a
            href={listing.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.link}
            onClick={e => e.stopPropagation()} // Nicht Modal öffnen beim Klick auf Link
          >
            Zum Inserat →
          </a>
        </div>
      </div>
    </div>
  );
}

// Kleine Tag-Komponente für Feature-Labels
function Tag({ emoji, label, color = '#e9f5e9' }: { emoji: string; label: string; color?: string }) {
  return (
    <span style={{ ...styles.tag, backgroundColor: color }}>
      {emoji} {label}
    </span>
  );
}

// Farbe des Score-Badges je nach Punktzahl
function scoreColor(score: number): string {
  if (score >= 70) return '#28a745'; // Grün: sehr gut
  if (score >= 40) return '#ffc107'; // Gelb: ok
  return '#6c757d';                   // Grau: schlecht
}

// ── Styles ─────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: '10px',
    border: '1px solid #dee2e6',
    overflow: 'hidden',
    backgroundColor: '#fff',
    cursor: 'pointer',
    transition: 'box-shadow 0.15s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  imageBox: {
    position: 'relative',
    height: '180px',
    backgroundColor: '#f1f3f5',
    flexShrink: 0,
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  imagePlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '48px',
    color: '#adb5bd',
  },
  scoreBadge: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    padding: '3px 8px',
    borderRadius: '12px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 700,
  },
  content: {
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flexGrow: 1,
  },
  titleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '8px',
  },
  title: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    color: '#212529',
    lineHeight: 1.3,
    flex: 1,
  },
  sourceTag: {
    fontSize: '11px',
    padding: '2px 7px',
    backgroundColor: '#e8f4fd',
    color: '#0d6efd',
    borderRadius: '10px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  address: {
    margin: 0,
    fontSize: '13px',
    color: '#6c757d',
  },
  facts: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  fact: {
    fontSize: '14px',
    color: '#495057',
  },
  price: {
    color: '#198754',
  },
  availableFrom: {
    margin: 0,
    fontSize: '12px',
    color: '#6c757d',
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  tag: {
    fontSize: '12px',
    padding: '3px 8px',
    borderRadius: '10px',
    color: '#333',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '4px',
    paddingTop: '8px',
    borderTop: '1px solid #f1f3f5',
  },
  date: {
    fontSize: '11px',
    color: '#adb5bd',
  },
  link: {
    fontSize: '13px',
    color: '#0d6efd',
    textDecoration: 'none',
    fontWeight: 500,
  },
};
