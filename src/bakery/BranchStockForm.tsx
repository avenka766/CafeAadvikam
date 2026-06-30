// ─── BranchStockForm ──────────────────────────────────────────────────────────
// Stock requirement entry form for a single branch.
// Changes:
//   • Removed Note / Reference field
//   • Added category filter pill bar (scrollable, branch-coloured)
//   • Removed the broken search field from the receiver order screen
//   • Works for all 3 receivers: VRSNB, SNB, Hosur

import { useState, useMemo, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  Loader2,
  Scale,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useBakeryStore } from "./bakeryStore";
import { useAuthStore } from "@/stores/authStore";
import { parseWeightGrams, pcsToKg } from "./itemMatcher";
import { useOperationalBranchCatalog } from "@/hooks/useOperationalBranchCatalog";
import { useRecipeStore } from "./recipeStore";
import { useBranchStore } from "@/branch/branchStore";
import type { BakeryOrderItem, Branch } from "./types";
import { BRANCH_COLOR } from "./receiverConstants";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  itemId: string;
  itemName: string;
  uom: "Nos" | "Kgs";
  weightGrams: number | null;
  qty: string;
}

interface Props {
  branch: Branch;
  onSubmitted: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toItemId(branch: Branch, barcode: number): string {
  return `${branch === "VRSNB" ? "vrsnb" : "snb"}-${barcode}`;
}

function makeLine(
  branch: Branch,
  item: { barcode: number; name: string; uom: "Nos" | "Kgs" },
): LineItem {
  return {
    id: `${Date.now()}-${Math.random()}`,
    itemId: toItemId(branch, item.barcode),
    itemName: item.name,
    uom: item.uom,
    weightGrams: item.uom === "Nos" ? parseWeightGrams(item.name) : null,
    qty: "",
  };
}

const ALL = "All";

// ── Component ─────────────────────────────────────────────────────────────────

export default function BranchStockForm({ branch, onSubmitted }: Props) {
  const { submitOrder } = useBakeryStore();
  const { currentUser } = useAuthStore();
  const { stock, fetchBranchData, subscribeToStock } = useBranchStore();

  const { items: branchItems, categories } = useOperationalBranchCatalog(branch);
  const { recipes, loadRecipes, subscribe: subscribeRecipes, getRecipe } = useRecipeStore();
  useEffect(() => {
    void loadRecipes();
    return subscribeRecipes();
  }, [loadRecipes, subscribeRecipes]);
  useEffect(() => {
    void fetchBranchData(branch);
    return subscribeToStock(branch);
  }, [branch, fetchBranchData, subscribeToStock]);
  const defaultItem = branchItems[0];

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState<string>(ALL);
  const [orderNote, setOrderNote] = useState("");

  const [lines, setLines] = useState<LineItem[]>([
    defaultItem
      ? makeLine(branch, defaultItem)
      : { id: `empty-${Date.now()}`, itemId: "", itemName: "", uom: "Kgs", weightGrams: null, qty: "" },
  ]);
  const [customLines, setCustomLines] = useState<
    { id: string; name: string; qty: string }[]
  >([]);

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending success timer when the component unmounts
  useEffect(
    () => () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    },
    [],
  );

  const filteredItems = useMemo(() => {
    return selectedCat === ALL
      ? branchItems
      : branchItems.filter((i) => i.category === selectedCat);
  }, [branchItems, selectedCat]);

  // Grouped optgroups only when All is selected
  const itemsByCategory = useMemo(() => {
    if (selectedCat !== ALL) return null;
    const map: Record<string, typeof branchItems> = {};
    for (const cat of categories) {
      const catItems = branchItems.filter((i) => i.category === cat);
      if (catItems.length > 0) map[cat] = catItems as typeof branchItems;
    }
    return map;
  }, [branchItems, categories, selectedCat]);

  // ── Line manipulation ──────────────────────────────────────────────────────

