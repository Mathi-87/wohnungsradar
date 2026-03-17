/**
 * E-Mail-Service für WohnungsRadar
 *
 * Versendet E-Mails über SMTP (z.B. Gmail, Infomaniak, Mailgun-SMTP, etc.)
 *
 * Benötigte Umgebungsvariablen in .env:
 *   SMTP_HOST     – z.B. "smtp.gmail.com"
 *   SMTP_PORT     – z.B. 587 (STARTTLS) oder 465 (SSL)
 *   SMTP_USER     – E-Mail-Adresse des Absenders
 *   SMTP_PASS     – Passwort / App-Passwort
 *   SMTP_FROM     – Absender-Anzeigename + Adresse, z.B. "WohnungsRadar <noreply@example.com>"
 *
 * Wenn keine SMTP-Konfiguration vorhanden ist, werden E-Mails nur in der Konsole geloggt.
 */

import nodemailer from 'nodemailer';
import type { Listing } from './types';

// Transporter einmalig erstellen (wird bei jedem Send wiederverwendet)
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP nicht konfiguriert (SMTP_HOST, SMTP_USER, SMTP_PASS fehlen in .env)');
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT ?? '587'),
    secure: parseInt(SMTP_PORT ?? '587') === 465,  // true für Port 465 (SSL)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return transporter;
}

// ── Prüfen ob E-Mail-Versand konfiguriert ist ──────────────
export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// ── Hilfsfunktion: CHF-Betrag formatieren ─────────────────
function chf(amount: number | null): string {
  if (!amount) return '–';
  return `CHF ${amount.toLocaleString('de-CH')}`;
}

// ── Hilfsfunktion: Features als Texte aufzählen ──────────
function featureList(listing: Listing): string {
  const features: string[] = [];
  if (listing.has_garden)      features.push('Garten');
  if (listing.has_terrace)     features.push('Terrasse');
  if (listing.has_balcony)     features.push('Balkon');
  if (listing.has_lift)        features.push('Lift');
  if (listing.has_own_washer)  features.push('eigene Waschmaschine');
  if (listing.has_parking)     features.push('Parkplatz');
  if (listing.is_minergie)     features.push('Minergie');
  if (listing.is_child_friendly) features.push('kinderfreundlich');
  return features.length > 0 ? features.join(', ') : 'keine Angaben';
}

// ── HTML für eine einzelne Listing-Karte ─────────────────
function listingHtml(listing: Listing): string {
  const image = listing.image_urls?.[0]
    ? `<img src="${listing.image_urls[0]}" style="width:100%;max-height:200px;object-fit:cover;border-radius:6px;margin-bottom:12px;" alt="Vorschaubild">`
    : '';

  return `
<div style="border:1px solid #dee2e6;border-radius:8px;padding:16px;margin-bottom:16px;background:#fff;">
  ${image}
  <h3 style="margin:0 0 8px;font-size:16px;color:#1a2332;">${listing.title}</h3>
  <p style="margin:0 0 8px;color:#6c757d;font-size:13px;">
    ${listing.address ?? ''} ${listing.zip_code ?? ''} ${listing.city ?? ''}
  </p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:10px;">
    <tr>
      <td style="padding:3px 8px 3px 0;color:#495057;"><strong>Zimmer:</strong></td>
      <td>${listing.rooms ?? '–'}</td>
      <td style="padding:3px 8px 3px 16px;color:#495057;"><strong>Fläche:</strong></td>
      <td>${listing.area_m2 ? listing.area_m2 + ' m²' : '–'}</td>
    </tr>
    <tr>
      <td style="padding:3px 8px 3px 0;color:#495057;"><strong>Miete netto:</strong></td>
      <td>${chf(listing.rent_net)}</td>
      <td style="padding:3px 8px 3px 16px;color:#495057;"><strong>Miete brutto:</strong></td>
      <td style="color:#0d6efd;font-weight:700;">${chf(listing.rent_gross)}</td>
    </tr>
    <tr>
      <td style="padding:3px 8px 3px 0;color:#495057;"><strong>Verfügbar ab:</strong></td>
      <td colspan="3">${listing.available_from ? new Date(listing.available_from).toLocaleDateString('de-CH') : 'auf Anfrage'}</td>
    </tr>
  </table>
  <p style="margin:0 0 12px;font-size:13px;color:#495057;">
    <strong>Ausstattung:</strong> ${featureList(listing)}
  </p>
  <a href="${listing.source_url}" style="display:inline-block;padding:8px 16px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
    Inserat ansehen →
  </a>
  <span style="font-size:11px;color:#adb5bd;margin-left:12px;">via ${listing.source}</span>
</div>`;
}

