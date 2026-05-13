// src/branch/tabs/StockTab.tsx
import { useState } from 'react';
import {
  ArrowDownToLine, Package, AlertTriangle, Loader2,
  ChevronDown, ChevronUp, Scale, Hash, CheckCircle2, CheckCheck,
  PencilLine, Search, X, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader, EmptyState, fmt } from '../components';
import { useBranchStore } from '../branchStore';
import { useAuthStore } from '@/stores/authStore';
import type { Branch } from '../types';
import type { StockItem, IncomingStock } from '../branchStore';
import { SNB_ITEMS, SNB_CATEGORIES } from '../snbItems';
import type { SnbItem } from '../snbItems';
import { VRSNB_ITEMS, VRSNB_CATEGORIES } from '../vrsnbItems';

interface Props {
  branch: Branch;
  branchStock: StockItem[];
  branchIncoming: IncomingStock[];
  loading: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function ConfirmButton({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');

  const handleClick = async () => {
    setState('loading');
    await onConfirm();
    setState('done');
  };

  if (state === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
        <CheckCircle2 className="size-3.5" /> Added
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
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

  // Build item list from price list — uom is authoritative for unit display
  const allItems: { name: string; uom: string; category: string }[] = isSNB
    ? SNB_ITEMS.map((i) => ({ name: i.name, uom: i.uom, category: i.category }))
    : VRSNB_ITEMS.map((i) => ({ name: i.name, uom: i.uom, category: i.category }));

  // Build a quick lookup: itemName → current quantity from DB
  const stockMap = new Map(branchStock.map((s) => [s.itemName, s.quantity]));

  const [search, setSearch]         = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [editItem, setEditItem]     = useState<string | null>(null);
  const [editQty, setEditQty]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState<Record<string, boolean>>({});
  const [error, setError]           = useState('');

  const categories = isSNB
    ? ['All', ...SNB_CATEGORIES]
    : ['All', ...VRSNB_CATEGORIES];

  const filtered = allItems.filter((item) => {
    const matchQ   = !search.trim() || item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'All' || item.category === activeCategory;
    return matchQ && matchCat;
  });

  const handleSave = async (itemName: string, uom: string) => {
    const qty = parseFloat(editQty);
    if (isNaN(qty) || qty < 0) { setError('Enter a valid quantity.'); return; }
    setSaving(true); setError('');
    const err = await manualUpdateStock(branch, itemName, qty, updatedBy);
    setSaving(false);
    if (err) { setError(err); return; }
    setSaved((prev) => ({ ...prev, [itemName]: true }));
    setEditItem(null); setEditQty('');
    setTimeout(() => setSaved((prev) => ({ ...prev, [itemName]: false })), 3000);
  };

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
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
          const isKg       = item.uom === 'Kgs' || item.uom === 'kg';
          const currentQty = stockMap.get(item.name) ?? 0;
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
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(item.name, item.uom); if (e.key === 'Escape') { setEditItem(null); setEditQty(''); } }}
                  />
                  <button onClick={() => handleSave(item.name, item.uom)} disabled={saving}
                    className="h-8 px-3 rounded-lg bg-violet-600 text-white text-xs font-bold disabled:opacity-50 transition active:scale-95">
                    {saving ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
                  </button>
                  <button onClick={() => { setEditItem(null); setEditQty(''); }}
                    className="h-8 px-2 rounded-lg bg-muted text-muted-foreground text-xs font-bold transition active:scale-95">
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditItem(item.name); setEditQty(''); setError(''); }}
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

// ─── Main ─────────────────────────────────────────────────────────────────────

type StockSubTab = 'incoming' | 'current' | 'manual';

export function StockTab({ branch, branchStock, branchIncoming, loading }: Props) {
  const { confirmIncoming, confirmAllIncoming } = useBranchStore();
  const [subTab, setSubTab]               = useState<StockSubTab>('incoming');
  const [outOfStockExpanded, setOutOfStockExpanded] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);

  const SNB_BRANCHES_CONST = ['SNB', 'Hosur'] as const;
  const isSNBBranch = (SNB_BRANCHES_CONST as readonly string[]).includes(branch);
  const allowedItemNames = new Set(
    isSNBBranch
      ? SNB_ITEMS.map((i) => i.name)
      : VRSNB_ITEMS.map((i) => i.name)
  );

