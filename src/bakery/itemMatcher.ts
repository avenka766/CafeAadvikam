// src/bakery/itemMatcher.ts
// Utilities for:
//   1. Parsing per-unit weights from VRSNB item names   e.g. "Banana chips (200g)" → 200g
//   2. Converting receiver-entered pcs quantities → kg   e.g. 5 pcs × 200g = 1.000 kg
//   3. Matching VRSNB / SNB item names to RECIPE_DEFINITIONS keys
//      e.g. "Banana chips (200g)" → slug "banana-chips" → found in RECIPE_DEFINITIONS

import { RECIPE_DEFINITIONS } from './recipeDefinitions';
import { BAKERY_ITEMS } from './types';
import { VRSNB_ITEMS } from '@/branch/vrsnbItems';

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
  // BUG #12 FIX: match weight with OR without parentheses.
  // Handles: (200g) (200 g) (200gm) (200 gms) (1kg) (0.5 kg) (250ml) AND "200g" bare.
  // \s* between value and unit handles optional space e.g. "200 g" vs "200g".
  const match =
    name.match(/\(\s*(\d+(?:\.\d+)?)\s*(g|gm|gms|kg|ml|l)\s*\)/i) ??
    name.match(/\b(\d+(?:\.\d+)?)\s*(g|gm|gms|kg|ml|l)\b/i);
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
export function pcsToKg(itemName: string, pcs: number, knownWeightGrams?: number | null): number | null {
  const grams = knownWeightGrams ?? parseWeightGrams(itemName);
  if (grams === null || pcs <= 0) return null;
  return Math.round((pcs * grams / 1000) * 1000) / 1000;
}

/**
 * Resolve package weight when it is not printed in the catalogue item name.
 * VRSNB cookies are ordered as 200 g packets, while their production recipes
 * are defined in kilograms.
 */
export function resolveItemWeightGrams(itemId: string, itemName: string): number | null {
  const parsed = parseWeightGrams(itemName);
  if (parsed !== null) return parsed;

  const vrsnbBarcode = itemId.toLowerCase().match(/^vrsnb-(\d+)$/)?.[1];
  const barcode = vrsnbBarcode ? Number(vrsnbBarcode) : 0;
  if (barcode >= 2090 && barcode <= 2108) return 200;
  if (vrsnbBarcode && VRSNB_ITEMS.some(item =>
    item.barcode === barcode && item.category === 'COOKIES'
  )) return 200;
  // BUG FIX (audit 2026-08-07): this was gated behind `vrsnbBarcode &&`, but
  // BAKERY_ITEMS is a NAME-keyed catalogue with no relation to VRSNB barcode
  // ids — the guard made this branch unreachable for anything whose itemId
  // doesn't already match `vrsnb-<digits>` (which the two checks above
  // already handle), including manually-entered pcs items from Incoming
  // Orders (itemId like `manual-<timestamp>`). Match purely by name so any
  // pcs item recognised as a Cookies-category catalogue item resolves its
  // 200g packet weight regardless of how it was entered.
  if (BAKERY_ITEMS.some(item =>
    item.category === 'Cookies' && itemNamesMatch(item.name, itemName)
  )) return 200;

  return null;
}

/**
 * Convert a kg quantity back to pcs using the per-unit weight in grams.
 *
 * Used in Packing: baker sends prepared qty in kg; once the packer
 * confirms receipt, the kg is converted to pcs for dispatch.
 *
 * @param kg          weight in kg received from baker
 * @param weightGrams per-unit weight in grams (stored on BakeryOrderItem)
 * @returns           whole-number pcs count (floor), or null if inputs invalid
 */
export function kgToPcs(kg: number, weightGrams: number): number | null {
  if (kg <= 0 || weightGrams <= 0) return null;
  return Math.floor((kg * 1000) / weightGrams);
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

function canonicalToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/**
 * Shared comparison form for order, catalogue and recipe names.
 * Packet sizes, punctuation and harmless singular/plural differences do not
 * change the identity of an item.
 */
export function canonicalItemSlug(name: string): string {
  return nameToSlug(name)
    .split('-')
    .filter(Boolean)
    .map(canonicalToken)
    .join('-');
}

// Same weight-pattern-only parenthetical stripping computeMergedSummaryDisplay
// already uses — see its comment for the reasoning. Exported here so it's the
// one place any *pooled quantity* (not just display) matching lives, instead
// of being duplicated.
const WEIGHT_PAREN = /\(\s*\d+(?:\.\d+)?\s*(?:g|gm|gms|kg|ml|l)\s*\)/gi;

/**
 * BUG FIX (2026-08-07): the Closing Stock leftover pool used
 * canonicalItemSlug() for matching a dispatched/produced item to its pooled
 * balance — but canonicalItemSlug() strips ANY parenthetical content
 * (nameToSlug's `\([^)]*\)`), not just weight/pack-size qualifiers. That's
 * correct for recipe-key matching (a recipe generally doesn't care about
 * pack size), but it's wrong for the leftover pool: "Egg Puff (Full Egg)",
 * "Egg Puff (Half)", and plain "Egg Puff" are three different physical
 * items (different recipes, different prices) that all collapsed to the
 * same "egg-puff" slug and were silently sharing ONE Closing Stock balance
 * — dispatching one drew down stock that was actually meant to represent a
 * different item, corrupting the balance shown for both. Only a genuine
 * weight/size qualifier like "(200g)" should be ignored; anything else in
 * parentheses is part of the item's real identity and must stay in the key.
 */
export function closingStockItemSlug(name: string): string {
  const withoutWeight = name.replace(WEIGHT_PAREN, '');
  return withoutWeight
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .map(canonicalToken)
    .join('-');
}

export function itemNamesMatch(left: string, right: string): boolean {
  const leftSlug = canonicalItemSlug(left);
  return Boolean(leftSlug) && leftSlug === canonicalItemSlug(right);
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
  const canonicalSlug = canonicalItemSlug(itemName);

  const canonicalMatch = keys.find(key => canonicalItemSlug(key) === canonicalSlug);
  if (canonicalMatch) return canonicalMatch;

  // 2. Recipe key is a prefix of slug  (e.g. "banana-chips" is a prefix of "banana-chips-200g")
  // BUG FIX (audit 2026-09-02): this used to take the FIRST prefix match in
  // Object.keys() iteration order, not the best one — RECIPE_DEFINITIONS has real
  // keys that are prefixes of each other (e.g. "jangiri" / "jangiri-muruk",
  // "kambu-muruk" / "kambu-millet-muruk" / "kambu-onion-muruk"), so whichever
  // shorter/unrelated key happened to be declared earlier could silently win over
  // the correct, more specific recipe once this fallback was reached. Pick the
  // LONGEST matching key instead, since a longer prefix match is always more specific.
  const prefixMatches = keys.filter(k => slug.startsWith(k) || k.startsWith(slug));
  if (prefixMatches.length > 0) {
    return prefixMatches.reduce((best, key) => key.length > best.length ? key : best);
  }

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