// ── E-Mail für neue Inserate versenden ────────────────────
export async function sendNewListingsEmail(
  toEmail: string,
  listings: Listing[],
): Promise<void> {
  if (listings.length === 0) return;

  const subject =
    listings.length === 1
      ? `WohnungsRadar: 1 neues Inserat gefunden`
      : `WohnungsRadar: ${listings.length} neue Inserate gefunden`;

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f9;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">

    <!-- Header -->
    <div style="background:#1a2332;color:#fff;border-radius:10px 10px 0 0;padding:20px 24px;">
      <h1 style="margin:0;font-size:22px;">🏠 WohnungsRadar</h1>
      <p style="margin:6px 0 0;color:#8899aa;font-size:14px;">Region Bern – neue Inserate</p>
    </div>

    <!-- Intro -->
    <div style="background:#fff;padding:20px 24px;border-left:1px solid #dee2e6;border-right:1px solid #dee2e6;">
      <p style="margin:0;font-size:15px;color:#1a2332;">
        Guten Tag!<br><br>
        Wir haben <strong>${listings.length} neue${listings.length === 1 ? 's' : ''} Inserat${listings.length === 1 ? '' : 'e'}</strong>
        gefunden, ${listings.length === 1 ? 'das' : 'die'} deinem Suchprofil entspricht.
      </p>
    </div>

    <!-- Listings -->
    <div style="background:#f8f9fa;padding:16px 24px;border-left:1px solid #dee2e6;border-right:1px solid #dee2e6;">
      ${listings.map(listingHtml).join('')}
    </div>

    <!-- Footer -->
    <div style="background:#f8f9fa;border:1px solid #dee2e6;border-top:none;border-radius:0 0 10px 10px;padding:16px 24px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#adb5bd;">
        WohnungsRadar – automatischer Benachrichtigungsservice<br>
        Scraper-Lauf: ${new Date().toLocaleString('de-CH')}
      </p>
    </div>
  </div>
</body>
</html>`;

  // Plain-Text-Fallback
  const text = [
    `WohnungsRadar – ${listings.length} neue Inserate\n`,
    ...listings.map(l =>
      `• ${l.title}\n  ${l.address ?? ''} ${l.zip_code ?? ''}\n  ${l.rooms ?? '?'} Zi. | ${l.area_m2 ?? '?'} m² | ${chf(l.rent_gross)}\n  ${l.source_url}\n`,
    ),
  ].join('\n');

  const from = process.env.SMTP_FROM ?? `WohnungsRadar <${process.env.SMTP_USER}>`;

  if (!isEmailConfigured()) {
    // Kein SMTP konfiguriert → nur in der Konsole ausgeben
    console.log(`[Email] SMTP nicht konfiguriert. E-Mail würde gesendet an: ${toEmail}`);
    console.log(`[Email] Betreff: ${subject}`);
    listings.forEach(l => console.log(`  - ${l.title} | ${chf(l.rent_gross)}`));
    return;
  }

  const mail = getTransporter();
  await mail.sendMail({ from, to: toEmail, subject, html, text });
  console.log(`[Email] Gesendet an ${toEmail}: ${subject}`);
}
