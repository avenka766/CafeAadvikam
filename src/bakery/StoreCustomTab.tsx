// src/bakery/StoreCustomTab.tsx
// Custom stock deduction tab for Store dashboard.
// Lets the store person manually remove inventory with a reason (spillage, staff use, etc.)
// All deductions are logged to `store_custom_deductions` in Supabase for audit trail.
//
// ─── DB MIGRATION (run once in Supabase SQL editor) ────────────────────────
// create table if not exists store_custom_deductions (
//   id          uuid primary key default gen_random_uuid(),
//   item_name   text not null,
//   item_id     text,
//   quantity    numeric not null,
//   unit        text not null,
//   reason      text not null,
//   deducted_by text,
//   created_at  timestamptz default now()
// );
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from 'react';
import {
  Scissors, Search, Plus, Loader2, CheckCircle2,
  AlertCircle, History, X, ChevronDown, Trash2, Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useStoreStockStore } from './storeStockStore';
import type { StockItem } from './storeStockStore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface CustomDeduction {
  id: string;
  itemName: string;
  itemId: string | null;
  quantity: number;
  unit: string;
  reason: string;
  deductedBy: string | null;
  createdAt: string;
}

// ─── Preset reason tags ───────────────────────────────────────────────────────
const REASON_PRESETS = [
  'Staff meal / canteen',
  'Spillage / wastage',
  'Damaged goods',
  'Baker request',
  'Quality rejection',
  'Sampling / testing',
  'Expired stock',
  'Cleaning / maintenance',
];

// ─── DB helpers ────────────────────────────────────────────────────────────────
async function fetchDeductions(): Promise<{ records: CustomDeduction[]; tableReady: boolean }> {
  const { data, error } = await supabase
    .from('store_custom_deductions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.warn('store_custom_deductions fetch:', error.message);
    return { records: [], tableReady: false };
  }

  const records = (data ?? []).map(r => ({
    id: r.id as string,
    itemName: r.item_name as string,
    itemId: (r.item_id as string) ?? null,
    quantity: Number(r.quantity),
    unit: r.unit as string,
    reason: r.reason as string,
    deductedBy: (r.deducted_by as string) ?? null,
    createdAt: r.created_at as string,
  }));

  return { records, tableReady: true };
}

async function insertDeduction(
  item: StockItem,
  quantity: number,
  reason: string,
): Promise<CustomDeduction | null> {
  const { data, error } = await supabase
    .from('store_custom_deductions')
    .insert({
      item_name: item.name,
      item_id: item.id,
      quantity,
      unit: item.unit,
      reason: reason.trim(),
    })
    .select()
    .single();

  if (error || !data) {
    console.error('insertDeduction failed:', error?.message);
    return null;
  }

  return {
    id: data.id as string,
    itemName: data.item_name as string,
    itemId: (data.item_id as string) ?? null,
    quantity: Number(data.quantity),
    unit: data.unit as string,
    reason: data.reason as string,
    deductedBy: (data.deducted_by as string) ?? null,
    createdAt: data.created_at as string,
  };
}

