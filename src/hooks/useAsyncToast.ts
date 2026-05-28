// src/hooks/useAsyncToast.ts
// FIX: inconsistent async error handling across dashboard mutations.
// Use this hook to wrap any async operation so errors are always surfaced
// to the user via toast, never silently swallowed.
//
// Usage:
//   const run = useAsyncToast();
//   await run(() => someAsyncAction(), { success: 'Saved!', error: 'Failed to save' });
import { useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface Options {
  success?: string;
  error?: string;
  onError?: (err: unknown) => void;
}

export function useAsyncToast() {
  const { toast } = useToast();

  return useCallback(
    async <T>(fn: () => Promise<T>, opts: Options = {}): Promise<T | undefined> => {
      try {
        const result = await fn();
        if (opts.success) {
          toast({ title: opts.success });
        }
        return result;
      } catch (err) {
        const msg = opts.error ?? 'Something went wrong. Please try again.';
        toast({ title: msg, variant: 'destructive' });
        opts.onError?.(err);
        console.error('[useAsyncToast]', err);
        return undefined;
      }
    },
    [toast]
  );
}
