// src/bakery/materialCalc.ts
// Shared raw-material calculation for a bakery order line item — moved out
// of StoreDashboard.tsx (2026-08-06) so the exact same calculation can be
// reused by bakeryStore.ts's mergeOrdersForStore(), which now auto-confirms
// stock (skips the manual "Confirm Stock" button in StoreDashboard.tsx that
// used to be the ONLY place this ran). Keeping one implementation avoids the
// two call sites silently drifting apart on how materials are computed.
import type { BakeryOrder } from './types';
import { useRecipeStore } from './recipeStore';
import { pcsToKg, resolveItemWeightGrams } from './itemMatcher';

export function matForItem(item: BakeryOrder['items'][number]) {
  const recipeStore = useRecipeStore.getState();
  const recipe = recipeStore.getRecipe(item.itemId, item.itemName);
  const weightGrams = item.weightGrams ?? resolveItemWeightGrams(item.itemId, item.itemName);
  const recipeUsesWeight = recipe?.outputUnit === 'kg' && weightGrams != null;
  const quantity = item.dispatchUnit === 'pcs'
    ? recipeUsesWeight
      ? item.weightGrams != null
        ? item.quantity
        : (pcsToKg(item.itemName, item.quantity, weightGrams) ?? item.quantity)
      : (item.originalPcs ?? item.quantity)
    : item.quantity;
  const unit = item.dispatchUnit === 'pcs' && !recipeUsesWeight ? 'pcs' : 'kg';
  const materials = recipeStore.calculateMaterials(item.itemId, item.itemName, quantity, unit);

  return materials.map((material, index) => {
    if (!/^eggs?$/i.test(material.material.trim())) return material;

    const recipeMaterial = recipe?.materials[index];
    const embeddedCount = recipeMaterial?.unit.match(/(\d+(?:\.\d+)?)\s*eggs?/i);
    const countUnit = /^(nos?|pcs?|pieces?|eggs?)$/i.test(material.unit.trim()) || Boolean(embeddedCount);
    if (!countUnit) return material;

    const scaledCount = embeddedCount && recipeMaterial?.qty
      ? Number(embeddedCount[1]) * (material.quantity / recipeMaterial.qty)
      : material.quantity;
    const base = Math.floor(scaledCount);
    const wholeEggs = scaledCount > 0
      ? Math.max(1, base + (scaledCount - base > 0.4 ? 1 : 0))
      : 0;

    return { ...material, quantity: wholeEggs, unit: 'nos' };
  });
}

// Combines materials across several order line items into one deduction
// list — same reduction StoreDashboard.tsx's OrderCard did locally with
// `allMats`, now reusable for a whole merged order in one call.
export function combinedMaterialsForItems(items: BakeryOrder['items']): { material: string; quantity: number; unit: string }[] {
  const combined: { material: string; quantity: number; unit: string }[] = [];
  for (const item of items) {
    for (const m of matForItem(item)) {
      if(!Number.isFinite(m.quantity)||m.quantity<0)throw Error(`Invalid recipe quantity for ${m.material}. Review the recipe before production.`);
      if(m.quantity===0)continue;
      const unit=m.unit.trim().toLowerCase();
      const canonical={...m,material:m.material.trim(),unit:unit==='g'?'kg':unit==='ml'||unit==='l'?'ltr':unit==='nos'?'pcs':unit,
        quantity:unit==='g'||unit==='ml'?m.quantity/1000:m.quantity};
      const existing = combined.find(x => x.material.toLowerCase() === canonical.material.toLowerCase());
      if(existing&&existing.unit!==canonical.unit)throw Error(`Recipe units disagree for ${canonical.material}. Review the recipes before production.`);
      if (existing) existing.quantity = parseFloat((existing.quantity + canonical.quantity).toFixed(6));
      else combined.push(canonical);
    }
  }
  return combined;
}
