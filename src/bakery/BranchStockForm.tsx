// ─── BranchStockForm ──────────────────────────────────────────────────────────
// Stock requirement entry form for a single branch.
// Used inside OrderReceiverDashboard — one instance per branch tab.

import { useState, useEffect } from 'react';
import { Plus, Trash2, Send, CheckCircle2, Loader2, Hash, Sparkles } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useBakeryItemsStore, BAKERY_CATEGORIES } from './bakeryItemsStore';
import { useAuthStore } from '@/stores/authStore';
import { RECIPE_DEFINITIONS } from './recipeDefinitions';
import type { BakeryOrderItem, Branch } from './types';
import { BRANCH_COLOR, CATEGORY_LABEL } from './receiverConstants';
import { cn } from '@/lib/utils';

interface Props {
  branch:      Branch;
  onSubmitted: () => void;
}

export default function BranchStockForm({ branch, onSubmitted }: Props) {
  const { submitOrder } = useBakeryStore();
  const { currentUser } = useAuthStore();
  const { items: bakeryItems, loaded, loading: itemsLoading, loadItems } = useBakeryItemsStore();

  const [note, setNote]             = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]       = useState(false);
  const [lines, setLines] = useState<{ itemId: string; itemName: string; qty: string }[]>([
    { itemId: '', itemName: '', qty: '' },
  ]);
  const [customLines, setCustomLines] = useState<{ name: string; qty: string }[]>([]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const defaultItem = bakeryItems[0];
  useEffect(() => {
    if (defaultItem && lines[0].itemId === '') {
      setLines([{ itemId: defaultItem.id, itemName: defaultItem.name, qty: '' }]);
    }
  }, [defaultItem]);

  // ── Regular lines ──────────────────────────────────────────────────────────
  const updateItemSelection = (idx: number, itemId: string) => {
    const item = bakeryItems.find(b => b.id === itemId);
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, itemId, itemName: item?.name || '' } : l));
  };
  const updateQty = (idx: number, val: string) => {
    if (val === '' || Number(val) >= 0)
      setLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: val } : l));
  };
  const addLine = () => {
    if (!defaultItem) return;
    setLines(prev => [...prev, { itemId: defaultItem.id, itemName: defaultItem.name, qty: '' }]);
  };
  const removeLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Custom lines ───────────────────────────────────────────────────────────
  const addCustomLine    = () => setCustomLines(prev => [...prev, { name: '', qty: '' }]);
  const removeCustomLine = (idx: number) => setCustomLines(prev => prev.filter((_, i) => i !== idx));
  const updateCustomName = (idx: number, val: string) =>
    setCustomLines(prev => prev.map((l, i) => i === idx ? { ...l, name: val } : l));
  const updateCustomQty  = (idx: number, val: string) => {
    if (val === '' || Number(val) >= 0)
      setCustomLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: val } : l));
  };

  const filledLines = lines.filter(l => l.qty !== '');
  const valid =
    filledLines.every(l => l.itemId !== '' && l.qty !== '' && Number(l.qty) > 0) &&
    customLines.every(l => l.name.trim() !== '' && l.qty !== '' && Number(l.qty) > 0) &&
    (filledLines.length > 0 || customLines.length > 0);

  const handleSubmit = async () => {
    if (!currentUser || !valid) return;
    setSubmitting(true);

    const items: BakeryOrderItem[] = [
      ...lines.filter(l => l.itemId !== '' && Number(l.qty) > 0).map(l => ({ itemId: l.itemId, itemName: l.itemName, quantity: Number(l.qty) })),
      ...customLines.map(l => ({
        itemId:   `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        itemName: l.name.trim(),
        quantity: Number(l.qty),
        isCustom: true,
      })),
    ];
    const label = [
      `${branch} Branch`,
      note.trim() ? `Note: ${note.trim()}` : '',
      `| ${currentUser.displayName}`,
    ].filter(Boolean).join(' ');

    await submitOrder(items, label, branch);
    setSubmitting(false);
    setSuccess(true);
    setNote('');
    if (defaultItem) setLines([{ itemId: defaultItem.id, itemName: defaultItem.name, qty: '' }]);
    setCustomLines([]);
    setTimeout(() => { setSuccess(false); onSubmitted(); }, 2000);
  };

  const colors = BRANCH_COLOR[branch];

  // ── Loading / empty states ─────────────────────────────────────────────────
  if (itemsLoading || !loaded) {
    return (
      <div className="p-8 flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm font-body text-muted-foreground">Loading items…</span>
      </div>
    );
  }

  if (bakeryItems.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-body text-muted-foreground">No active items found.</p>
        <p className="text-xs font-body text-muted-foreground mt-1">
          Ask admin to enable items in Bakery Item Management.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Branch banner */}
      <div className={cn('mx-4 mt-4 mb-4 rounded-xl border px-3 py-2.5 flex items-center gap-2.5', colors.banner)}>
        <span className="text-lg">🏪</span>
        <div>
          <p className="text-[10px] font-body font-bold uppercase opacity-60 leading-none mb-0.5">
            Stock Requirement for
          </p>
          <p className="text-sm font-display font-bold leading-none">{branch} Branch</p>
        </div>
      </div>

      <div className="px-4 space-y-4">

        {/* Note / reference */}
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 flex items-center gap-1">
            <Hash className="size-3" /> Note / Reference
            <span className="normal-case font-normal ml-0.5">(optional)</span>
          </label>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Festival order, WhatsApp ref #123…"
            className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Regular items */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-2.5">
            Items Required
            <span className="ml-1 normal-case text-primary font-normal">({bakeryItems.length} active)</span>
          </p>

          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <select
                  value={line.itemId}
                  onChange={e => updateItemSelection(idx, e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {BAKERY_CATEGORIES.map(category => {
                    const catItems = bakeryItems.filter(i => i.category === category);
                    if (catItems.length === 0) return null;
                    return (
                      <optgroup key={category} label={CATEGORY_LABEL[category] || category}>
                        {catItems.map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>

                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <input
                    type="number" min={1}
                    value={line.qty}
                    onChange={e => updateQty(idx, e.target.value)}
                    placeholder="Qty"
                    className={cn(
                      'w-16 h-10 px-2 rounded-xl border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30',
                      line.qty === '' ? 'border-amber-400' : 'border-border'
                    )}
                  />
                  {line.itemId && RECIPE_DEFINITIONS[line.itemId]?.outputUnit && (
                    <span className="text-[9px] font-body font-bold text-primary leading-none">
                      {RECIPE_DEFINITIONS[line.itemId].outputUnit}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => removeLine(idx)}
                  disabled={lines.length === 1}
                  className="size-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all shrink-0"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addLine}
            className="mt-2 h-9 w-full rounded-xl border-2 border-dashed border-border text-sm font-body font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="size-4" /> Add Item
          </button>
        </div>

        {/* Custom items */}
        <div className="border-t border-border pt-3 pb-1">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-3.5 text-amber-500" />
            <p className="text-[10px] font-body font-bold text-muted-foreground uppercase">
              Custom Items
              <span className="ml-1 normal-case text-amber-600 font-normal">not in the list</span>
            </p>
          </div>

          {customLines.length === 0 && (
            <p className="text-[11px] font-body text-muted-foreground mb-2">
              Need something not in the list? Add it below.
            </p>
          )}

          <div className="space-y-2">
            {customLines.map((line, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  value={line.name}
                  onChange={e => updateCustomName(idx, e.target.value)}
                  placeholder="Item name (e.g. Rose Milk Cake)"
                  className={cn(
                    'flex-1 h-10 px-3 rounded-xl border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/40',
                    line.name.trim() === '' ? 'border-amber-400' : 'border-amber-300'
                  )}
                />
                <input
                  type="number" min={1}
                  value={line.qty}
                  onChange={e => updateCustomQty(idx, e.target.value)}
                  placeholder="Qty"
                  className={cn(
                    'w-16 h-10 px-2 rounded-xl border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-amber-400/40',
                    line.qty === '' ? 'border-amber-400' : 'border-amber-300'
                  )}
                />
                <button
                  onClick={() => removeCustomLine(idx)}
                  className="size-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center active:scale-95 transition-all shrink-0"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addCustomLine}
            className="mt-2 h-9 w-full rounded-xl border-2 border-dashed border-amber-300 text-sm font-body font-semibold text-amber-600 hover:border-amber-400 hover:bg-amber-50/60 transition-colors flex items-center justify-center gap-1.5"
          >
            <Sparkles className="size-3.5" /> Add Custom Item
          </button>
        </div>
      </div>

      {/* Submit */}
      <div className="px-4 py-3 border-t border-border mt-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || success || !valid}
          className={cn(
            'w-full h-11 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50',
            success ? 'bg-emerald-500 text-white' : 'cafe-gradient text-primary-foreground'
          )}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" />
            : success  ? <><CheckCircle2 className="size-4" /> Sent to Packing!</>
            : <><Send className="size-4" /> Send Requirement to Packing</>}
        </button>
      </div>
    </div>
  );
}
