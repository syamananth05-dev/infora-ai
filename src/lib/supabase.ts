import { createClient } from '@supabase/supabase-js';

// Supabase project: synapse (ap-south-1)
// These values are public by design — the anon key is protected by RLS.
const url = 'https://qoqemcsmujehkrksswlg.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvcWVtY3NtdWplaGtya3Nzd2xnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MDMxOTcsImV4cCI6MjEwNDk3OTE5N30.GGK3ucd6fncahYvqaiMsVn-V1fNbxwKUsVlN9XmEBhc';

export const SUPABASE_URL = url;
export const EDGE_FUNCTION_BASE = `${url}/functions/v1`;

export const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
