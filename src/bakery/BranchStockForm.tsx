// ─── BranchStockForm ──────────────────────────────────────────────────────────
// Stock requirement entry form for a single branch.
//
// Item source is BRANCH-SPECIFIC:
//   VRSNB  → VRSNB_ITEMS  (same list shown in Admin → Items → VRSNB tab)
//   SNB    → SNB_ITEMS    (same list shown in Admin → Items → SNB tab)
//   Hosur  → SNB_ITEMS    (Hosur shares the SNB price list)
//
// VRSNB pcs → kg conversion
//   VRSNB items with uom = "Nos" are sold in pieces. Their name contains the
//   per-unit weight, e.g. "Banana chips (200g)". When the receiver enters a pcs
//   quantity the form converts it to kg in real time and submits the kg value so
//   the Store can calculate raw-material requirements correctly.
//   Items with no weight in the name are submitted as-is with a warning.

import { useState, useMemo } from 'react';
import { Plus, Trash2, Send, CheckCircle2, Loader2, Hash, Sparkles, Scale, ArrowRight } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { RECIPE_DEFINITIONS } from './recipeDefinitions';
import { VRSNB_ITEMS, VRSNB_CATEGORIES } from '@/branch/vrsnbItems';
import { SNB_ITEMS, SNB_CATEGORIES } from '@/branch/snbItems';
import { parseWeightGrams, pcsToKg, findRecipeId } from './itemMatcher';
import type { BakeryOrderItem, Branch } from './types';
import { BRANCH_COLOR } from './receiverConstants';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface LineItem {
  itemId:      string;
  itemName:    string;
  uom:         'Nos' | 'Kgs';
  weightGrams: number | null;
  qty:         string;
}

