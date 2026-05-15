import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(0)}`;
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