// ─── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({
  item,
  quantity,
  reason,
  onConfirm,
  onCancel,
  saving,
}: {
  item: StockItem;
  quantity: number;
  reason: string;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const newQty = Math.max(0, item.quantity - quantity);
  const isFullDepletion = newQty === 0 && item.quantity > 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-bold text-foreground">Confirm Deduction</h3>
          <button onClick={onCancel} className="size-7 rounded-lg bg-muted flex items-center justify-center">
            <X className="size-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Stock preview */}
        <div className="px-5 py-4 space-y-3">
          <div className="bg-muted/40 rounded-xl p-3 space-y-2">
            <div className="flex justify-between text-sm font-body">
              <span className="text-muted-foreground">Item</span>
              <span className="font-semibold text-foreground">{item.name}</span>
            </div>
            <div className="flex justify-between text-sm font-body">
              <span className="text-muted-foreground">Deduct</span>
              <span className="font-bold text-destructive">−{quantity} {item.unit}</span>
            </div>
            <div className="border-t border-border/50 pt-2 flex justify-between text-sm font-body">
              <span className="text-muted-foreground">Current stock</span>
              <span className="font-semibold">{item.quantity} {item.unit}</span>
            </div>
            <div className="flex justify-between text-sm font-body">
              <span className="text-muted-foreground font-bold">New stock</span>
              <span className={cn(
                'font-display font-bold text-base tabular-nums',
                newQty === 0 ? 'text-destructive' : newQty <= item.minThreshold ? 'text-amber-600' : 'text-emerald-600'
              )}>
                {newQty} {item.unit}
              </span>
            </div>
          </div>

          <div className="bg-muted/30 rounded-xl px-3 py-2">
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-0.5">Reason</p>
            <p className="text-sm font-body text-foreground">{reason}</p>
          </div>

          {isFullDepletion && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex gap-2">
              <AlertCircle className="size-3.5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-body text-red-700">
                This will fully deplete the stock for <strong>{item.name}</strong>.
              </p>
            </div>
          )}

          {!isFullDepletion && newQty <= item.minThreshold && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex gap-2">
              <AlertCircle className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-body text-amber-700">
                Stock will fall below the minimum threshold of {item.minThreshold} {item.unit}.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl border border-border text-sm font-body font-semibold hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="flex-1 h-11 rounded-xl bg-destructive text-destructive-foreground text-sm font-body font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
            Sync & Deduct
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── History row ───────────────────────────────────────────────────────────────
function HistoryRow({ record }: { record: CustomDeduction }) {
  const date = new Date(record.createdAt);
  const dateLabel = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeLabel = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="size-8 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
        <Scissors className="size-3.5 text-destructive" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-body font-bold text-foreground">{record.itemName}</p>
          <span className="text-[10px] font-body font-bold text-destructive">
            −{record.quantity} {record.unit}
          </span>
        </div>
        <p className="text-[11px] font-body text-muted-foreground mt-0.5 truncate">{record.reason}</p>
        <p className="text-[10px] font-body text-muted-foreground mt-0.5">
          {dateLabel} at {timeLabel}
          {record.deductedBy && <span className="ml-1">· {record.deductedBy}</span>}
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function StoreCustomTab() {
  const { items: stockItems, loaded: stockLoaded, load: loadStock, deductMaterials } = useStoreStockStore();

  const [deductions, setDeductions] = useState<CustomDeduction[]>([]);
  const [tableReady, setTableReady]     = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [itemSearch, setItemSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [showItemDD, setShowItemDD]  = useState(false);
  const [quantity, setQuantity]      = useState('');
  const [reason, setReason]          = useState('');
  const [customReason, setCustomReason] = useState('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  useEffect(() => { if (!stockLoaded) loadStock(); }, [stockLoaded]);

  useEffect(() => {
    fetchDeductions().then(({ records, tableReady: tr }) => {
      setDeductions(records);
      setTableReady(tr);
      setLoadingHistory(false);
    });
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemSearch.toLowerCase();
    return q ? stockItems.filter(i => i.name.toLowerCase().includes(q)) : stockItems;
  }, [stockItems, itemSearch]);

  const finalReason = reason === '__custom__' ? customReason.trim() : reason;

  const canSubmit = selectedItem
    && Number(quantity) > 0
    && Number(quantity) <= selectedItem.quantity
    && finalReason.length > 0;

  const handleConfirm = async () => {
    if (!selectedItem || !canSubmit) return;
    setSaving(true); setError('');

    const qty = Number(quantity);

    // 1. Deduct from inventory
    const deductErr = await deductMaterials([{ name: selectedItem.name, qty }]);
    if (deductErr && !deductErr.startsWith('Note:')) {
      setSaving(false);
      setError(`Stock deduction failed: ${deductErr}`);
      return;
    }

    // 2. Log to DB
    const record = await insertDeduction(selectedItem, qty, finalReason);
    setSaving(false);

    if (!record) {
      // Stock was deducted but log failed — warn but don't block
      setError('Stock deducted but failed to save to history. Please note this manually.');
    } else {
      setDeductions(prev => [record, ...prev]);
    }

    // 3. Reset form
    setShowConfirm(false);
    setSelectedItem(null);
    setQuantity('');
    setReason('');
    setCustomReason('');
    setSuccess(`Deducted ${qty} ${selectedItem.unit} of ${selectedItem.name} successfully.`);
    setTimeout(() => setSuccess(''), 4000);
  };

  return (
    <div className="space-y-4 pb-8">

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Scissors className="size-4 text-primary" />
          <h2 className="font-display font-bold text-foreground">Custom Deduction</h2>
        </div>
        <p className="text-[11px] font-body text-muted-foreground">
          Manually remove stock for internal use, spillage, or any other reason. All deductions are logged.
        </p>
      </div>

      {/* DB not ready warning */}
      {!tableReady && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
          <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-body font-bold text-amber-800">Database table not set up</p>
            <p className="text-xs font-body text-amber-700 mt-1">
              Run the <strong>migration</strong> at the top of <code>StoreCustomTab.tsx</code> in your Supabase SQL editor, then refresh. Stock deductions still work — history won't be saved until then.
            </p>
          </div>
        </div>
      )}

      {/* Success toast */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <p className="text-sm font-body text-emerald-800 flex-1">{success}</p>
          <button onClick={() => setSuccess('')} aria-label="Dismiss"><X className="size-3.5 text-emerald-600" /></button>
        </div>
      )}

      {/* ── FORM ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Plus className="size-4 text-primary" />
          <h3 className="font-display font-bold text-foreground">New Deduction</h3>
        </div>

        <div className="px-4 py-4 space-y-4">

          {/* Item selector */}
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">
              Item *
            </label>
            <div className="relative">
              <button
                onClick={() => setShowItemDD(v => !v)}
                className={cn(
                  'w-full h-11 px-3 rounded-xl border bg-background text-sm font-body flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary/30',
                  selectedItem ? 'border-primary/40 text-foreground' : 'border-border text-muted-foreground'
                )}
              >
                <span className="truncate">
                  {selectedItem
                    ? `${selectedItem.name} (${selectedItem.quantity} ${selectedItem.unit} in stock)`
                    : 'Select item…'}
                </span>
                <ChevronDown className={cn('size-4 text-muted-foreground shrink-0 ml-2 transition-transform', showItemDD && 'rotate-180')} />
              </button>

              {showItemDD && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-30 overflow-hidden">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <input
                        autoFocus
                        value={itemSearch}
                        onChange={e => setItemSearch(e.target.value)}
                        placeholder="Search items…"
                        className="w-full h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-xs font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y divide-border/40">
                    {filteredItems.length === 0 && (
                      <p className="px-3 py-3 text-xs font-body text-muted-foreground text-center">No items found</p>
                    )}
                    {filteredItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => { setSelectedItem(item); setShowItemDD(false); setItemSearch(''); setQuantity(''); }}
                        className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-muted transition-colors"
                      >
                        <div>
                          <p className="text-xs font-body font-semibold text-foreground">{item.name}</p>
                          <p className="text-[10px] font-body text-muted-foreground">{item.unit}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn(
                            'text-xs font-body font-bold tabular-nums',
                            item.quantity <= item.minThreshold ? 'text-red-600' : 'text-foreground'
                          )}>
                            {item.quantity} {item.unit}
                          </p>
                          {item.quantity <= item.minThreshold && (
                            <p className="text-[9px] font-body text-red-500">Low stock</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quantity */}
          {selectedItem && (
            <div>
              <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">
                Quantity to Deduct * <span className="normal-case font-normal">(max {selectedItem.quantity} {selectedItem.unit})</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  max={selectedItem.quantity}
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder={`e.g. 2.5`}
                  className="flex-1 h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-sm font-body font-semibold text-muted-foreground shrink-0 w-10 text-center">
                  {selectedItem.unit}
                </span>
              </div>
              {Number(quantity) > selectedItem.quantity && (
                <p className="text-[11px] font-body text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="size-3" /> Exceeds available stock ({selectedItem.quantity} {selectedItem.unit})
                </p>
              )}
              {Number(quantity) > 0 && Number(quantity) <= selectedItem.quantity && (
                <p className="text-[11px] font-body text-muted-foreground mt-1">
                  After deduction: <strong className={cn(
                    Math.max(0, selectedItem.quantity - Number(quantity)) <= selectedItem.minThreshold
                      ? 'text-amber-600' : 'text-foreground'
                  )}>
                    {Math.max(0, selectedItem.quantity - Number(quantity))} {selectedItem.unit}
                  </strong>
                </p>
              )}
            </div>
          )}

          {/* Reason presets */}
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">
              Reason *
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {REASON_PRESETS.map(r => (
                <button
                  key={r}
                  onClick={() => setReason(reason === r ? '' : r)}
                  className={cn(
                    'text-[11px] font-body font-semibold px-2.5 py-1.5 rounded-xl border transition-all active:scale-95',
                    reason === r
                      ? 'cafe-gradient text-primary-foreground border-transparent'
                      : 'bg-muted/40 border-border text-foreground hover:border-primary/40'
                  )}
                >
                  {r}
                </button>
              ))}
              <button
                onClick={() => setReason('__custom__')}
                className={cn(
                  'text-[11px] font-body font-semibold px-2.5 py-1.5 rounded-xl border transition-all active:scale-95',
                  reason === '__custom__'
                    ? 'cafe-gradient text-primary-foreground border-transparent'
                    : 'bg-muted/40 border-border text-foreground hover:border-primary/40'
                )}
              >
                + Custom reason
              </button>
            </div>
            {reason === '__custom__' && (
              <input
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="Describe the reason…"
                className="w-full h-11 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            )}
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2 flex gap-2">
              <AlertCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs font-body text-destructive">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            disabled={!canSubmit}
            onClick={() => { setError(''); setShowConfirm(true); }}
            className="w-full h-12 rounded-xl bg-destructive text-destructive-foreground text-sm font-body font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            <Scissors className="size-4" /> Sync & Deduct from Inventory
          </button>
        </div>
      </div>

      {/* ── HISTORY ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <h3 className="font-display font-bold text-foreground">Deduction History</h3>
          {deductions.length > 0 && (
            <span className="ml-auto text-[10px] font-body text-muted-foreground">{deductions.length} record{deductions.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {loadingHistory ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : deductions.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-muted-foreground">
            <Package className="size-9 opacity-20" />
            <p className="text-sm font-body">No deductions recorded yet</p>
            <p className="text-xs font-body opacity-60">Use the form above to log a custom deduction</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {deductions.map(d => (
              <HistoryRow key={d.id} record={d} />
            ))}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {showConfirm && selectedItem && (
        <ConfirmDialog
          item={selectedItem}
          quantity={Number(quantity)}
          reason={finalReason}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          saving={saving}
        />
      )}
    </div>
  );
}
