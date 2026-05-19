import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[CafeAadvikam] Missing Supabase environment variables.\n' +
    'Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your Vercel project settings ' +
    '(Settings → Environment Variables) and enabled for the Preview environment.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
