/**
 * Supabase-Client
 *
 * Stellt zwei Clients bereit:
 * - supabase:        Für normale Lese-Operationen (anon key)
 * - supabaseAdmin:   Für Schreib-Operationen im Backend/Scraper (service_role key)
 *
 * Die Schlüssel kommen aus der .env-Datei und werden NIE in den Code geschrieben.
 */

import { createClient } from '@supabase/supabase-js';

// Umgebungsvariablen lesen
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// URL und Service-Key sind immer Pflicht (Scraper + Server)
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    '❌ Supabase-Umgebungsvariablen fehlen! ' +
    'Bitte SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen.'
  );
}

// Admin-Client (service_role key) – für Scraper und Schreiboperationen
// ACHTUNG: Dieser Client umgeht RLS-Policies – nur im Backend verwenden!
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Normaler Client (anon key) – für öffentliche Lesezugriffe im API-Server
// Nur verfügbar wenn SUPABASE_ANON_KEY gesetzt ist (nicht im GitHub-Actions-Scraper nötig)
export const supabase = supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : supabaseAdmin; // Fallback: Admin-Client (im Scraper-Kontext unkritisch)
