import { useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

export default function ConfirmIncomingButton({ onConfirm }: { onConfirm: () => Promise<string | null> }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setState('loading'); setError('');
    try {
      const failure = await onConfirm();
      if (failure) { setError(failure); setState('error'); }
      else setState('done');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Confirmation failed. Please retry.'); setState('error'); }
    finally { inFlight.current = false; }
  };
  if (state === 'done') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="size-3.5" /> Added</span>;
  if (state === 'error') return <div role="alert" className="max-w-sm rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700"><p>{error}</p><button type="button" onClick={() => void confirm()} className="mt-1 rounded-lg border border-red-200 px-2 py-1 font-semibold">Retry confirmation</button></div>;
  return <button type="button" disabled={state === 'loading'} onClick={() => void confirm()} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">{state === 'loading' ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Confirm</button>;
}
