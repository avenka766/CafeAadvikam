// src/branch/tabs/StockTab.tsx
import { useEffect, useState } from 'react';
import {
  ArrowDownToLine, Package, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, Scale, Hash, CheckCircle2, CheckCheck,
  PencilLine, Search, X, Plus, RefreshCw, TrendingDown, Clock, User,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader, EmptyState, fmt } from '../components';
import { useBranchStore } from '../branchStore';
import { useAuthStore } from '@/stores/authStore';
import { useBranchOpsStore } from '../branchOpsStore';
import { supabase } from '@/lib/supabase';
import type { Branch } from '../types';
import type { StockItem, IncomingStock, StockMismatch } from '../branchStore';
import { useOperationalBranchCatalog } from '@/hooks/useOperationalBranchCatalog';
import { sanitizeQtyForUnit } from '@/bakery/PlannerLeftoverTab';

interface Props {
  branch: Branch;
  branchStock: StockItem[];
  branchIncoming: IncomingStock[];
  branchThresholds: Record<string, number>;
  loading: boolean;
  stockMismatches: StockMismatch[];
  allowManualUpdate?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeItemName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function detectSellUnit(itemName: string): 'kg' | 'pcs' {
  const lower = itemName.toLowerCase();
  const weightKeywords = [
    'mysore pak', 'burfi', 'halwa', 'laadu', 'ladoo', 'chikki', 'mixture',
    'muruk', 'murukku', 'boondhi', 'pakoda', 'chips', 'cashew', 'groundnut',
    'biscuit', 'cookie', 'soan papdi', 'chana dal', 'mix dal', 'nippat',
    'kachori', 'samosa', 'oppat', 'jelabi', 'jangiri', 'badusha',
  ];
  return weightKeywords.some((kw) => lower.includes(kw)) ? 'kg' : 'pcs';
}

function formatQtyLabel(qty: number, itemName: string, explicitUnit?: 'pcs' | 'kg'): string {
  // Use explicit unit when provided (e.g. from branch_incoming.unit) so pcs items
  // dispatched in pcs are displayed as pcs even if the item name looks like a kg item.
  const unit = explicitUnit ?? detectSellUnit(itemName);
  const clean = (n: number) => parseFloat(n.toFixed(3)).toString();
  if (unit === 'kg') {
    if (qty >= 1) return `${clean(qty)} kg`;
    const grams = Math.round(qty * 1000);
    return `${grams}g`;
  }
  return `${Math.round(qty)} pcs`;
}

function SmartStockBadge({ qty, threshold, itemName, unit }: { qty: number; threshold: number; itemName: string; unit?: 'pcs' | 'kg' }) {
  const displayUnit = unit ?? detectSellUnit(itemName);
  const low  = qty <= threshold;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold',
      low ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700',
    )}>
      {low && <AlertTriangle className="size-3 shrink-0" />}
      {displayUnit === 'kg'
        ? <Scale className="size-3 shrink-0 opacity-60" />
        : <Hash  className="size-3 shrink-0 opacity-60" />
      }
      {formatQtyLabel(qty, itemName, displayUnit)}
    </span>
  );
}

// ─── Per-item confirm button ───────────────────────────────────────────────────

// B9 FIX: onConfirm now returns string|null (error or null on success).
// Previously returned void and discarded the error, showing "✓ Added" even on failure.
function ConfirmButton({ onConfirm }: { onConfirm: () => Promise<string | null> }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  const handleClick = async () => {
    setState('loading');
    const err = await onConfirm();
    if (err) {
      setErrMsg(err);
      setState('error');
      setTimeout(() => setState('idle'), 4000);
    } else {
      setState('done');
    }
  };

  if (state === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
        <CheckCircle2 className="size-3.5" /> Added
      </span>
    );
  }

  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full" title={errMsg}>
        ✕ Failed
      </span>
    );
  }

  return (
    <button
      onClick={() => void handleClick()}
      disabled={state === 'loading'}
      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-primary px-3 py-1 rounded-full disabled:opacity-50 transition active:scale-95"
    >
      {state === 'loading'
        ? <Loader2 className="size-3.5 animate-spin" />
        : <CheckCircle2 className="size-3.5" />
      }
      Confirm
    </button>
  );
}

// ─── ManualStockUpdate panel ──────────────────────────────────────────────────

const SNB_BRANCHES = ['SNB', 'Hosur'] as const;

