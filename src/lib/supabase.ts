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

const sessionAwareFetch: typeof fetch = async (input, init: RequestInit = {}) => {
  const headers = new Headers(init.headers ?? {});
  const requestUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const isEdgeFunctionRequest = requestUrl.includes('/functions/v1/');
  const isDiagnosticRequest = requestUrl.includes('/rpc/report_client_error_secure');

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
      if (!response.ok && !isDiagnosticRequest) {
        // Peek at the body (without consuming it for the real caller) to see if this
        // is specifically an expired/invalid app session, so the UI can show a clear
        // "please log in again" message and redirect, instead of a generic error banner.
        let sessionExpired = false;
        let responseMessage = `Server returned ${response.status}`;
        let responseCode: string | undefined;
        let responseDetails: string | undefined;
        let responseHint: string | undefined;
        try {
          const bodyText = await response.clone().text();
          sessionExpired = /SESSION_REQUIRED/i.test(bodyText);
          try {
            const body = JSON.parse(bodyText) as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
            if (typeof body.message === 'string') responseMessage = body.message;
            if (typeof body.code === 'string') responseCode = body.code;
            if (typeof body.details === 'string') responseDetails = body.details;
            if (typeof body.hint === 'string') responseHint = body.hint;
          } catch {
            // Non-JSON errors retain the status-based message.
          }
        } catch {
          // Body wasn't readable (e.g. binary/stream) — fall through to the generic banner.
        }
        if (sessionExpired) {
          window.dispatchEvent(new CustomEvent('cafe:session-expired', { detail: { at: Date.now() } }));
        } else {
          window.dispatchEvent(new CustomEvent('cafe:data-error', { detail: {
            message: responseMessage,
            code: responseCode,
            details: responseDetails,
            hint: responseHint,
            status: response.status,
            module: 'Supabase API',
            at: Date.now(),
          } }));
        }
      }
      else if (!isDiagnosticRequest) window.dispatchEvent(new Event('cafe:data-recovered'));
    }
    return response;
  } catch (error) {
    if (typeof window !== 'undefined' && !isDiagnosticRequest) window.dispatchEvent(new CustomEvent('cafe:data-error', { detail: { message: error instanceof Error ? error.message : 'Network request failed', module: 'Network', at: Date.now() } }));
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
