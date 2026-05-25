// ─── BranchStockForm ──────────────────────────────────────────────────────────
// Stock requirement entry form for a single branch.
// Changes:
//   • Removed Note / Reference field
//   • Added category filter pill bar (scrollable, branch-coloured)
//   • Added search bar to filter items by name
//   • Works for all 3 receivers: VRSNB, SNB, Hosur

import { useState, useMemo } from 'react';
import { Plus, Trash2, Send, CheckCircle2, Loader2, Scale, ArrowRight, Search, X, Sparkles } from 'lucide-react';
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

const ALL = 'All';

// ── Component ─────────────────────────────────────────────────────────────────

export default function BranchStockForm({ branch, onSubmitted }: Props) {
  const { submitOrder } = useBakeryStore();
  const { currentUser } = useAuthStore();

  const { items: branchItems, categories } = useMemo(() => getBranchSource(branch), [branch]);
  const defaultItem = branchItems[0];

  const [submitting,   setSubmitting]   = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [submitError,  setSubmitError]  = useState<string | null>(null);
  const [selectedCat,  setSelectedCat]  = useState<string>(ALL);
  const [search,       setSearch]       = useState('');

  const [lines, setLines] = useState<LineItem[]>([
    defaultItem ? makeLine(branch, defaultItem) : { itemId: '', itemName: '', uom: 'Kgs', weightGrams: null, qty: '' },
  ]);
  const [customLines, setCustomLines] = useState<{ name: string; qty: string }[]>([]);

  // ── Filtered item list (category + search) ─────────────────────────────────

  const filteredItems = useMemo(() => {
    let list = selectedCat === ALL ? branchItems : branchItems.filter(i => i.category === selectedCat);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(i => i.name.toLowerCase().includes(q));
    return list;
  }, [branchItems, selectedCat, search]);

  // Grouped for "All" view (optgroups), flat for filtered view
  const itemsByCategory = useMemo(() => {
    if (selectedCat !== ALL || search.trim()) return null; // flat mode
    const map: Record<string, typeof branchItems> = {};
    for (const cat of categories) {
      const catItems = branchItems.filter(i => i.category === cat);
      if (catItems.length > 0) map[cat] = catItems as typeof branchItems;
    }
    return map;
  }, [branchItems, categories, selectedCat, search]);

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
    const first = filteredItems[0] ?? defaultItem;
    if (!first) return;
    setLines(prev => [...prev, makeLine(branch, first)]);
  };

  const removeLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  // When category changes, reset any line whose current item isn't in the new filtered list
  const handleCatChange = (cat: string) => {
    setSelectedCat(cat);
    setSearch('');
    const nextItems = cat === ALL ? branchItems : branchItems.filter(i => i.category === cat);
    const firstNext = nextItems[0];
    if (!firstNext) return;
    setLines(prev => prev.map(l => {
      const stillValid = nextItems.some(i => toItemId(branch, i.barcode) === l.itemId);
      return stillValid ? l : makeLine(branch, firstNext);
    }));
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    // Reset lines whose item is no longer in filtered list
    const nextItems = (selectedCat === ALL ? branchItems : branchItems.filter(i => i.category === selectedCat))
      .filter(i => val.trim() === '' || i.name.toLowerCase().includes(val.trim().toLowerCase()));
    if (nextItems.length === 0) return;
    setLines(prev => prev.map(l => {
      const stillValid = nextItems.some(i => toItemId(branch, i.barcode) === l.itemId);
      return stillValid ? l : makeLine(branch, nextItems[0]);
    }));
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
          if (l.uom === 'Nos' && l.weightGrams !== null) {
            const kgQty = pcsToKg(l.itemName, rawQty) ?? rawQty;
            return { itemId: l.itemId, itemName: l.itemName, quantity: kgQty, originalPcs: rawQty, weightGrams: l.weightGrams, dispatchUnit: 'pcs' as const };
          }
          if (l.uom === 'Nos' && l.weightGrams === null) {
            return { itemId: l.itemId, itemName: l.itemName, quantity: rawQty, originalPcs: rawQty, dispatchUnit: 'pcs' as const };
          }
          return { itemId: l.itemId, itemName: l.itemName, quantity: rawQty, dispatchUnit: 'kg' as const };
        }),
      ...customLines.map((l, idx): BakeryOrderItem => ({
        itemId:       `custom-${currentUser.id}-${idx}`,
        itemName:     l.name.trim(),
        quantity:     Number(l.qty),
        isCustom:     true,
        dispatchUnit: 'kg' as const,
      })),
    ];

    const label = `${branch} Branch | ${currentUser.displayName}`;

    setSubmitError(null);
    try {
      await submitOrder(items, label, branch);
      setSuccess(true);
      setLines([defaultItem ? makeLine(branch, defaultItem) : lines[0]]);
      setCustomLines([]);
      setSelectedCat(ALL);
      setSearch('');
      setTimeout(() => { setSuccess(false); onSubmitted(); }, 2000);
    } catch {
      setSubmitError('Failed to submit — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const colors = BRANCH_COLOR[branch];

  const pillBase    = 'px-3 py-1.5 rounded-full text-[11px] font-body font-semibold border transition-all shrink-0';
  const pillActive  = branch === 'VRSNB'
    ? 'bg-blue-600 text-white border-blue-600'
    : branch === 'SNB'
    ? 'bg-amber-500 text-white border-amber-500'
    : 'bg-emerald-600 text-white border-emerald-600';
  const pillInactive = 'bg-background text-muted-foreground border-border';

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
          {branch === 'VRSNB' ? `${VRSNB_ITEMS.length}` : `${SNB_ITEMS.length}`} items
        </span>
      </div>

      <div className="px-4 space-y-4">

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

        {/* Items section */}
        <div className="border-t border-border pt-3">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-3">
            Items Required
            <span className="ml-1 normal-case text-primary font-normal">
              ({filteredItems.length} of {branchItems.length} items)
            </span>
          </p>

          {/* ── Category filter pills ── */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
            {[ALL, ...categories].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => handleCatChange(cat)}
                className={cn(pillBase, selectedCat === cat ? pillActive : pillInactive)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* ── Search bar ── */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search items…"
              className="w-full h-10 pl-9 pr-9 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* No results state */}
          {filteredItems.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm font-body text-muted-foreground">No items match your search.</p>
              <button onClick={() => { setSearch(''); setSelectedCat(ALL); }} className="text-xs text-primary underline mt-1">Clear filters</button>
            </div>
          )}

          {/* Line rows */}
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
                      {filteredItems.length === 0 ? (
                        <option disabled>No items</option>
                      ) : itemsByCategory && !search.trim() ? (
                        // Grouped optgroups when showing All with no search
                        Object.entries(itemsByCategory).map(([cat, catItems]) => (
                          <optgroup key={cat} label={cat}>
                            {catItems.map(item => (
                              <option key={item.barcode} value={toItemId(branch, item.barcode)}>
                                {item.name}{item.uom === 'Nos' ? ' (pcs)' : ' /kg'}
                              </option>
                            ))}
                          </optgroup>
                        ))
                      ) : (
                        // Flat list when a category is selected or search is active
                        filteredItems.map(item => (
                          <option key={item.barcode} value={toItemId(branch, item.barcode)}>
                            {item.name}{item.uom === 'Nos' ? ' (pcs)' : ' /kg'}
                          </option>
                        ))
                      )}
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

                  {/* Status chips */}
                  {line.qty !== '' && (
                    <div className="flex flex-wrap items-center gap-1.5 ml-0.5">
                      {line.uom === 'Nos' && convertedKg !== null && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-body font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          <Scale className="size-2.5" />
                          {Number(line.qty)} pcs → <strong>{convertedKg} kg</strong>
                        </span>
                      )}
                      {noWeight && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-body font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          ⚠ No weight found — submitting as {line.qty} pcs
                        </span>
                      )}
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
            disabled={filteredItems.length === 0}
            className="mt-2 h-9 w-full rounded-xl border-2 border-dashed border-border text-sm font-body font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
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
