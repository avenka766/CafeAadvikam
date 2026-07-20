import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export type DiagnosticInput = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
  module?: string;
  at?: number;
  severity?: 'warning' | 'error' | 'fatal';
  stack?: string;
};

export type ClientDiagnostic = DiagnosticInput & {
  reference: string;
  occurredAt: number;
  route: string;
  online: boolean;
  user: { id: string; username: string; displayName: string; role: string } | null;
};

const MAX_TEXT = 1200;
const reportedFingerprints = new Map<string, number>();

function safeText(value: unknown, limit = MAX_TEXT) {
  return String(value ?? '')
    .replace(/(authorization|apikey|password|secret|session[_-]?token|x-cafe-session)\s*[:=]\s*[^\s,;}]+/gi, '$1=[redacted]')
    .slice(0, limit);
}

export function createClientDiagnostic(input: DiagnosticInput): ClientDiagnostic {
  const currentUser = useAuthStore.getState().currentUser;
  const occurredAt = input.at ?? Date.now();
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8).toUpperCase()
    : Math.random().toString(36).slice(2, 10).toUpperCase();
  return {
    ...input,
    message: safeText(input.message) || 'Unknown application error',
    code: input.code ? safeText(input.code, 120) : undefined,
    details: input.details ? safeText(input.details) : undefined,
    hint: input.hint ? safeText(input.hint) : undefined,
    stack: input.stack ? safeText(input.stack, 4000) : undefined,
    module: safeText(input.module || 'Web application', 120),
    reference: `ERR-${new Date(occurredAt).toISOString().slice(0, 10).replace(/-/g, '')}-${random}`,
    occurredAt,
    route: typeof location === 'undefined' ? '/' : location.pathname,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    user: currentUser ? {
      id: currentUser.id,
      username: safeText(currentUser.username, 120),
      displayName: safeText(currentUser.displayName, 120),
      role: safeText(currentUser.role, 80),
    } : null,
  };
}

export function diagnosticText(diagnostic: ClientDiagnostic) {
  return [
    `Reference: ${diagnostic.reference}`,
    `Time: ${new Date(diagnostic.occurredAt).toLocaleString('en-IN')}`,
    `User: ${diagnostic.user ? `${diagnostic.user.displayName} (${diagnostic.user.username})` : 'Not logged in'}`,
    `Role: ${diagnostic.user?.role || '-'}`,
    `Page: ${diagnostic.route}`,
    `Module: ${diagnostic.module || '-'}`,
    `Online: ${diagnostic.online ? 'Yes' : 'No'}`,
    `Status: ${diagnostic.status ?? '-'}`,
    `Code: ${diagnostic.code || '-'}`,
    `Message: ${diagnostic.message}`,
    diagnostic.details ? `Details: ${diagnostic.details}` : '',
    diagnostic.hint ? `Hint: ${diagnostic.hint}` : '',
  ].filter(Boolean).join('\n');
}

export async function reportClientDiagnostic(diagnostic: ClientDiagnostic) {
  if (!diagnostic.user) return;
  const fingerprint = `${diagnostic.user.id}|${diagnostic.route}|${diagnostic.code || ''}|${diagnostic.message}`;
  const lastReported = reportedFingerprints.get(fingerprint) ?? 0;
  if (Date.now() - lastReported < 60_000) return;
  reportedFingerprints.set(fingerprint, Date.now());

  try {
    await supabase.rpc('report_client_error_secure', {
      p_route: diagnostic.route,
      p_module: diagnostic.module || 'Web application',
      p_severity: diagnostic.severity || 'error',
      p_error_code: diagnostic.code || (diagnostic.status ? `HTTP_${diagnostic.status}` : diagnostic.reference),
      p_message: diagnostic.message,
      p_details: {
        reference: diagnostic.reference,
        details: diagnostic.details || null,
        hint: diagnostic.hint || null,
      },
      p_online: diagnostic.online,
      p_app_version: import.meta.env.VITE_APP_VERSION || 'web',
    });
  } catch {
    // Diagnostics must never interfere with the user's workflow.
  }
}