  const updateItemSelection = (idx: number, itemId: string) => {
    const found = branchItems.find(
      (i) => toItemId(branch, i.barcode) === itemId,
    );
    if (!found) return;
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? makeLine(branch, found) : l)),
    );
  };

  const updateQty = (idx: number, val: string) => {
    if (val === "" || Number(val) >= 0)
      setLines((prev) =>
        prev.map((l, i) => (i === idx ? { ...l, qty: val } : l)),
      );
  };

  const addLine = () => {
    const first = filteredItems[0] ?? defaultItem;
    if (!first) return;
    setLines((prev) => [...prev, makeLine(branch, first)]);
  };

  const removeLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // When category changes, just update the filter — never touch existing lines.
  // The filter only affects the dropdown options for browsing / new additions.
  const handleCatChange = (cat: string) => {
    setSelectedCat(cat);
    const first = cat === ALL ? branchItems[0] : branchItems.find((item) => item.category === cat);
    if (!first) return;
    setLines((prev) =>
      prev.map((line) => (line.qty === "" || Number(line.qty) === 0 ? makeLine(branch, first) : line)),
    );
  };

  // ── Custom lines ───────────────────────────────────────────────────────────

  const addCustomLine = () =>
    setCustomLines((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, name: "", qty: "" },
    ]);
  const removeCustomLine = (idx: number) =>
    setCustomLines((prev) => prev.filter((_, i) => i !== idx));
  const updateCustomName = (idx: number, val: string) =>
    setCustomLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, name: val } : l)),
    );
  const updateCustomQty = (idx: number, val: string) => {
    if (val === "" || Number(val) >= 0)
      setCustomLines((prev) =>
        prev.map((l, i) => (i === idx ? { ...l, qty: val } : l)),
      );
  };

  // ── Validation ─────────────────────────────────────────────────────────────

  const filledLines = lines.filter((l) => l.qty !== "" && Number(l.qty) > 0);
  const valid =
    filledLines.every((l) => l.itemId !== "") &&
    customLines.every(
      (l) => l.name.trim() !== "" && l.qty !== "" && Number(l.qty) > 0,
    ) &&
    (filledLines.length > 0 || customLines.length > 0) &&
    orderNote.trim().length >= 3;

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!currentUser || !valid) return;
    setSubmitting(true);

    const items: BakeryOrderItem[] = [
      ...lines
        .filter((l) => l.itemId !== "" && Number(l.qty) > 0)
        .map((l): BakeryOrderItem => {
          const rawQty = Number(l.qty);
          if (l.uom === "Nos" && l.weightGrams !== null) {
            const kgQty = pcsToKg(l.itemName, rawQty) ?? rawQty;
            return {
              itemId: l.itemId,
              itemName: l.itemName,
              quantity: kgQty,
              originalPcs: rawQty,
              weightGrams: l.weightGrams,
              dispatchUnit: "pcs" as const,
            };
          }
          if (l.uom === "Nos" && l.weightGrams === null) {
            return {
              itemId: l.itemId,
              itemName: l.itemName,
              quantity: rawQty,
              originalPcs: rawQty,
              dispatchUnit: "pcs" as const,
            };
          }
          return {
            itemId: l.itemId,
            itemName: l.itemName,
            quantity: rawQty,
            dispatchUnit: "kg" as const,
          };
        }),
      ...customLines.map(
        (l, idx): BakeryOrderItem => ({
          itemId: `custom-${currentUser.id}-${idx}`,
          itemName: l.name.trim(),
          quantity: Number(l.qty),
          isCustom: true,
          dispatchUnit: "kg" as const,
        }),
      ),
    ];

    const label = `${branch} Branch | ${currentUser.displayName}`;

    setSubmitError(null);
    try {
      await submitOrder(items, label, branch, orderNote.trim());
      setSuccess(true);
      setLines([defaultItem ? makeLine(branch, defaultItem) : lines[0]]);
      setCustomLines([]);
      setSelectedCat(ALL);
      setOrderNote("");
      successTimerRef.current = setTimeout(() => {
        setSuccess(false);
        onSubmitted();
      }, 2000);
    } catch {
      setSubmitError("Failed to submit — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const colors = BRANCH_COLOR[branch];

  const pillBase =
    "px-3 py-1.5 rounded-full text-[11px] font-body font-semibold border transition-all shrink-0";
  const pillActive =
    branch === "VRSNB"
      ? "bg-blue-600 text-white border-blue-600"
      : branch === "SNB"
        ? "bg-amber-500 text-white border-amber-500"
        : "bg-emerald-600 text-white border-emerald-600";
  const pillInactive = "bg-background text-muted-foreground border-border";


  const branchStock = stock[branch] || [];
  const availableForLine = (line: LineItem) => {
    const barcode = Number(line.itemId.split("-").at(-1));
    const row = branchStock.find((item) => item.itemBarcode === barcode)
      ?? branchStock.find((item) => item.itemName.trim().toLowerCase() === line.itemName.trim().toLowerCase());
    return row ? Number(row.availableQuantity ?? Math.max(0, row.quantity - row.reservedQuantity)) : 0;
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Branch banner */}
      <div
        className={cn(
          "mx-3 mt-3 mb-2 shrink-0 rounded-xl border px-3 py-2.5 flex items-center gap-2.5",
          colors.banner,
        )}
      >
        <span className="text-lg">🏪</span>
        <div>
          <p className="text-[10px] font-body font-bold uppercase opacity-60 leading-none mb-0.5">
            Stock Requirement for
          </p>
          <p className="text-sm font-display font-bold leading-none">
            {branch} Branch
          </p>
        </div>
        <span className="ml-auto text-[10px] font-body font-semibold opacity-60">
          {branchItems.length}{" "}
          items
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 pb-2">
        {/* VRSNB pcs info banner */}
        {branch === "VRSNB" && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200">
            <ArrowRight className="size-3.5 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-[11px] font-body text-blue-800 leading-relaxed">
              <span className="font-bold">VRSNB items sold in pcs</span> — enter
              the number of packets. Weight is extracted from the item name and
              automatically converted to kg for the store.
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
          <div className="flex flex-wrap gap-1.5 pb-2 mb-3">
            {[ALL, ...categories].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => handleCatChange(cat)}
                className={cn(
                  pillBase,
                  selectedCat === cat ? pillActive : pillInactive,
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* No results state */}
          {filteredItems.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm font-body font-bold text-muted-foreground">
                No items found in this category.
              </p>
              <button
                onClick={() => setSelectedCat(ALL)}
                className="text-xs font-bold text-primary underline mt-1"
              >
                Show all items
              </button>
            </div>
          )}

          {/* Line rows */}
          <div className="space-y-2">
            {lines.map((line, idx) => {
              const convertedKg =
                line.uom === "Nos" &&
                line.weightGrams !== null &&
                line.qty !== ""
                  ? pcsToKg(line.itemName, Number(line.qty))
                  : null;
              const noWeight = line.uom === "Nos" && line.weightGrams === null;
              const recipeFound =
                line.qty !== ""
                  ? Boolean(recipes && getRecipe(line.itemId, line.itemName))
                  : null;

              return (
                <div key={line.id} className="space-y-1">
                  <div className="flex gap-2 items-center">
                    {/* Item selector */}
                    {(() => {
                      // Always include the currently-selected item as an option even
                      // if the category / search filter hides it — this prevents the
                      // browser from jumping to a different visual selection.
                      const selectedInFilter = filteredItems.some(
                        (i) => toItemId(branch, i.barcode) === line.itemId,
                      );
                      const selectedBranchItem = selectedInFilter
                        ? null
                        : branchItems.find(
                            (i) => toItemId(branch, i.barcode) === line.itemId,
                          );

                      return (
                        <select
                          value={line.itemId}
                          onChange={(e) =>
                            updateItemSelection(idx, e.target.value)
                          }
                          className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          {/* Pinned option for the currently-selected item when it is
                              outside the active filter — keeps the value stable */}
                          {selectedBranchItem && (
                            <optgroup label="Current selection">
                              <option value={line.itemId}>
                                {selectedBranchItem.name}
                                {selectedBranchItem.uom === "Nos"
                                  ? " (pcs)"
                                  : " /kg"}
                              </option>
                            </optgroup>
                          )}

                          {filteredItems.length === 0 ? (
                            <option disabled>No items match</option>
                          ) : itemsByCategory ? (
                            Object.entries(itemsByCategory).map(
                              ([cat, catItems]) => (
                                <optgroup key={cat} label={cat}>
                                  {catItems.map((item) => (
                                    <option
                                      key={item.barcode}
                                      value={toItemId(branch, item.barcode)}
                                    >
                                      {item.name}
                                      {item.uom === "Nos" ? " (pcs)" : " /kg"} · Stock {Number((branchStock.find((row) => row.itemBarcode === item.barcode)?.availableQuantity ?? branchStock.find((row) => row.itemBarcode === item.barcode)?.quantity ?? 0)).toFixed(item.uom === "Nos" ? 0 : 2)}
                                    </option>
                                  ))}
                                </optgroup>
                              ),
                            )
                          ) : (
                            filteredItems.map((item) => (
                              <option
                                key={item.barcode}
                                value={toItemId(branch, item.barcode)}
                              >
                                {item.name}
                                {item.uom === "Nos" ? " (pcs)" : " /kg"} · Stock {Number((branchStock.find((row) => row.itemBarcode === item.barcode)?.availableQuantity ?? branchStock.find((row) => row.itemBarcode === item.barcode)?.quantity ?? 0)).toFixed(item.uom === "Nos" ? 0 : 2)}
                              </option>
                            ))
                          )}
                        </select>
                      );
                    })()}

                    {/* Quantity */}
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) => updateQty(idx, e.target.value)}
                        placeholder="Qty"
                        className={cn(
                          "w-16 h-10 px-2 rounded-xl border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30",
                          line.qty === "" || Number(line.qty) === 0
                            ? "border-amber-400"
                            : "border-border",
                        )}
                      />
                      <span className="text-[9px] font-body font-bold text-muted-foreground leading-none">
                        {line.uom === "Nos" ? "pcs" : "kg"}
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
                  <div className="flex flex-wrap items-center gap-1.5 ml-0.5">
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold", availableForLine(line) > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}>Live stock: {availableForLine(line).toFixed(line.uom === "Nos" ? 0 : 2)} {line.uom === "Nos" ? "pcs" : "kg"}</span>
                      {line.qty !== "" && (
                        <>
                      {line.uom === "Nos" && convertedKg !== null && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-body font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          <Scale className="size-2.5" />
                          {Number(line.qty)} pcs →{" "}
                          <strong>{convertedKg} kg</strong>
                        </span>
                      )}
                      {noWeight && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-body font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          ⚠ No weight found — submitting as {line.qty} pcs
                        </span>
                      )}
                      {recipeFound !== null && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-body font-semibold px-2 py-0.5 rounded-full border",
                            recipeFound
                              ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                              : "text-muted-foreground bg-muted border-border",
                          )}
                        >
                          {recipeFound
                            ? "✓ Recipe found"
                            : "– No recipe · will be custom"}
                        </span>
                      )}
                        </>
                      )}
                    </div>
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
              <span className="ml-1 normal-case text-amber-600 font-normal">
                not in the {branch} list
              </span>
            </p>
          </div>

          {customLines.length === 0 && (
            <p className="text-[11px] font-body text-muted-foreground mb-2">
              Need something not in the price list? Add it here.
            </p>
          )}

          <div className="space-y-2">
            {customLines.map((line, idx) => (
              <div key={line.id} className="flex gap-2 items-center">
                <input
                  value={line.name}
                  onChange={(e) => updateCustomName(idx, e.target.value)}
                  placeholder="Item name (e.g. Rose Milk Cake)"
                  className={cn(
                    "flex-1 h-10 px-3 rounded-xl border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/40",
                    line.name.trim() === ""
                      ? "border-amber-400"
                      : "border-amber-300",
                  )}
                />
                <input
                  type="number"
                  min={1}
                  value={line.qty}
                  onChange={(e) => updateCustomQty(idx, e.target.value)}
                  placeholder="Qty"
                  className={cn(
                    "w-16 h-10 px-2 rounded-xl border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-amber-400/40",
                    line.qty === "" ? "border-amber-400" : "border-amber-300",
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

      <div className="shrink-0 border-t border-border bg-card px-3 py-2">
        <label className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Complete Order Note <span className="text-red-500">*</span></label>
        <textarea value={orderNote} onChange={(event) => setOrderNote(event.target.value)} rows={2} maxLength={500} placeholder="Mention packing, delivery, item specification or any instruction for this complete order." className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/30" />
        <p className="mt-1 text-[10px] font-bold text-muted-foreground">This note is shared with Store, Packing and the live order-status view.</p>
      </div>

      {/* Submit */}
      <div className="shrink-0 border-t border-border px-3 py-2">
        {submitError && (
          <p className="text-xs font-body text-destructive text-center mb-2">
            {submitError}
          </p>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || success || !valid}
          className={cn(
            "w-full h-11 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50",
            success
              ? "bg-emerald-500 text-white"
              : "cafe-gradient text-primary-foreground",
          )}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : success ? (
            <>
              <CheckCircle2 className="size-4" /> Sent to Store!
            </>
          ) : (
            <>
              <Send className="size-4" /> Send Requirement to Store
            </>
          )}
        </button>
      </div>
    </div>
  );
}
