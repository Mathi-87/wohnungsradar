/**
 * Supabase Admin Client für Edge Functions
 *
 * Verwendet den Service Role Key um RLS zu umgehen.
 * Nur für Backend-Operationen (Scraper) verwenden, nie im Frontend!
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function getSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen als Secrets gesetzt sein');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