  const filteredStock = branchStock.filter((s) => allowedItemNames.has(s.itemName));

  // Build uom lookup from price list — 'Kgs' → 'kg', 'Nos'/'pcs' → 'pcs'
  const uomMap = new Map<string, 'kg' | 'pcs'>(
    (isSNBBranch ? SNB_ITEMS : VRSNB_ITEMS).map((i) => [
      i.name,
      i.uom === 'Kgs' || i.uom === 'kg' ? 'kg' : 'pcs',
    ])
  );

  // Build a complete item list: all branch items, with DB quantity if exists, else 0
  const allBranchItemNames = isSNBBranch
    ? SNB_ITEMS.map((i) => i.name)
    : VRSNB_ITEMS.map((i) => i.name);
  const stockMap = new Map(filteredStock.map((s) => [s.itemName, s]));
  const completeStock = allBranchItemNames.map((name) => {
    const s = stockMap.get(name);
    const unit = uomMap.get(name); // authoritative unit from price list
    return s
      ? { ...s, unit }  // override whatever DB says with price list unit
      : { itemName: name, quantity: 0, minThreshold: 10, price: null, unit };
  });

  const availableItems  = completeStock.filter((s) => s.quantity > 0);
  const outOfStockItems = completeStock.filter((s) => s.quantity <= 0);

  const today = new Date().toDateString();
  const todayIncoming = branchIncoming.filter(
    (inc) => !inc.confirmed && new Date(inc.receivedAt).toDateString() === today
  );

  const handleConfirmAll = async () => {
    setConfirmingAll(true);
    await confirmAllIncoming(branch);
    setConfirmingAll(false);
  };

  const SUBTABS: { id: StockSubTab; label: string }[] = [
    { id: 'incoming', label: `Incoming${todayIncoming.length > 0 ? ` (${todayIncoming.length})` : ''}` },
    { id: 'current',  label: 'Current stock' },
    { id: 'manual',   label: 'Update stock' },
  ];

  return (
    <div className="space-y-3">

      {/* Sub-tab bar */}
      <div className="flex gap-1.5 bg-muted/60 p-1 rounded-xl">
        {SUBTABS.map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={cn('flex-1 py-2 text-xs font-semibold rounded-lg transition',
              subTab === t.id
                ? 'bg-card shadow text-foreground'
                : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Incoming ────────────────────────────────────────────────────────── */}
      {subTab === 'incoming' && (
        <div className="bg-card border rounded-xl overflow-hidden">
          <SectionHeader
            icon={<ArrowDownToLine className="size-4 text-emerald-600" />}
            title="Incoming Stock"
            right={
              todayIncoming.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{todayIncoming.length} pending</span>
                  <button onClick={handleConfirmAll} disabled={confirmingAll}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 px-2.5 py-1 rounded-full disabled:opacity-50 transition active:scale-95">
                    {confirmingAll ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
                    {confirmingAll ? 'Adding…' : 'Confirm All'}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Today</span>
              )
            }
          />
          {todayIncoming.length === 0 ? (
            <EmptyState message="No incoming stock today. Items dispatched from Packing will appear here." />
          ) : (
            <div className="divide-y">
              {todayIncoming.map((inc) => {
                const displayUnit = inc.unit ?? detectSellUnit(inc.itemName);
                return (
                  <div key={inc.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {displayUnit === 'kg' ? <Scale className="size-3.5 text-muted-foreground shrink-0" /> : <Hash className="size-3.5 text-muted-foreground shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{inc.itemName}</p>
                        <p className="text-xs text-muted-foreground">{fmt(inc.receivedAt)} · {inc.dispatchedBy}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full tabular-nums">
                        +{formatQtyLabel(inc.quantity, inc.itemName, inc.unit)}
                      </span>
                      <ConfirmButton onConfirm={() => confirmIncoming(branch, inc.id).then(() => {})} />
                    </div>
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
          <div className="bg-card border rounded-xl overflow-hidden">
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
            <div className="bg-card border border-red-100 rounded-xl overflow-hidden">
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
      {subTab === 'manual' && <ManualStockUpdate branch={branch} branchStock={branchStock} />}

    </div>
  );
}
