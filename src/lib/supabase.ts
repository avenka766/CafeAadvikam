import {reportConnection} from '@/lib/connectionStatus';
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
  // BUG FIX (2026-09-16): "make sure this issue won't occur in future" —
  // PostgREST silently caps any un-paginated query at exactly 1000 rows and
  // returns a normal 200, so a query that actually matches more rows just
  // loses the rest with no error at all (this is how Jos Bakery Theni's
  // dispatch went invisible in useHosurShopOrders — see that fix's comment).
  // fetchAllRows below is the correct opt-in fix per call site, but nothing
  // stops a NEW query written later from making the same mistake and staying
  // silent for weeks until someone notices missing data again. This makes it
  // loud instead: every real REST table request (not RPC, not Edge
  // Functions) whose response array is exactly 1000 rows long logs a
  // console warning naming the endpoint — a legitimate result that happens
  // to be precisely 1000 is rare enough that this heuristic is worth the
  // occasional false positive. Dev-console-only, so it costs nothing in
  // production and never surfaces to a user.
  const isRestTableRequest = !isEdgeFunctionRequest && !requestUrl.includes('/rpc/') && requestUrl.includes('/rest/v1/');

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
    reportConnection(true);
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
        } else if (/LAST_ITEM_USE_CANCEL_ORDER/i.test(responseMessage) ||
          (requestUrl.includes('/rpc/cancel_branch_transfer_once_v1') && responseCode==='P0001' && /^TRANSFER_ALREADY_RECEIVED\b/.test(responseMessage))) {
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
      else {
        if (!isDiagnosticRequest) window.dispatchEvent(new Event('cafe:data-recovered'));
        if (isRestTableRequest && !init.method?.toUpperCase()?.match(/^(POST|PATCH|DELETE|PUT)$/)) {
          const parameters=new URL(requestUrl,window.location.origin).searchParams;
          const paged=parameters.has('offset')||headers.has('Range');
          if(!paged)response.clone().json().then((body) => {
            if (Array.isArray(body) && body.length === 1000) {
              console.warn(
                `[CafeAadvikam] Supabase query returned exactly 1000 rows — this is PostgREST's default page cap, and a query matching MORE than 1000 rows silently loses the rest with no error. If this table can realistically hold >1000 matching rows, use fetchAllRows() from this file instead of a plain query. Endpoint: ${requestUrl}`,
              );
            }
          }).catch(() => {});
        }
      }
    }
    return response;
  } catch (error) {
    // A transport failure activates the offline notice; financial/API errors above remain explicit.
    if(!(error instanceof Error && error.name==='AbortError'))reportConnection(false);
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

export {fetchAllRows} from './fetchAllRows';
