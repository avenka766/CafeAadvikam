// src/bakery/itemMatcher.ts
// Utilities for:
//   1. Parsing per-unit weights from VRSNB item names   e.g. "Banana chips (200g)" → 200g
//   2. Converting receiver-entered pcs quantities → kg   e.g. 5 pcs × 200g = 1.000 kg
//   3. Matching VRSNB / SNB item names to RECIPE_DEFINITIONS keys
//      e.g. "Banana chips (200g)" → slug "banana-chips" → found in RECIPE_DEFINITIONS

import { RECIPE_DEFINITIONS } from './recipeDefinitions';

// ── Weight parsing ─────────────────────────────────────────────────────────────

/**
 * Extract the per-unit weight in grams from an item name.
 *
 * Handles:   (200g)  (200gm)  (200gms)  (150G)  (1kg)  (0.5kg)  (250ml)  (1l)
 * ml / l are treated as gram-equivalents (useful for liquid items).
 *
 * Returns grams as a number, or null if no weight suffix is found.
 */
export function parseWeightGrams(name: string): number | null {
  const match = name.match(/\(\s*(\d+(?:\.\d+)?)\s*(g|gm|gms|kg|ml|l)\s*\)/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit  = match[2].toLowerCase();
  if (unit === 'kg') return value * 1000;
  if (unit === 'l')  return value * 1000;
  return value; // g, gm, gms, ml
}

/**
 * Convert a pcs quantity to kg using the weight embedded in the item name.
 *
 * @param itemName  e.g. "Banana chips (200g)"
 * @param pcs       number of pieces the receiver entered
 * @returns         kg value rounded to 3 decimal places, or null if weight unparseable
 */
export function pcsToKg(itemName: string, pcs: number): number | null {
  const grams = parseWeightGrams(itemName);
  if (grams === null || pcs <= 0) return null;
  return Math.round((pcs * grams / 1000) * 1000) / 1000;
}

// ── Recipe key matching ────────────────────────────────────────────────────────

/**
 * Normalise an item name to the slug format used by RECIPE_DEFINITIONS.
 *
 * "Banana chips (200g)"    → "banana-chips"
 * "Beetroot muruk (200g)"  → "beetroot-muruk"
 * "Spl Mysore Pak"         → "spl-mysore-pak"
 */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')    // remove parenthetical weight / size
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumeric runs → single dash
    .replace(/^-+|-+$/g, '');    // trim leading / trailing dashes
}

/**
 * Find the RECIPE_DEFINITIONS key that best matches an item name.
 *
 * Strategy (in order):
 *   1. Exact slug match              "banana-chips" → RECIPE_DEFINITIONS["banana-chips"]
 *   2. Recipe key starts with slug   handles minor suffix differences
 *   3. Slug starts with recipe key   handles verbose names
 *
 * Returns the matched recipe key, or null if nothing matches.
 */
export function findRecipeId(itemName: string): string | null {
  const slug = nameToSlug(itemName);
  if (!slug) return null;

  // 1. Exact
  if (RECIPE_DEFINITIONS[slug]) return slug;

  const keys = Object.keys(RECIPE_DEFINITIONS);

  // 2. Recipe key is a prefix of slug  (e.g. "banana-chips" is a prefix of "banana-chips-200g")
  const prefixMatch = keys.find(k => slug.startsWith(k) || k.startsWith(slug));
  if (prefixMatch) return prefixMatch;

  return null;
}

/**
 * Resolve the RECIPE_DEFINITIONS key for a bakery order item.
 * Tries the stored itemId first (works for legacy bakery_items), then falls back
 * to a name-based slug match (works for VRSNB / SNB items with barcode-derived IDs).
 */
export function resolveRecipeKey(itemId: string, itemName: string): string | null {
  if (RECIPE_DEFINITIONS[itemId]) return itemId;
  return findRecipeId(itemName);
}
