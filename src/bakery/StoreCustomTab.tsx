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

interface DeductionRow {
  item: StockItem | null;
  itemSearch: string;
  showDD: boolean;
  quantity: string;
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

// ─── Batch Confirm Dialog ──────────────────────────────────────────────────────
function BatchConfirmDialog({
  rows,
  reason,
  stockItems,
  onConfirm,
  onCancel,
  saving,
}: {
  rows: DeductionRow[];
  reason: string;
  stockItems: StockItem[];
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const validRows = rows.filter(r => r.item && Number(r.quantity) > 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-card border border-border rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-display font-bold text-foreground">Confirm Batch Deduction</h3>
          <button onClick={onCancel} className="size-7 rounded-lg bg-muted flex items-center justify-center">
            <X className="size-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Items table */}
        <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto">
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs font-body">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-3 py-2 text-left text-muted-foreground font-bold uppercase text-[10px]">Item</th>
                  <th className="px-3 py-2 text-right text-muted-foreground font-bold uppercase text-[10px]">Deduct</th>
                  <th className="px-3 py-2 text-right text-muted-foreground font-bold uppercase text-[10px]">After</th>
                </tr>
              </thead>
              <tbody>
                {validRows.map((r, i) => {
                  const qty = Number(r.quantity);
                  const newStock = r.item!.quantity - qty;
                  const goesNegative = newStock < 0;
                  return (
                    <tr key={i} className={cn('border-b border-border/40 last:border-0', goesNegative && 'bg-red-50/40')}>
                      <td className="px-3 py-2 font-semibold text-foreground">{r.item!.name}</td>
                      <td className="px-3 py-2 text-right text-destructive font-bold">−{qty} {r.item!.unit}</td>
                      <td className={cn('px-3 py-2 text-right font-bold', goesNegative ? 'text-red-600' : newStock <= r.item!.minThreshold ? 'text-amber-600' : 'text-emerald-600')}>
                        {newStock} {r.item!.unit}
                        {goesNegative && <span className="block text-[9px] font-body text-red-500">goes negative</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {validRows.some(r => r.item!.quantity - Number(r.quantity) < 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex gap-2">
              <AlertCircle className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] font-body text-amber-700">
                Some items will go negative. This is allowed — stock will be recorded as a negative value for tracking.
              </p>
            </div>
          )}

          <div className="bg-muted/30 rounded-xl px-3 py-2">
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-0.5">Reason</p>
            <p className="text-sm font-body text-foreground">{reason}</p>
          </div>
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
            Sync & Deduct All
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Single deduction row ──────────────────────────────────────────────────────
function DeductionRowEditor({
  row,
  index,
  stockItems,
  onUpdate,
  onRemove,
  canRemove,
}: {
  row: DeductionRow;
  index: number;
  stockItems: StockItem[];
  onUpdate: (index: number, patch: Partial<DeductionRow>) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}) {
  const filtered = useMemo(() => {
    const q = row.itemSearch.toLowerCase();
    return q ? stockItems.filter(i => i.name.toLowerCase().includes(q)) : stockItems;
  }, [stockItems, row.itemSearch]);

  const qty = Number(row.quantity);
  const newStock = row.item ? row.item.quantity - qty : null;
  const goesNegative = newStock !== null && newStock < 0;

  return (
    <div className="p-3 bg-muted/20 rounded-xl border border-border space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 relative">
          <button
            onClick={() => onUpdate(index, { showDD: !row.showDD })}
            className={cn(
              'w-full h-10 px-3 rounded-xl border bg-background text-xs font-body flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary/30',
              row.item ? 'border-primary/40 text-foreground' : 'border-border text-muted-foreground'
            )}
          >
            <span className="truncate">
              {row.item ? row.item.name : 'Select item…'}
            </span>
            <ChevronDown className={cn('size-3.5 text-muted-foreground shrink-0 ml-2 transition-transform', row.showDD && 'rotate-180')} />
          </button>

          {row.showDD && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-30 overflow-hidden">
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                  <input
                    autoFocus
                    value={row.itemSearch}
                    onChange={e => onUpdate(index, { itemSearch: e.target.value })}
                    placeholder="Search items…"
                    className="w-full h-8 pl-7 pr-3 rounded-lg border border-border bg-background text-xs font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-border/40">
                {filtered.length === 0 && (
                  <p className="px-3 py-3 text-xs font-body text-muted-foreground text-center">No items found</p>
                )}
                {filtered.map(item => (
                  <button
                    key={item.id}
                    onClick={() => onUpdate(index, { item, showDD: false, itemSearch: '', quantity: '' })}
                    className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="text-xs font-body font-semibold text-foreground">{item.name}</p>
                      <p className="text-[10px] font-body text-muted-foreground">{item.unit}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn('text-xs font-body font-bold tabular-nums', item.quantity <= item.minThreshold ? 'text-red-600' : 'text-foreground')}>
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

        {/* Qty */}
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={row.quantity}
            onChange={e => onUpdate(index, { quantity: e.target.value })}
            placeholder="Qty"
            className="w-20 h-10 px-2 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {row.item && (
            <span className="text-xs font-body font-semibold text-muted-foreground w-6 text-center">
              {row.item.unit}
            </span>
          )}
        </div>

        {canRemove && (
          <button
            onClick={() => onRemove(index)}
            className="size-10 flex items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      {/* After-deduction preview */}
      {row.item && qty > 0 && (
        <div className="flex items-center gap-2 text-[11px] font-body px-1">
          <span className="text-muted-foreground">After:</span>
          <span className={cn('font-bold tabular-nums', goesNegative ? 'text-red-600' : newStock! <= row.item.minThreshold ? 'text-amber-600' : 'text-emerald-600')}>
            {newStock} {row.item.unit}
          </span>
          {goesNegative && (
            <span className="flex items-center gap-0.5 text-red-600">
              <AlertCircle className="size-3" />
              Stock will go negative (−{Math.abs(newStock!)} {row.item.unit})
            </span>
          )}
        </div>
      )}
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

function blankRow(): DeductionRow {
  return { item: null, itemSearch: '', showDD: false, quantity: '' };
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function StoreCustomTab() {
  const { items: stockItems, loaded: stockLoaded, load: loadStock, deductMaterials } = useStoreStockStore();

  const [deductions, setDeductions] = useState<CustomDeduction[]>([]);
  const [tableReady, setTableReady]     = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [rows, setRows] = useState<DeductionRow[]>([blankRow()]);
  const [reason, setReason]          = useState('');
  const [customReason, setCustomReason] = useState('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  useEffect(() => { if (!stockLoaded) void loadStock(); }, [stockLoaded, loadStock]);

  useEffect(() => {
    fetchDeductions().then(({ records, tableReady: tr }) => {
      setDeductions(records);
      setTableReady(tr);
      setLoadingHistory(false);
    });
  }, []);

  const finalReason = reason === '__custom__' ? customReason.trim() : reason;

  const validRows = rows.filter(r => r.item && Number(r.quantity) > 0);
  const canSubmit = validRows.length > 0 && finalReason.length > 0;

  const updateRow = (index: number, patch: Partial<DeductionRow>) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  };

  const removeRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    // Close any open dropdowns first
    setRows(prev => [...prev.map(r => ({ ...r, showDD: false })), blankRow()]);
  };

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSaving(true); setError('');

    const results: string[] = [];
    const newRecords: CustomDeduction[] = [];

    for (const r of validRows) {
      const qty = Number(r.quantity);

      // Deduct from inventory (allow negative)
      const deductErr = await deductMaterials([{ name: r.item!.name, qty }]);
      if (deductErr && !deductErr.startsWith('Note:')) {
        results.push(`${r.item!.name}: deduction failed — ${deductErr}`);
        continue;
      }

      // Log to DB
      const record = await insertDeduction(r.item!, qty, finalReason);
      if (record) newRecords.push(record);
    }

    setSaving(false);

    if (newRecords.length > 0) {
      setDeductions(prev => [...newRecords.reverse(), ...prev]);
    }

    // Reset form
    setShowConfirm(false);
    setRows([blankRow()]);
    setReason('');
    setCustomReason('');

    if (results.length > 0) {
      setError(`Some items had errors:\n${results.join('\n')}`);
    } else {
      setSuccess(`Deducted ${validRows.length} item${validRows.length > 1 ? 's' : ''} successfully.`);
      setTimeout(() => setSuccess(''), 4000);
    }
  };

  return (
    <div className="space-y-5 pb-8 overflow-hidden">

      {/* Header */}
      <div className="bg-card border border-border rounded-3xl p-4 sm:p-5 shadow-soft">
        <div className="flex items-center gap-2 mb-1">
          <Scissors className="size-4 text-primary" />
          <h2 className="font-display font-bold text-foreground">Custom Deduction</h2>
        </div>
        <p className="text-[11px] font-body text-muted-foreground">
          Manually remove stock for internal use, spillage, or any other reason. Add multiple items at once. All deductions are logged.
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
          <span className="ml-auto text-[10px] font-body text-muted-foreground">{validRows.length} item{validRows.length !== 1 ? 's' : ''} selected</span>
        </div>

        <div className="px-4 py-4 space-y-4">

          {/* Multi-row item editor */}
          <div className="space-y-2">
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase block">
              Items *
            </label>
            {rows.map((row, i) => (
              <DeductionRowEditor
                key={i}
                row={row}
                index={i}
                stockItems={stockItems}
                onUpdate={updateRow}
                onRemove={removeRow}
                canRemove={rows.length > 1}
              />
            ))}
            <button
              onClick={addRow}
              className="w-full h-9 rounded-xl border border-dashed border-primary/40 text-xs font-body font-semibold text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="size-3.5" /> Add another item
            </button>
          </div>

          {/* Reason presets */}
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5 block">
              Reason * <span className="normal-case font-normal text-muted-foreground">(shared for all items)</span>
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
              <p className="text-xs font-body text-destructive whitespace-pre-wrap">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            disabled={!canSubmit}
            onClick={() => { setError(''); setShowConfirm(true); }}
            className="w-full h-12 rounded-xl bg-destructive text-destructive-foreground text-sm font-body font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            <Scissors className="size-4" />
            {validRows.length > 1 ? `Sync & Deduct ${validRows.length} Items` : 'Sync & Deduct from Inventory'}
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

      {/* Batch Confirm modal */}
      {showConfirm && (
        <BatchConfirmDialog
          rows={rows}
          reason={finalReason}
          stockItems={stockItems}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          saving={saving}
        />
      )}
    </div>
  );
}
