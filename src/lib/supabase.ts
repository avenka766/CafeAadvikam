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
          // BUG FIX (2026-08-29): a stale/expired x-cafe-session token doesn't
          // always surface as the RPC-specific "SESSION_REQUIRED" text — a
          // direct table insert/update (e.g. submitOrder's bakery_orders
          // insert) is gated purely by an RLS policy checking
          // current_app_session_context(), so an expired token there just
          // produces Postgres's own generic "new row violates row-level
          // security policy for table ..." message. Every RLS policy in this
          // schema is written as "allow if the resolved session's role is in
          // this list" - a legitimate, currently-permitted role hitting this
          // almost always means the session itself failed to resolve (stale/
          // expired/revoked token), not a real permission gap. Treat it the
          // same as SESSION_REQUIRED: a clear "please log in again" prompt
          // instead of the scary generic red banner (which is what a VRSNB
          // Receiver device was stuck showing - "row-level security policy"
          // with no indication a re-login would fix it).
          sessionExpired = /SESSION_REQUIRED/i.test(bodyText) || /row-level security policy/i.test(bodyText);
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
        } else if (/LAST_ITEM_USE_CANCEL_ORDER/i.test(responseMessage)) {
          // BUG FIX (2026-08-21): "cancelling the last item on an order shows
          // a scary 'business data may be incomplete' banner." This is a
          // correctly-working validation response (you can't remove an
          // order's only remaining item this way — use Cancel Table
          // instead), already surfaced as a clear, friendly inline message
          // by the caller (see handleCancelRunningItem in
          // BillingDashboard.tsx). It isn't a real data/infrastructure
          // problem, so it shouldn't trigger the same alarming top-of-screen
          // banner reserved for genuine failures — same principle as the
          // SESSION_REQUIRED case just above, just without needing its own
          // dedicated banner since the caller's own message already covers it.
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
