import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const getSupabaseClient = (key?: string) => {
  const url = process.env.SUPABASE_URL;
  const k = key || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !k || k === 'undefined' || k.startsWith('sb_publishable_')) {
    return null;
  }

  try {
    return createClient(url, k);
  } catch (err) {
    console.error('[supabase] Failed to create client:', err);
    return null;
  }
};

/**
 * Returns a live Supabase admin client (service role) or null if not configured.
 * Use this for operations that require admin access (e.g. auth.admin.deleteUser).
 */
export const getSupabaseAdminClient = () => getSupabaseClient();

/** Lazy-loaded Supabase Service Role client */
export const supabase = new Proxy({} as any, {
  get(target, prop) {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase Service Role client is not configured');
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

/** Lazy-loaded Supabase Anon client */
export const supabaseAnon = new Proxy({} as any, {
  get(target, prop) {
    const client = getSupabaseClient(process.env.SUPABASE_ANON_KEY);
    if (!client) throw new Error('Supabase Anon client is not configured');
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});
