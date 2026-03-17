/**
 * Benachrichtigungs-Service (Notification Matching)
 *
 * Nach jedem Scraper-Lauf werden neue Inserate mit allen aktiven Suchprofilen
 * abgeglichen. Wenn ein Inserat zu einem Profil passt und noch keine
 * Benachrichtigung dafür existiert, wird eine E-Mail versandt.
 *
 * Ablauf:
 * 1. Alle aktiven Suchprofile mit notify_email=true laden
 * 2. Für jedes Profil: neue Inserate (last_seen_at in letzter Stunde) filtern
 * 3. Bereits gesendete Benachrichtigungen ausschliessen
 * 4. E-Mail versenden + Benachrichtigung in DB speichern
 */

import { supabaseAdmin } from './supabase';
import { sendNewListingsEmail, isEmailConfigured } from './email';
import type { Listing } from './types';

// Typ für ein Suchprofil (aus der DB)
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

/**
 * Prüft ob ein Inserat zu einem Suchprofil passt.
 * Gibt true zurück wenn alle definierten Kriterien erfüllt sind.
 */
function matchesProfile(listing: Listing, profile: SearchProfile): boolean {
  // PLZ-Filter
  if (profile.zip_codes?.length && listing.zip_code) {
    if (!profile.zip_codes.includes(listing.zip_code)) return false;
  }

  // Zimmer-Filter
  if (profile.rooms_min !== null && listing.rooms !== null) {
    if (listing.rooms < profile.rooms_min) return false;
  }
  if (profile.rooms_max !== null && listing.rooms !== null) {
    if (listing.rooms > profile.rooms_max) return false;
  }

  // Miete-Filter
  if (profile.rent_gross_max !== null && listing.rent_gross !== null) {
    if (listing.rent_gross > profile.rent_gross_max) return false;
  }

  // Fläche-Filter
  if (profile.area_min !== null && listing.area_m2 !== null) {
    if (listing.area_m2 < profile.area_min) return false;
  }

  return true;
}

/**
 * Lädt die E-Mail-Adresse eines Users über die Supabase Admin-API.
 * Gibt null zurück wenn nicht abrufbar.
 */
async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data.user) return null;
    return data.user.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Hauptfunktion: Neue Inserate mit Suchprofilen abgleichen und E-Mails senden.
 *
 * @param newListingIds - IDs der in diesem Scraper-Lauf neu hinzugefügten Inserate
 */
export async function processNotifications(newListingIds: string[]): Promise<void> {
  if (newListingIds.length === 0) return;

  console.log(`[Notifications] Verarbeite ${newListingIds.length} neue Inserate...`);

  // ── 1. Neue Inserate aus DB laden ─────────────────────────
  const { data: newListings, error: listingsError } = await supabaseAdmin
    .from('listings')
    .select('*')
    .in('id', newListingIds)
    .eq('is_active', true);

  if (listingsError || !newListings?.length) {
    console.warn('[Notifications] Keine neuen Inserate in DB gefunden.');
    return;
  }

  // ── 2. Aktive Suchprofile laden ───────────────────────────
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('search_profiles')
    .select('*')
    .eq('is_active', true)
    .eq('notify_email', true);

  if (profilesError || !profiles?.length) {
    console.log('[Notifications] Keine aktiven Suchprofile mit E-Mail-Benachrichtigung gefunden.');
    return;
  }

  console.log(`[Notifications] ${profiles.length} aktive Suchprofile gefunden.`);

  // ── 3. Für jedes Profil: Treffer finden und E-Mail senden ─
  for (const profile of profiles as SearchProfile[]) {
    // Inserate filtern die zum Profil passen
    const matches = newListings.filter(l => matchesProfile(l as Listing, profile));

    if (matches.length === 0) continue;

    // Bereits gesendete Benachrichtigungen für dieses Profil ausschliessen
    const matchIds = matches.map(m => m.id);
    const { data: existingNotifs } = await supabaseAdmin
      .from('notifications')
      .select('listing_id')
      .eq('search_profile_id', profile.id)
      .in('listing_id', matchIds);

    const alreadySent = new Set((existingNotifs ?? []).map((n: any) => n.listing_id));
    const toNotify = matches.filter(m => !alreadySent.has(m.id));

    if (toNotify.length === 0) continue;

    console.log(`[Notifications] Profil "${profile.name}": ${toNotify.length} neue Treffer`);

    // E-Mail-Adresse des Users laden
    const email = await getUserEmail(profile.user_id);

    if (email && isEmailConfigured()) {
      try {
        await sendNewListingsEmail(email, toNotify as Listing[]);
      } catch (err) {
        console.error(`[Notifications] E-Mail an ${email} fehlgeschlagen:`, err);
      }
    } else if (!email) {
      console.warn(`[Notifications] Keine E-Mail-Adresse für User ${profile.user_id} gefunden.`);
    } else {
      // SMTP nicht konfiguriert – trotzdem loggen
      console.log(`[Notifications] SMTP nicht konfiguriert, E-Mail würde an ${profile.user_id} gehen für ${toNotify.length} Inserate.`);
    }

    // ── 4. Benachrichtigungen in DB speichern ──────────────
    const notifRows = toNotify.map(listing => ({
      user_id:           profile.user_id,
      listing_id:        listing.id,
      search_profile_id: profile.id,
      type:              'new_listing',
      sent_at:           new Date().toISOString(),
    }));

    const { error: insertError } = await supabaseAdmin
      .from('notifications')
      .insert(notifRows);

    if (insertError) {
      console.error('[Notifications] Fehler beim Speichern der Benachrichtigungen:', insertError);
    }
  }

  console.log('[Notifications] Verarbeitung abgeschlossen.');
}
