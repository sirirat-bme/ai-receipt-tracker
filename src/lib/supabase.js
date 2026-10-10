import { createClient } from '@supabase/supabase-js';

export function getSupabase(url, anonKey) {
  return createClient(url.trim(), anonKey.trim());
}
