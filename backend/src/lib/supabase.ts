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

// Umgebungsvariablen prüfen – fehlen sie, ist der Server falsch konfiguriert
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error(
    '❌ Supabase-Umgebungsvariablen fehlen! ' +
    'Bitte SUPABASE_URL, SUPABASE_ANON_KEY und SUPABASE_SERVICE_ROLE_KEY in der .env-Datei setzen.'
  );
}

// Normaler Client (anon key) – für öffentliche Lesezugriffe
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin-Client (service_role key) – für Scraper und Schreiboperationen
// ACHTUNG: Dieser Client umgeht RLS-Policies – nur im Backend verwenden!
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