interface Props {
  branch:      Branch;
  onSubmitted: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBranchSource(branch: Branch) {
  if (branch === 'VRSNB') {
    return { items: VRSNB_ITEMS, categories: VRSNB_CATEGORIES as readonly string[] };
  }
  return { items: SNB_ITEMS, categories: SNB_CATEGORIES as readonly string[] };
}

function toItemId(branch: Branch, barcode: number): string {
  return `${branch === 'VRSNB' ? 'vrsnb' : 'snb'}-${barcode}`;
}

function makeLine(branch: Branch, item: { barcode: number; name: string; uom: 'Nos' | 'Kgs' }): LineItem {
  return {
    itemId:      toItemId(branch, item.barcode),
    itemName:    item.name,
    uom:         item.uom,
    weightGrams: item.uom === 'Nos' ? parseWeightGrams(item.name) : null,
    qty:         '',
  };
}

function hasRecipeFor(itemId: string, itemName: string): boolean {
  return !!(RECIPE_DEFINITIONS[itemId] ?? findRecipeId(itemName));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BranchStockForm({ branch, onSubmitted }: Props) {
  const { submitOrder } = useBakeryStore();
  const { currentUser } = useAuthStore();

  const { items: branchItems, categories } = useMemo(() => getBranchSource(branch), [branch]);
  const defaultItem = branchItems[0];

  const [note, setNote]             = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]       = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [lines, setLines] = useState<LineItem[]>([
    defaultItem ? makeLine(branch, defaultItem) : { itemId: '', itemName: '', uom: 'Kgs', weightGrams: null, qty: '' },
  ]);
  const [customLines, setCustomLines] = useState<{ name: string; qty: string }[]>([]);

  // ── Line manipulation ──────────────────────────────────────────────────────

  const updateItemSelection = (idx: number, itemId: string) => {
    const found = branchItems.find(i => toItemId(branch, i.barcode) === itemId);
    if (!found) return;
    setLines(prev => prev.map((l, i) => i === idx ? makeLine(branch, found) : l));
  };

  const updateQty = (idx: number, val: string) => {
    if (val === '' || Number(val) >= 0)
      setLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: val } : l));
  };

  const addLine = () => {
    if (!defaultItem) return;
    setLines(prev => [...prev, makeLine(branch, defaultItem)]);
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

  // ── Validation ─────────────────────────────────────────────────────────────

  // BUG #10 FIX: filledLines must exclude qty=0, not just empty string.
  // handleSubmit filters with Number(l.qty) > 0 so a qty="0" line is silently
  // dropped from submission but was previously allowed to pass validation.
  const filledLines = lines.filter(l => l.qty !== '' && Number(l.qty) > 0);

  const valid =
    filledLines.every(l => l.itemId !== '') &&
    customLines.every(l => l.name.trim() !== '' && l.qty !== '' && Number(l.qty) > 0) &&
    (filledLines.length > 0 || customLines.length > 0);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!currentUser || !valid) return;
    setSubmitting(true);

    const items: BakeryOrderItem[] = [
      ...lines
        .filter(l => l.itemId !== '' && Number(l.qty) > 0)
        .map((l): BakeryOrderItem => {
          const rawQty = Number(l.qty);

          // VRSNB Nos item with parseable weight → convert pcs to kg
          if (l.uom === 'Nos' && l.weightGrams !== null) {
            const kgQty = pcsToKg(l.itemName, rawQty) ?? rawQty;
            return { itemId: l.itemId, itemName: l.itemName, quantity: kgQty, originalPcs: rawQty, weightGrams: l.weightGrams, dispatchUnit: 'pcs' as const };
          }

          // VRSNB Nos item without weight in name → submit pcs as-is
          if (l.uom === 'Nos' && l.weightGrams === null) {
            return { itemId: l.itemId, itemName: l.itemName, quantity: rawQty, originalPcs: rawQty, dispatchUnit: 'pcs' as const };
          }

          // Kgs item → direct
          return { itemId: l.itemId, itemName: l.itemName, quantity: rawQty, dispatchUnit: 'kg' as const };
        }),

      // BUG #7 FIX: give custom items a stable ID (generated once, not on every render),
      // and always set dispatchUnit so packing knows how to handle them.
      ...customLines.map((l, idx): BakeryOrderItem => ({
        itemId:      `custom-${currentUser.uid}-${idx}`,
        itemName:    l.name.trim(),
        quantity:    Number(l.qty),
        isCustom:    true,
        dispatchUnit: 'kg' as const,
      })),
    ];

    const label = [
      `${branch} Branch`,
      note.trim() ? `Note: ${note.trim()}` : '',
      `| ${currentUser.displayName}`,
    ].filter(Boolean).join(' ');

    setSubmitError(null);
    try {
      await submitOrder(items, label, branch);
      setSuccess(true);
      setNote('');
      setLines([defaultItem ? makeLine(branch, defaultItem) : lines[0]]);
      setCustomLines([]);
      setTimeout(() => { setSuccess(false); onSubmitted(); }, 2000);
    } catch {
      setSubmitError('Failed to submit — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Grouped items for select optgroups ─────────────────────────────────────

  const colors = BRANCH_COLOR[branch];

  const itemsByCategory = useMemo(() => {
    const map: Record<string, typeof branchItems> = {};
    for (const cat of categories) {
      const catItems = branchItems.filter(i => i.category === cat);
      if (catItems.length > 0) map[cat] = catItems as typeof branchItems;
    }
    return map;
  }, [branchItems, categories]);

  // ── Render ─────────────────────────────────────────────────────────────────

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
        <span className="ml-auto text-[10px] font-body font-semibold opacity-60">
          {branch === 'VRSNB' ? `${VRSNB_ITEMS.length} items` : `${SNB_ITEMS.length} items`}
        </span>
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

        {/* VRSNB pcs info banner */}
        {branch === 'VRSNB' && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200">
            <ArrowRight className="size-3.5 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-[11px] font-body text-blue-800 leading-relaxed">
              <span className="font-bold">VRSNB items sold in pcs</span> — enter the number of packets.
              Weight is extracted from the item name and automatically converted to kg for the store.
            </p>
          </div>
        )}

        {/* Regular items */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-2.5">
            Items Required
            <span className="ml-1 normal-case text-primary font-normal">
              ({branchItems.length} items · {branch === 'VRSNB' ? 'VRSNB' : 'SNB'} price list)
            </span>
          </p>

          <div className="space-y-2">
            {lines.map((line, idx) => {
              const convertedKg = line.uom === 'Nos' && line.weightGrams !== null && line.qty !== ''
                ? pcsToKg(line.itemName, Number(line.qty))
                : null;
              const noWeight    = line.uom === 'Nos' && line.weightGrams === null;
              const recipeFound = line.qty !== '' ? hasRecipeFor(line.itemId, line.itemName) : null;

              return (
                <div key={idx} className="space-y-1">
                  <div className="flex gap-2 items-center">

                    {/* Item selector */}
                    <select
                      value={line.itemId}
                      onChange={e => updateItemSelection(idx, e.target.value)}
                      className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {Object.entries(itemsByCategory).map(([cat, catItems]) => (
                        <optgroup key={cat} label={cat}>
                          {catItems.map(item => (
                            <option key={item.barcode} value={toItemId(branch, item.barcode)}>
                              {item.name}{item.uom === 'Nos' ? ' (pcs)' : ' /kg'}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>

                    {/* Quantity */}
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={e => updateQty(idx, e.target.value)}
                        placeholder="Qty"
                        className={cn(
                          'w-16 h-10 px-2 rounded-xl border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30',
                          line.qty === '' ? 'border-amber-400' : 'border-border'
                        )}
                      />
                      <span className="text-[9px] font-body font-bold text-muted-foreground leading-none">
                        {line.uom === 'Nos' ? 'pcs' : 'kg'}
                      </span>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeLine(idx)}
                      disabled={lines.length === 1}
                      className="size-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all shrink-0"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  {/* Status chips below the row */}
                  {line.qty !== '' && (
                    <div className="flex flex-wrap items-center gap-1.5 ml-0.5">

                      {/* Conversion result for VRSNB Nos */}
                      {line.uom === 'Nos' && convertedKg !== null && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-body font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          <Scale className="size-2.5" />
                          {Number(line.qty)} pcs → <strong>{convertedKg} kg</strong>
                        </span>
                      )}

                      {/* Warning when no weight in name */}
                      {noWeight && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-body font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          ⚠ No weight found — submitting as {line.qty} pcs
                        </span>
                      )}

                      {/* Recipe status */}
                      {recipeFound !== null && (
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-body font-semibold px-2 py-0.5 rounded-full border',
                          recipeFound
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-muted-foreground bg-muted border-border'
                        )}>
                          {recipeFound ? '✓ Recipe found' : '– No recipe · will be custom'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
              <span className="ml-1 normal-case text-amber-600 font-normal">not in the {branch} list</span>
            </p>
          </div>

          {customLines.length === 0 && (
            <p className="text-[11px] font-body text-muted-foreground mb-2">
              Need something not in the price list? Add it here.
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
                  type="number"
                  min={1}
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
        {submitError && (
          <p className="text-xs font-body text-destructive text-center mb-2">{submitError}</p>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || success || !valid}
          className={cn(
            'w-full h-11 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50',
            success ? 'bg-emerald-500 text-white' : 'cafe-gradient text-primary-foreground'
          )}
        >
          {submitting
            ? <Loader2 className="size-4 animate-spin" />
            : success
            ? <><CheckCircle2 className="size-4" /> Sent to Store!</>
            : <><Send className="size-4" /> Send Requirement to Store</>}
        </button>
      </div>
    </div>
  );
}
