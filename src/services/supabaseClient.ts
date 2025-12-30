import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bfgbukjtxmxufgocqfjf.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmZ2J1a2p0eG14dWZnb2NxZmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NDIyMDUsImV4cCI6MjA4MDAxODIwNX0.Go6tzczksfNldE0SaAxx2SaZz7U-Y-WCKikDkpII-fQ';

let supabaseClient: SupabaseClient | null = null;

/**
 * Get Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

