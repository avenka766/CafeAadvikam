import { createClient } from '@supabase/supabase-js';
import { getAppSessionToken } from '@/lib/appSession';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[CafeAadvikam] Missing Supabase env vars.\n' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Settings → Environment Variables.'
  );
}

const sessionAwareFetch: typeof fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers ?? {});
  const requestUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const isEdgeFunctionRequest = requestUrl.includes('/functions/v1/');

  // Edge Functions have their own CORS contract. Do not attach the app-only
  // session headers there, otherwise the browser can stop after OPTIONS and
  // never issue the POST request. PostgREST/RPC requests still receive them.
  if (!isEdgeFunctionRequest) {
    const token = typeof window !== 'undefined' ? getAppSessionToken() : null;
    if (token) headers.set('x-cafe-session', token);
    headers.set('x-client-app', 'cafe-aadvikam-web');
  }
  try {
    const response = await fetch(input, { ...init, headers });
    if (typeof window !== 'undefined') {
      if (!response.ok) window.dispatchEvent(new CustomEvent('cafe:data-error', { detail: { message: `Server returned ${response.status}`, status: response.status, at: Date.now() } }));
      else window.dispatchEvent(new Event('cafe:data-recovered'));
    }
    return response;
  } catch (error) {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cafe:data-error', { detail: { message: error instanceof Error ? error.message : 'Network request failed', at: Date.now() } }));
    throw error;
  }
};

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder',
  {
    global: { fetch: sessionAwareFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  },
);