function ManualStockUpdate({ branch, branchStock }: { branch: Branch; branchStock: StockItem[] }) {
  const { manualUpdateStock } = useBranchStore();
  const { currentUser } = useAuthStore();
  const updatedBy = currentUser?.displayName || currentUser?.username || 'Staff';

  const isSNB = (SNB_BRANCHES as readonly string[]).includes(branch);
  const { items: catalogue, categories: catalogCategories } = useOperationalBranchCatalog(isSNB ? 'SNB' : 'VRSNB');

  // Build item list from the authoritative live catalogue.
  const allItems = catalogue.map((item) => ({ barcode: item.barcode, name: item.name, uom: item.uom, category: item.category }));

  // Build a quick lookup: itemName → current quantity from DB
  const stockMap = new Map(branchStock.map((s) => [normalizeItemName(s.itemName), s.quantity]));

  const [search, setSearch]         = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [editItem, setEditItem]     = useState<string | null>(null);
  const [editQty, setEditQty]       = useState('');
  const [editBaseline, setEditBaseline] = useState<number | null>(null);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState<Record<string, boolean>>({});
  const [error, setError]           = useState('');

  const categories = ['All', ...catalogCategories];

  const filtered = allItems.filter((item) => {
    const matchQ   = !search.trim() || item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'All' || item.category === activeCategory;
    return matchQ && matchCat;
  });

  const handleSave = async (itemName: string, uom: string) => {
    const qty = parseFloat(editQty);
    if (isNaN(qty) || qty < 0) { setError('Enter a valid quantity.'); return; }
    // AUDIT FIX (2026-09-02): the step={isKg?0.1:1} hint on the input below
    // is only a spinner nudge and doesn't block a typed/pasted decimal —
    // this had no actual rounding/integer enforcement for pcs items, the
    // same "pcs decimal ledger drift" bug class fixed multiple times
    // elsewhere in this codebase.
    const isKg = uom === 'Kgs';
    const safeQty = isKg ? qty : Math.round(qty);
    setSaving(true); setError('');
    const err = await manualUpdateStock(
      branch, itemName, safeQty, updatedBy,
      catalogue.find((item) => item.name === itemName)?.barcode,
      undefined,
      editBaseline ?? undefined,
    );
    setSaving(false);
    if (err) { setError(err); return; }
    setSaved((prev) => ({ ...prev, [itemName]: true }));
    setEditItem(null); setEditQty(''); setEditBaseline(null);
    setTimeout(() => setSaved((prev) => ({ ...prev, [itemName]: false })), 3000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[1.75rem] overflow-hidden shadow-sm">
      <SectionHeader
        icon={<PencilLine className="size-4 text-violet-600" />}
        title="Manual Stock Update"
        right={<span className="text-xs text-muted-foreground">{allItems.length} items</span>}
      />

      {/* Search */}
      <div className="px-4 pt-3 pb-2 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full pl-8 pr-8 py-2 rounded-xl bg-muted border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/40"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-3.5 text-muted-foreground" /></button>}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
          {categories.map((cat) => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={cn('shrink-0 px-3 py-1 rounded-full text-[10px] font-semibold border transition whitespace-nowrap',
                activeCategory === cat
                  ? 'bg-violet-600 text-white border-transparent'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/50')}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mx-4 mb-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl">{error}</p>}

      <div className="divide-y max-h-[480px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">No items match your search.</div>
        ) : filtered.map((item) => {
          const isEditing  = editItem === item.name;
          const wasSaved   = saved[item.name];
          // Use price list uom as authority: 'Kgs' → kg, anything else → pcs
          const isKg       = item.uom === 'Kgs';
          const currentQty = stockMap.get(normalizeItemName(item.name)) ?? 0;
          return (
            <div key={item.name} className={cn('flex items-center gap-3 px-4 py-3', wasSaved && 'bg-emerald-50/40')}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {isKg ? 'Kgs' : 'pcs'} · In stock:{' '}
                  <span className="font-semibold text-foreground">
                    {isKg
                      ? currentQty >= 1 ? `${currentQty} kg` : `${Math.round(currentQty * 1000)}g`
                      : `${currentQty} pcs`}
                  </span>
                </p>
              </div>
              {wasSaved ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="size-3" /> Updated
                </span>
              ) : isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number" inputMode="decimal" min="0" step={isKg ? 0.1 : 1}
                    value={editQty} onChange={(e) => setEditQty(e.target.value)}
                    placeholder={isKg ? '0.000 kg' : '0 pcs'}
                    className="w-24 h-8 px-2 rounded-lg border bg-white text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-violet-400/40"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(item.name, item.uom); if (e.key === 'Escape') { setEditItem(null); setEditQty(''); setEditBaseline(null); } }}
                  />
                  <button onClick={() => handleSave(item.name, item.uom)} disabled={saving}
                    className="h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-bold disabled:opacity-50 transition active:scale-95">
                    {saving ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
                  </button>
                  <button onClick={() => { setEditItem(null); setEditQty(''); setEditBaseline(null); }}
                    className="h-8 px-2 rounded-lg bg-muted text-muted-foreground text-xs font-bold transition active:scale-95">
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditItem(item.name); setEditQty(''); setEditBaseline(currentQty); setError(''); }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 px-2.5 py-1 rounded-full transition">
                  <PencilLine className="size-3" /> Update
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── NegativeStockTab ─────────────────────────────────────────────────────────

function NegativeStockTab({
  negativeItems,
  mismatches,
}: {
  negativeItems: { itemName: string; quantity: number; unit?: 'pcs' | 'kg' }[];
  mismatches: StockMismatch[];
}) {
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <div className="space-y-4">

      {/* ── Currently Negative Items ── */}
      <div className="bg-white border border-red-200 rounded-[1.75rem] overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 bg-red-50/60 border-b border-red-100">
          <div className="flex items-center gap-2">
            <TrendingDown className="size-4 text-red-600" />
            <span className="text-sm font-bold text-red-700">Items in Negative Stock</span>
          </div>
          <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
            {negativeItems.length} items
          </span>
        </div>

        {negativeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
            <CheckCircle2 className="size-8 text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-700">All clear!</p>
            <p className="text-xs text-muted-foreground">No items are currently in negative stock.</p>
          </div>
        ) : (
          <div className="divide-y divide-red-50">
            {negativeItems.map((s) => {
              const unit = s.unit ?? detectSellUnit(s.itemName);
              const absQty = Math.abs(s.quantity);
              const label = unit === 'kg'
                ? absQty >= 1 ? `${absQty.toFixed(3)} kg` : `${Math.round(absQty * 1000)}g`
                : `${Math.round(absQty)} pcs`;
              return (
                <div key={s.itemName} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="size-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{s.itemName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Needs <span className="font-bold text-red-600">{label}</span> to break even
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 tabular-nums shrink-0">
                    <TrendingDown className="size-3" />
                    -{label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {negativeItems.length > 0 && (
          <div className="px-4 py-3 bg-amber-50/60 border-t border-amber-100">
            <p className="text-[11px] text-amber-700 font-medium">
              ℹ️ When stock arrives and is confirmed via <span className="font-bold">Incoming</span>, it will automatically offset these negatives.
            </p>
          </div>
        )}
      </div>

      {/* ── Shortage Event Log ── */}
      <div className="bg-white border border-slate-200 rounded-[1.75rem] overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-slate-500" />
            <span className="text-sm font-bold text-slate-700">Shortage Event Log</span>
          </div>
          <span className="text-[10px] text-muted-foreground">Last 30 days</span>
        </div>

        {mismatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center px-4">
            <CheckCircle2 className="size-8 text-emerald-400" />
            <p className="text-sm font-semibold text-emerald-700">No shortages recorded</p>
            <p className="text-xs text-muted-foreground">Every bill in the last 30 days had sufficient stock.</p>
          </div>
        ) : (
          <div className="divide-y max-h-[480px] overflow-y-auto">
            {mismatches.map((m) => {
              const unit = detectSellUnit(m.itemName);
              const fmtQty = (q: number) => unit === 'kg'
                ? q >= 1 ? `${q.toFixed(3)} kg` : `${Math.round(q * 1000)}g`
                : `${Math.round(q)} pcs`;
              return (
                <div key={m.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{m.itemName}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <User className="size-3 text-muted-foreground shrink-0" />
                        <p className="text-[10px] text-muted-foreground">{m.soldBy}</p>
                        <span className="text-muted-foreground text-[10px]">·</span>
                        <p className="text-[10px] text-muted-foreground">{fmtDate(m.soldAt)}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">
                        Sold {fmtQty(m.soldQty)}
                      </div>
                      <div className="block">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                          Short by {fmtQty(m.shortage)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Inline Dispute / Return action row. Dispute asks for the quantity actually
// received before submitting; Return asks for a short reason. Kept as one
// small component so each incoming row can open its own form independently.
function IncomingActionForm({ mode, defaultQty, unit, onCancel, onSubmit }: {
  mode: 'dispute' | 'return';
  defaultQty: number;
  unit: string;
  onCancel: () => void;
  onSubmit: (qtyOrReason: { quantity?: number; reason: string }) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(String(defaultQty));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    if (mode === 'dispute') {
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty < 0) { setErr('Enter the quantity actually received.'); return; }
      setSaving(true);
      await onSubmit({ quantity: qty, reason });
      setSaving(false);
    } else {
      if (reason.trim().length < 3) { setErr('Enter a short reason for the return.'); return; }
      setSaving(true);
      await onSubmit({ reason });
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
      {mode === 'dispute' && (
        <label className="block text-xs font-semibold text-muted-foreground">
          Quantity actually received ({unit})
          {/* BUG FIX (audit 2026-09-02): pcs items never allow decimal points — same gap
              already fixed across the Planner/SNB dashboards' equivalent quantity fields
              (ManualStockUpdate.handleSave a bit above this in the same file included). */}
          <input type="number" min="0" step={unit === 'kg' ? 0.001 : 1} value={quantity}
            onChange={(e) => setQuantity(sanitizeQtyForUnit(e.target.value, unit === 'kg' ? 'kg' : 'pcs'))}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-300" />
        </label>
      )}
      <label className="block text-xs font-semibold text-muted-foreground">
        {mode === 'dispute' ? 'Reason (optional)' : 'Reason for return'}
        <textarea value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder={mode === 'dispute' ? 'Explain the mismatch, if anything beyond the quantity' : 'Why is this being sent back to Packing?'}
          className="mt-1 min-h-16 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-300" />
      </label>
      {err && <p className="text-[11px] font-bold text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button onClick={() => void submit()} disabled={saving}
          className={cn('inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg text-xs font-black text-white disabled:opacity-50', mode === 'dispute' ? 'bg-red-600' : 'bg-slate-900')}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : mode === 'dispute' ? <AlertTriangle className="size-3.5" /> : <Undo2 className="size-3.5" />}
          {mode === 'dispute' ? 'Submit Dispute' : 'Request Return'}
        </button>
        <button onClick={onCancel} disabled={saving} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

type StockSubTab = 'incoming' | 'current' | 'manual' | 'negative' | 'threshold';

export function StockTab({ branch, branchStock, branchIncoming, branchThresholds, loading, stockMismatches, allowManualUpdate = true }: Props) {
  const { confirmIncoming, confirmAllIncoming, syncIncomingFromDispatches, fetchBranchData } = useBranchStore();
  const { addNotification } = useBranchOpsStore();
  const { currentUser } = useAuthStore();
  const [subTab, setSubTab]               = useState<StockSubTab>('incoming');
  const [outOfStockExpanded, setOutOfStockExpanded] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [confirmAllError, setConfirmAllError] = useState('');
  const [syncing, setSyncing]             = useState(false);
  const [disputedIncoming, setDisputedIncoming] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(branchIncoming.filter((inc) => inc.disputed).map((inc) => [inc.id, true])),
  );
  const [disputeError, setDisputeError] = useState('');

  useEffect(() => {
    setDisputedIncoming(Object.fromEntries(branchIncoming.filter((inc) => inc.disputed).map((inc) => [inc.id, true])));
  }, [branchIncoming]);

  const SNB_BRANCHES_CONST = ['SNB', 'Hosur'] as const;
  const isSNBBranch = (SNB_BRANCHES_CONST as readonly string[]).includes(branch);
  const { items: liveCatalogue } = useOperationalBranchCatalog(isSNBBranch ? 'SNB' : 'VRSNB');
  const allowedItemNames = new Set(liveCatalogue.map((item) => item.name));

  const allowedNormalizedNames = new Set(Array.from(allowedItemNames, normalizeItemName));
  const filteredStock = branchStock.filter((s) => allowedNormalizedNames.has(normalizeItemName(s.itemName)));

  // Build uom lookup from price list — 'Kgs' → 'kg', 'Nos'/'pcs' → 'pcs'
  const uomMap = new Map<string, 'kg' | 'pcs'>(
    liveCatalogue.map((item): [string, 'kg' | 'pcs'] => [item.name, item.uom === 'Kgs' ? 'kg' : 'pcs'])
  );
  const barcodeMap = new Map(liveCatalogue.map((item) => [item.name, item.barcode]));

  // Build a complete item list: all branch items, with DB quantity if exists, else 0
  const allBranchItemNames = liveCatalogue.map((item) => item.name);
  const stockMap = new Map(filteredStock.map((s) => [normalizeItemName(s.itemName), s]));
  const completeStock = allBranchItemNames.map((name) => {
    const s = stockMap.get(normalizeItemName(name));
    const unit = uomMap.get(name);
    // Use saved threshold from store, fallback to DB row value, then default 10
    const minThreshold = branchThresholds[name] ?? s?.minThreshold ?? 10;
    return s
      ? { ...s, itemBarcode: s.itemBarcode ?? barcodeMap.get(name), unit, minThreshold }
      : { itemName: name, itemBarcode: barcodeMap.get(name), quantity: 0, minThreshold, price: liveCatalogue.find((item) => item.name === name)?.price ?? null, unit };
  });

  // NEGATIVE-ITEM FIX: also include any DB rows with negative quantity that aren't
  // in the price list (e.g. newly added items sold before being seeded into stock).
  // Without this, items sold from zero stock are invisible in the Negative tab.
  const completeStockNames = new Set(allBranchItemNames.map(normalizeItemName));
  const extraNegativeItems = branchStock.filter(
    (s) => s.quantity < 0 && !completeStockNames.has(normalizeItemName(s.itemName))
  ).map((s) => ({
    ...s,
    unit: s.unit ?? (detectSellUnit(s.itemName) as 'kg' | 'pcs'),
    minThreshold: branchThresholds[s.itemName] ?? s.minThreshold ?? 0,
  }));
  const fullStock = [...completeStock, ...extraNegativeItems];

  const availableItems  = fullStock.filter((s) => s.quantity > 0);
  const outOfStockItems = fullStock.filter((s) => s.quantity <= 0);
  const negativeItems   = fullStock.filter((s) => s.quantity < 0);

  const today = new Date().toDateString();
  // Show ALL unconfirmed incoming — no date cutoff.
  // Items dispatched days ago that were never confirmed must still be actionable.
  const todayIncoming = branchIncoming.filter((inc) => !inc.confirmed);

  const handleConfirmAll = async () => {
    setConfirmingAll(true);
    setConfirmAllError('');
    // STOCK-FIX: confirmAllIncoming returns string|null — capture and display it.
    // Previously the return value was discarded, so partial failures were invisible.
    const err = await confirmAllIncoming(branch);
    setConfirmingAll(false);
    if (err) setConfirmAllError(err);
  };

  const handleRefreshIncoming = async () => {
    setSyncing(true);
    // Force sync from dispatch_log (catches any missed records)
    await syncIncomingFromDispatches(branch, true);
    // fetchBranchData is already called inside syncIncomingFromDispatches,
    // but call again to ensure UI is refreshed even if sync was a no-op
    await fetchBranchData(branch, false, ['incoming']); // EGRESS FIX: incoming sync only touches incoming
    setSyncing(false);
  };

  // Dispute now asks for the quantity actually received and goes through a
  // secure RPC that also notifies branch admin + Owner + Planner (previously
  // this fired a fixed-reason local-only notification and left admin_notifications
  // untouched, so Planner never learned about a dispute at all).
  const raiseIncomingDispute = async (inc: IncomingStock, receivedQty: number, reasonText: string) => {
    setDisputeError('');
    const raisedBy = currentUser?.displayName || currentUser?.username || 'Branch User';
    const { error } = await supabase.rpc('raise_branch_incoming_dispute_secure', {
      p_incoming_id: inc.id,
      p_received_quantity: receivedQty,
      p_reason: reasonText.trim() || 'Received quantity does not match the dispatched/expected quantity',
    });
    if (error) {
      setDisputeError(error.message);
      return;
    }
    setDisputedIncoming((prev) => ({ ...prev, [inc.id]: true }));
    addNotification({
      branch,
      type: 'Stock Dispute',
      title: 'Incoming stock mismatch raised',
      details: `${inc.itemName} · Dispatched ${formatQtyLabel(inc.quantity, inc.itemName, inc.unit)} · Received ${formatQtyLabel(receivedQty, inc.itemName, inc.unit)}`,
      raisedBy,
    });
    await fetchBranchData(branch, false, ['incoming']); // EGRESS FIX: raising a dispute only touches incoming
  };

  // Return sends this incoming stock back to Packing: it appears as a
  // pending request in Planner's Transfer In queue (Daily Closure ▸ Disputes
  // & Returns), and syncs into closing stock once Planner confirms it.
  const [returnError, setReturnError] = useState('');
  const requestReturn = async (inc: IncomingStock, reasonText: string) => {
    setReturnError('');
    const { error } = await supabase.rpc('request_packing_transfer_in_return_secure', {
      p_incoming_id: inc.id,
      p_reason: reasonText.trim() || 'Returned by branch',
    });
    if (error) { setReturnError(error.message); return; }
    await fetchBranchData(branch, false, ['incoming']); // EGRESS FIX: requesting a return only touches incoming
  };

  // Which row (if any) has its Dispute/Return inline form open
  const [openIncomingForm, setOpenIncomingForm] = useState<Record<string, 'dispute' | 'return' | null>>({});

  // Bulk selection for "Confirm Selected"
  const [selectedIncoming, setSelectedIncoming] = useState<Record<string, boolean>>({});
  const [confirmingSelected, setConfirmingSelected] = useState(false);
  const [confirmSelectedError, setConfirmSelectedError] = useState('');
  const toggleSelected = (id: string) => setSelectedIncoming((prev) => ({ ...prev, [id]: !prev[id] }));
  const handleConfirmSelected = async () => {
    const ids = Object.entries(selectedIncoming).filter(([, checked]) => checked).map(([id]) => id);
    if (ids.length === 0) return;
    setConfirmingSelected(true);
    setConfirmSelectedError('');
    for (const id of ids) {
      const err = await confirmIncoming(branch, id);
      if (err) { setConfirmSelectedError(err); break; }
    }
    setConfirmingSelected(false);
    setSelectedIncoming({});
  };

  const SUBTABS: { id: StockSubTab; label: string }[] = [
    { id: 'incoming', label: `Incoming${todayIncoming.length > 0 ? ` (${todayIncoming.length})` : ''}` },
    { id: 'current',  label: 'Current stock' },
    ...(allowManualUpdate ? [{ id: 'manual' as const, label: 'Update stock' }] : []),
    { id: 'negative', label: `Negative${negativeItems.length > 0 ? ` (${negativeItems.length})` : ''}` },
    { id: 'threshold', label: 'Thresholds' },
  ];

  useEffect(() => {
    if (!allowManualUpdate && subTab === 'manual') setSubTab('incoming');
  }, [allowManualUpdate, subTab]);

  return (
    <div className="space-y-3">

      {/* Sub-tab bar */}
      <div className="flex gap-2 rounded-[1.25rem] bg-white p-1.5 ring-1 ring-slate-200 shadow-sm">
        {SUBTABS.map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={cn('flex-1 py-2.5 text-xs font-black rounded-2xl transition active:scale-[0.98]',
              subTab === t.id
                ? t.id === 'negative'
                  ? 'bg-red-600 shadow text-white'
                  : 'bg-slate-950 shadow text-white'
                : t.id === 'negative' && negativeItems.length > 0
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-slate-500 hover:bg-slate-50')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Incoming ────────────────────────────────────────────────────────── */}
      {subTab === 'incoming' && (
        <div className="bg-white border border-slate-200 rounded-[1.75rem] overflow-hidden shadow-sm">
          <SectionHeader
            icon={<ArrowDownToLine className="size-4 text-emerald-600" />}
            title="Incoming Stock"
            right={
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={handleRefreshIncoming} disabled={syncing}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full disabled:opacity-50 transition active:scale-95">
                  <RefreshCw className={cn('size-3', syncing && 'animate-spin')} />
                  {syncing ? 'Checking…' : 'Refresh'}
                </button>
                {Object.values(selectedIncoming).some(Boolean) && (
                  <button onClick={() => void handleConfirmSelected()} disabled={confirmingSelected}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-slate-900 px-2.5 py-1 rounded-full disabled:opacity-50 transition active:scale-95">
                    {confirmingSelected ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                    {confirmingSelected ? 'Adding…' : `Confirm Selected (${Object.values(selectedIncoming).filter(Boolean).length})`}
                  </button>
                )}
                {todayIncoming.length > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">{todayIncoming.length} pending</span>
                    <button onClick={handleConfirmAll} disabled={confirmingAll}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 px-2.5 py-1 rounded-full disabled:opacity-50 transition active:scale-95">
                      {confirmingAll ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
                      {confirmingAll ? 'Adding…' : 'Confirm All'}
                    </button>
                  </>
                )}
              </div>
            }
          />
          {confirmAllError && (
            <p className="mx-4 mt-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl">
              {confirmAllError}
            </p>
          )}
          {confirmSelectedError && (
            <p className="mx-4 mt-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl">
              {confirmSelectedError}
            </p>
          )}
          {disputeError && (
            <p className="mx-4 mt-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl">
              {disputeError}
            </p>
          )}
          {returnError && (
            <p className="mx-4 mt-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl">
              {returnError}
            </p>
          )}
          {todayIncoming.length === 0 ? (
            <EmptyState message="No incoming stock today. Items dispatched from Packing will appear here." />
          ) : (
            <div className="divide-y">
              {todayIncoming.map((inc) => {
                const displayUnit = inc.unit ?? detectSellUnit(inc.itemName);
                const isDisputed = disputedIncoming[inc.id] || inc.disputed;
                const isReturnRequested = inc.returnRequested;
                const isLocked = isDisputed || isReturnRequested;
                const [openForm, setOpenForm] = [openIncomingForm[inc.id], (v: 'dispute' | 'return' | null) => setOpenIncomingForm((p) => ({ ...p, [inc.id]: v }))];
                return (
                  <div key={inc.id} className="flex flex-wrap items-center justify-between px-4 py-3 gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {!isLocked && (
                        <input type="checkbox" checked={!!selectedIncoming[inc.id]} onChange={() => toggleSelected(inc.id)}
                          className="size-4 shrink-0 rounded border-slate-300" aria-label={`Select ${inc.itemName}`} />
                      )}
                      {displayUnit === 'kg' ? <Scale className="size-3.5 text-muted-foreground shrink-0" /> : <Hash className="size-3.5 text-muted-foreground shrink-0" />}
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium truncate">
                          <span className="truncate">{inc.itemName}</span>
                          {inc.advanceOrderNo && (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700" title="From an advance order">
                              {inc.advanceOrderNo}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{fmt(inc.receivedAt)} · {inc.dispatchedBy}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full tabular-nums">
                        +{formatQtyLabel(inc.quantity, inc.itemName, inc.unit)}
                      </span>
                      {!isLocked && (
                        <>
                          <button onClick={() => setOpenForm(openForm === 'dispute' ? null : 'dispute')}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition active:scale-95">
                            <AlertTriangle className="size-3.5" /> Dispute
                          </button>
                          <button onClick={() => setOpenForm(openForm === 'return' ? null : 'return')}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition active:scale-95">
                            <Undo2 className="size-3.5" /> Return
                          </button>
                          <ConfirmButton onConfirm={() => confirmIncoming(branch, inc.id)} />
                        </>
                      )}
                      {isDisputed && <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-amber-100 text-amber-700">Awaiting Admin Review</span>}
                      {!isDisputed && isReturnRequested && <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-blue-100 text-blue-700">Return Requested — Awaiting Planner</span>}
                    </div>
                    {openForm && !isLocked && (
                      <div className="w-full">
                        <IncomingActionForm
                          mode={openForm}
                          defaultQty={inc.quantity}
                          unit={displayUnit}
                          onCancel={() => setOpenForm(null)}
                          onSubmit={async ({ quantity, reason }) => {
                            if (openForm === 'dispute') await raiseIncomingDispute(inc, quantity ?? inc.quantity, reason);
                            else await requestReturn(inc, reason);
                            setOpenForm(null);
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Current stock ────────────────────────────────────────────────────── */}
      {subTab === 'current' && (
        <>
          <div className="bg-white border border-slate-200 rounded-[1.75rem] overflow-hidden shadow-sm">
            <SectionHeader
              icon={<Package className="size-4 text-primary" />}
              title="Available Stock"
              right={
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {availableItems.length} items
                </span>
              }
            />
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : availableItems.length === 0 ? (
              <EmptyState message="No items currently in stock." />
            ) : (
              <div className="divide-y">
                {availableItems.map((s) => (
                  <div key={s.itemName} className={cn('flex items-center justify-between px-4 py-3', s.quantity <= s.minThreshold && 'bg-amber-50/60')}>
                    <div className="flex items-center gap-2">
                      {s.quantity <= s.minThreshold && <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />}
                      <div>
                        <p className="text-sm font-medium">{s.itemName}</p>
                        <p className="text-xs text-muted-foreground">Min: {formatQtyLabel(s.minThreshold, s.itemName, s.unit)}</p>
                      </div>
                    </div>
                    <SmartStockBadge qty={s.quantity} threshold={s.minThreshold} itemName={s.itemName} unit={s.unit} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {outOfStockItems.length > 0 && (
            <div className="bg-white border border-red-200 rounded-[1.75rem] overflow-hidden shadow-sm">
              <button onClick={() => setOutOfStockExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-red-50/50 hover:bg-red-50 transition">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-red-500" />
                  <span className="text-sm font-semibold text-red-700">Out of Stock</span>
                  <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">{outOfStockItems.length}</span>
                </div>
                {outOfStockExpanded ? <ChevronUp className="size-4 text-red-400" /> : <ChevronDown className="size-4 text-red-400" />}
              </button>
              {outOfStockExpanded && (
                <div className="divide-y divide-red-50">
                  {outOfStockItems.map((s) => (
                    <div key={s.itemName} className="flex items-center justify-between px-4 py-2.5 bg-white">
                      <p className="text-sm text-muted-foreground">{s.itemName}</p>
                      <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Out of stock</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Manual stock update ──────────────────────────────────────────────── */}
      {allowManualUpdate && subTab === 'manual' && <ManualStockUpdate branch={branch} branchStock={branchStock} />}

      {/* ── Negative stock ───────────────────────────────────────────────────── */}
      {subTab === 'negative' && (
        <NegativeStockTab
          negativeItems={negativeItems}
          mismatches={stockMismatches}
        />
      )}

      {/* ── Thresholds ───────────────────────────────────────────────────────── */}
      {subTab === 'threshold' && (
        <ThresholdSubTab
          branch={branch}
          completeStock={completeStock}
          branchThresholds={branchThresholds}
        />
      )}

    </div>
  );
}

// ─── Threshold sub-tab ────────────────────────────────────────────────────────

function ThresholdSubTab({
  branch,
  completeStock,
  branchThresholds,
}: {
  branch: Branch;
  completeStock: Array<{ itemName: string; quantity: number; minThreshold: number; unit?: 'kg' | 'pcs' }>;
  branchThresholds: Record<string, number>;
}) {
  const { updateThreshold } = useBranchStore();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const handleSave = async (itemName: string) => {
    const newVal = Number(edits[itemName]);
    if (isNaN(newVal) || newVal < 0) return;
    setSaving((s) => ({ ...s, [itemName]: true }));
    await updateThreshold(branch, itemName, newVal);
    setSaved((s) => ({ ...s, [itemName]: true }));
    setSaving((s) => ({ ...s, [itemName]: false }));
    setTimeout(() => setSaved((s) => ({ ...s, [itemName]: false })), 2000);
  };

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="rounded-2xl bg-amber-50 p-3 text-amber-600"><AlertTriangle className="size-4" /></div>
        <div>
          <h3 className="text-xl font-black text-slate-950">Stock Thresholds</h3>
          <p className="text-sm font-bold text-slate-500">Set low-stock alert thresholds per item. Rows highlighted when stock ≤ threshold.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="p-3">Item Name</th>
              <th className="p-3 text-right">Current Qty</th>
              <th className="p-3 text-right">Current Threshold</th>
              <th className="p-3 text-right">New Threshold</th>
              <th className="p-3 text-right">Save</th>
            </tr>
          </thead>
          <tbody>
            {completeStock.map((s) => {
              const threshold = branchThresholds[s.itemName] ?? s.minThreshold;
              const isLow = s.quantity <= threshold;
              const editVal = edits[s.itemName] ?? '';
              return (
                <tr key={s.itemName} className={cn('border-t', isLow && 'bg-amber-50/70')}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {isLow && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />}
                      <span className={cn('font-medium', isLow && 'font-black text-amber-900')}>{s.itemName}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    <SmartStockBadge qty={s.quantity} threshold={threshold} itemName={s.itemName} unit={s.unit} />
                  </td>
                  <td className="p-3 text-right tabular-nums font-semibold">{threshold}</td>
                  <td className="p-3 text-right">
                    <input
                      type="number"
                      min="0"
                      placeholder={String(threshold)}
                      value={editVal}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [s.itemName]: e.target.value }))}
                      className="w-24 rounded-xl border-2 border-slate-200 px-3 py-1.5 text-right text-sm font-bold outline-none focus:border-amber-400"
                    />
                  </td>
                  <td className="p-3 text-right">
                    {saved[s.itemName] ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                        <CheckCircle2 className="size-3.5" /> Saved
                      </span>
                    ) : (
                      <button
                        onClick={() => void handleSave(s.itemName)}
                        disabled={!editVal || saving[s.itemName]}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        {saving[s.itemName] ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        Save
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
