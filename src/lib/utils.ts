import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  const safe = typeof amount === 'number' && isFinite(amount) ? amount : 0;
  return `₹${safe.toFixed(0)}`;
}

// BUG FIX (2026-09-08): "max decimal points should be 3, in all the
// dashboards" — reported live as raw floating-point subtraction artifacts
// (e.g. a stock-count difference rendering as "0.04200000000000004" instead
// of "0.042") wherever a computed quantity/difference was rendered directly
// (`{line.difference}`) instead of through a rounding formatter. IEEE-754
// float subtraction routinely produces this long tail — the underlying
// value is correct, only the display needs rounding. Use this wherever a
// raw computed quantity/difference reaches JSX; matches the
// `Math.round(x * 1000) / 1000` convention already used at the many places
// in this app that compute (not just display) a quantity, so this is safe
// to apply again at render time without double-rounding drift.
export function roundQty(value: number | string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

// BUG FIX (2026-09-08): "for Pcs don't allow the decimal" — a pcs-unit qty
// input using <input type="number" step="1"> still lets someone TYPE "2.5";
// the step attribute only affects the spinner and native form-submit
// validation, not keystrokes. This is the general-purpose version of the
// pcs-only `sanitizeQtyForUnit` already used in PlannerLeftoverTab.tsx —
// use this one wherever a raw text/number input needs to reject a decimal
// point outright as the user types (pass allowDecimal=false for a pcs/nos
// unit, true for kg/ltr/etc). Keeps a leading "-" only when the caller
// explicitly allows negative values (e.g. a correction/adjustment field).
export function sanitizeDecimalInput(raw: string, allowDecimal: boolean, allowNegative = false): string {
  if (allowDecimal) return raw;
  const negative = allowNegative && raw.trim().startsWith('-');
  const digits = raw.replace(/[^0-9]/g, '');
  return negative ? (digits ? `-${digits}` : '-') : digits;
}

export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function generateId(): string {
  return crypto.randomUUID();
}

// ─── OBS-03: db write wrapper — surfaces errors instead of silently swallowing ─
// Usage: await dbWrite(() => supabase.from('t').update(x).eq('id', id), 'Update failed')
export async function dbWrite(
  fn: () => Promise<{ error: unknown }>,
  friendlyMsg = 'Save failed. Please check your connection and try again.',
): Promise<boolean> {
  try {
    const { error } = await fn();
    if (error) {
      console.error('[dbWrite]', error);
      // OBS-02 hook: replace with Sentry.captureException(error) once Sentry is wired up
      throw error;
    }
    return true;
  } catch (err) {
    console.error('[dbWrite] unhandled:', err);
    // Re-throw so callers can catch and show a toast/set error state
    throw new Error(friendlyMsg);
  }
}
