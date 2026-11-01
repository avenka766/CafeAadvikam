import {useState, type FormEvent, type ReactNode} from 'react';
import {LockKeyhole} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {useAuthStore} from '@/stores/authStore';

export default function AdminPayrollGate({children}: {children: ReactNode}) {
  const user = useAuthStore(s => s.currentUser);
  const [unlockedFor, setUnlockedFor] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (user && user.role !== 'admin') return <>{children}</>;
  if (user && unlockedFor === user.id) return <>{children}</>;
  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy || !user) return;
    setBusy(true); setError('');
    try {
      const result = await supabase.rpc('verify_admin_payroll_access', {p_password: password});
      if (result.error) throw new Error('Unable to unlock payroll. Check your connection and try again.');
      if (result.data === true) {setUnlockedFor(user.id); setPassword('');}
      else {setError('Incorrect password. After five failed attempts, wait five minutes before trying again.'); setPassword('');}
    } catch (failure) {setError(failure instanceof Error ? failure.message : 'Unable to unlock payroll.');}
    finally {setBusy(false);}
  }
  return <section className="mx-auto my-8 max-w-md rounded-3xl border bg-card p-6 shadow-sm">
    <LockKeyhole className="mb-3 size-8 text-primary"/>
    <h2 className="text-xl font-bold">Attendance &amp; Payroll is locked</h2>
    <p className="mt-2 text-sm text-muted-foreground">Enter the payroll password to open this tab. It locks again when you leave.</p>
    <form onSubmit={unlock} className="mt-5 space-y-4">
      <label className="block text-sm font-semibold">Payroll password
        <input type="password" autoComplete="off" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className="mt-2 min-h-12 w-full rounded-xl border bg-background px-3"/>
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button disabled={busy || !password || !user} className="min-h-12 w-full rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50">{busy ? 'Checking…' : 'Unlock payroll'}</button>
    </form>
  </section>;
}
