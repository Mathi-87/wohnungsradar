/**
 * Send-Notifications – Supabase Edge Function
 *
 * Wird nach jedem Scraper-Lauf aufgerufen (von scrape-all).
 * Prüft neue Inserate gegen alle aktiven Suchprofile und
 * sendet E-Mails für Treffer via Resend (https://resend.com).
 *
 * Benötigte Supabase Secrets:
 *   RESEND_API_KEY   – API Key von resend.com (kostenlos: 3000 Mails/Monat)
 *   RESEND_FROM      – Absender, z.B. "WohnungsRadar <noreply@deinedomain.ch>"
 *   APP_URL          – URL des Frontends (für Links in der E-Mail)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';

// Typ für ein Suchprofil aus der DB
interface SearchProfile {
  id: string;
  user_id: string;
  name: string;
  zip_codes: string[] | null;
  rooms_min: number | null;
  rooms_max: number | null;
  rent_gross_max: number | null;
  area_min: number | null;
  notify_email: boolean;
  is_active: boolean;
}

// Prüft ob ein Inserat zu einem Suchprofil passt
function matchesProfile(listing: any, profile: SearchProfile): boolean {
  if (profile.zip_codes?.length && listing.zip_code) {
    if (!profile.zip_codes.includes(listing.zip_code)) return false;
  }
  if (profile.rooms_min !== null && listing.rooms !== null) {
    if (listing.rooms < profile.rooms_min) return false;
  }
  if (profile.rooms_max !== null && listing.rooms !== null) {
    if (listing.rooms > profile.rooms_max) return false;
  }
  if (profile.rent_gross_max !== null && listing.rent_gross !== null) {
    if (listing.rent_gross > profile.rent_gross_max) return false;
  }
  if (profile.area_min !== null && listing.area_m2 !== null) {
    if (listing.area_m2 < profile.area_min) return false;
  }
  return true;
}

// Formatiert CHF-Betrag
function chf(amount: number | null): string {
  if (!amount) return '–';
  return `CHF ${amount.toLocaleString('de-CH')}`;
}

// Features als lesbarer Text
function featureList(listing: any): string {
  const f: string[] = [];
  if (listing.has_garden)       f.push('Garten');
  if (listing.has_terrace)      f.push('Terrasse');
  if (listing.has_balcony)      f.push('Balkon');
  if (listing.has_lift)         f.push('Lift');
  if (listing.has_own_washer)   f.push('eigene Waschmaschine');
  if (listing.has_parking)      f.push('Parkplatz');
  if (listing.is_minergie)      f.push('Minergie');
  if (listing.is_child_friendly) f.push('kinderfreundlich');
  return f.length > 0 ? f.join(', ') : 'keine Angaben';
}

// HTML für ein einzelnes Inserat in der E-Mail
function listingHtml(listing: any): string {
  const image = listing.image_urls?.[0]
    ? `<img src="${listing.image_urls[0]}" style="width:100%;max-height:200px;object-fit:cover;border-radius:6px;margin-bottom:12px;" alt="">`
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
      <td colspan="3">${listing.available_from
        ? new Date(listing.available_from).toLocaleDateString('de-CH')
        : 'auf Anfrage'}</td>
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

// Vollständiges E-Mail-HTML
function buildEmailHtml(listings: any[]): string {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f9;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#1a2332;color:#fff;border-radius:10px 10px 0 0;padding:20px 24px;">
      <h1 style="margin:0;font-size:22px;">🏠 WohnungsRadar</h1>
      <p style="margin:6px 0 0;color:#8899aa;font-size:14px;">Region Bern – neue Inserate</p>
    </div>
    <div style="background:#fff;padding:20px 24px;border-left:1px solid #dee2e6;border-right:1px solid #dee2e6;">
      <p style="margin:0;font-size:15px;color:#1a2332;">
        Guten Tag!<br><br>
        Wir haben <strong>${listings.length} neue${listings.length === 1 ? 's' : ''} Inserat${listings.length === 1 ? '' : 'e'}</strong>
        gefunden, ${listings.length === 1 ? 'das' : 'die'} deinem Suchprofil entspricht.
      </p>
    </div>
    <div style="background:#f8f9fa;padding:16px 24px;border-left:1px solid #dee2e6;border-right:1px solid #dee2e6;">
      ${listings.map(listingHtml).join('')}
    </div>
    <div style="background:#f8f9fa;border:1px solid #dee2e6;border-top:none;border-radius:0 0 10px 10px;padding:16px 24px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#adb5bd;">
        WohnungsRadar – automatischer Benachrichtigungsservice<br>
        ${new Date().toLocaleString('de-CH')}
      </p>
    </div>
  </div>
</body>
</html>`;
}

// E-Mail via Resend API senden
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM') ?? 'WohnungsRadar <noreply@wohnungsradar.ch>';

  if (!apiKey) {
    // Kein API-Key → nur loggen (kein Fehler damit Scraper weiterläuft)
    console.log(`[Notifications] RESEND_API_KEY nicht gesetzt – E-Mail würde gehen an: ${to}`);
    console.log(`[Notifications] Betreff: ${subject}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API Fehler (${res.status}): ${err}`);
  }

  console.log(`[Notifications] E-Mail gesendet an ${to}`);
}

// Hauptfunktion: neue Inserate mit Suchprofilen abgleichen
async function processNotifications(newListingIds: string[]): Promise<{ sent: number }> {
  if (newListingIds.length === 0) return { sent: 0 };

  const supabase = getSupabaseAdmin();
  console.log(`[Notifications] Verarbeite ${newListingIds.length} neue Inserate...`);

  // 1. Neue Inserate laden
  const { data: newListings, error: listingsError } = await supabase
    .from('listings')
    .select('*')
    .in('id', newListingIds)
    .eq('is_active', true);

  if (listingsError || !newListings?.length) return { sent: 0 };

  // 2. Aktive Suchprofile mit E-Mail-Benachrichtigung laden
  const { data: profiles } = await supabase
    .from('search_profiles')
    .select('*')
    .eq('is_active', true)
    .eq('notify_email', true);

  if (!profiles?.length) {
    console.log('[Notifications] Keine aktiven Suchprofile mit E-Mail-Benachrichtigung.');
    return { sent: 0 };
  }

  let totalSent = 0;

  for (const profile of profiles as SearchProfile[]) {
    // Passende Inserate für dieses Profil filtern
    const matches = newListings.filter(l => matchesProfile(l, profile));
    if (matches.length === 0) continue;

    // Bereits gesendete Benachrichtigungen ausschliessen
    const matchIds = matches.map((m: any) => m.id);
    const { data: existing } = await supabase
      .from('notifications')
      .select('listing_id')
      .eq('search_profile_id', profile.id)
      .in('listing_id', matchIds);

    const alreadySent = new Set((existing ?? []).map((n: any) => n.listing_id));
    const toNotify = matches.filter((m: any) => !alreadySent.has(m.id));
    if (toNotify.length === 0) continue;

    console.log(`[Notifications] Profil "${profile.name}": ${toNotify.length} neue Treffer`);

    // E-Mail-Adresse des Users laden (via Supabase Auth Admin)
    const { data: userData } = await supabase.auth.admin.getUserById(profile.user_id);
    const email = userData?.user?.email;

    if (email) {
      const subject = toNotify.length === 1
        ? 'WohnungsRadar: 1 neues Inserat gefunden'
        : `WohnungsRadar: ${toNotify.length} neue Inserate gefunden`;

      try {
        await sendEmail(email, subject, buildEmailHtml(toNotify));
        totalSent++;
      } catch (err) {
        console.error(`[Notifications] E-Mail-Fehler für ${email}:`, err);
      }
    }

    // Benachrichtigungen in DB speichern (auch wenn E-Mail nicht konfiguriert)
    await supabase.from('notifications').insert(
      toNotify.map((listing: any) => ({
        user_id: profile.user_id,
        listing_id: listing.id,
        search_profile_id: profile.id,
        type: 'new_listing',
        sent_at: new Date().toISOString(),
      }))
    );
  }

  console.log(`[Notifications] Abgeschlossen. ${totalSent} E-Mails gesendet.`);
  return { sent: totalSent };
}

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const newListingIds: string[] = body.newListingIds ?? [];

    const result = await processNotifications(newListingIds);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = String(err);
    console.error('[Notifications] Fehler:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
