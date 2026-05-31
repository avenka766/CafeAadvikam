// src/branch/components.tsx
import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useBranchStore } from './branchStore';
import type { Branch } from './types';

// ─── StockBadge ──────────────────────────────────────────────────────────────
export function StockBadge({ qty, threshold }: { qty: number; threshold: number }) {
  const low = qty <= threshold;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold',
      low ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700',
    )}>
      {low && <AlertTriangle className="size-3" />}
      {qty} units
    </span>
  );
}

// ─── ThresholdEditor ─────────────────────────────────────────────────────────
export function ThresholdEditor({
  branch, itemName, current,
}: { branch: Branch; itemName: string; current: number }) {
  const { updateThreshold } = useBranchStore();
  const [val, setVal]       = useState(String(current));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  // FIX #10 — sync input value when the parent stock data refreshes (e.g. from 30s auto-poll)
  // Only update if the user isn't actively editing (i.e. their draft matches the old value)
  useEffect(() => {
    setVal((prev) => {
      // If the user has typed something different from what we last saved,
      // don't overwrite their in-progress edit.
      const prevNum = Number(prev);
      if (!isNaN(prevNum) && prevNum !== current) {
        // They have a pending edit — leave it alone
        return prev;
      }
      return String(current);
    });
  }, [current]);

  const save = async () => {
    setSaving(true);
    await updateThreshold(branch, itemName, Number(val));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" min={0} value={val}
        onChange={(e) => setVal(e.target.value)}
        className="w-20 border rounded-lg px-2 py-1 text-sm bg-background"
      />
      <button
        onClick={save} disabled={saving}
        className={cn(
          'text-xs px-3 py-1 rounded-lg font-medium transition flex items-center gap-1 disabled:opacity-50',
          saved ? 'bg-emerald-100 text-emerald-700' : 'bg-primary text-primary-foreground',
        )}
      >
        {saving ? <Loader2 className="size-3 animate-spin" /> : saved ? <CheckCircle2 className="size-3" /> : null}
        {saving ? 'Saving…' : saved ? 'Saved' : 'Set'}
      </button>
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({
  label, value, sub, color, icon,
}: { label: string; value: string | number; sub?: string; color?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('font-display text-2xl font-black tabular-nums truncate', color ?? 'text-foreground')}>
            {value}
          </p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
          {sub && <p className="mt-0.5 truncate text-xs font-medium text-slate-400">{sub}</p>}
        </div>
        {icon && <div className="shrink-0 rounded-2xl bg-slate-100 p-2.5 text-slate-600">{icon}</div>}
      </div>
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
export function SectionHeader({
  icon, title, right,
}: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center gap-2">
      {icon}
      <h2 className="font-black text-sm text-slate-900">{title}</h2>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

// ─── TabBar ───────────────────────────────────────────────────────────────────
export function TabBar<T extends string>({
  tabs, active, onChange,
}: {
  tabs: { id: T; label: string; icon: React.ElementType }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1.5 rounded-[1.25rem] bg-slate-100 p-1.5 ring-1 ring-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id} onClick={() => onChange(t.id)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-black transition active:scale-[0.98]',
            active === t.id ? 'bg-slate-950 text-white shadow-lg shadow-slate-200' : 'text-slate-500 hover:bg-white',
          )}
        >
          <t.icon className="size-3" />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
export function EmptyState({ message }: { message: string }) {
  return <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-muted-foreground text-sm py-8 mx-4 my-4">{message}</p>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function fmt(d: string) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
