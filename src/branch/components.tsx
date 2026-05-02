// src/branch/components.tsx  ← NEW FILE
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from './branchStore';
import type { Branch } from './types';

// ─── StockBadge ──────────────────────────────────────────────────────────────
export function StockBadge({ qty, threshold }: { qty: number; threshold: number }) {
  const low = qty <= threshold;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold',
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
  const [val, setVal]     = useState(String(current));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

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
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3.5">
      <p className={cn('font-display text-2xl font-bold tabular-nums', color ?? 'text-foreground')}>
        {value}
      </p>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
export function SectionHeader({
  icon, title, right,
}: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
      {icon}
      <h2 className="font-semibold text-sm">{title}</h2>
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
    <div className="flex gap-1 bg-muted rounded-xl p-1">
      {tabs.map((t) => (
        <button
          key={t.id} onClick={() => onChange(t.id)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition',
            active === t.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground',
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
  return <p className="text-center text-muted-foreground text-sm py-6">{message}</p>;
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
