// src/bakery/recipeNameMatch.ts
// Shared "does this item's spelling match Recipe Management?" check, used by
// every screen where an item name gets typed independently of Recipe
// Management (SNB/VRSNB item master, Hosur shop price lists). Recipe
// Management's recipe lookup already tolerates spacing/case/plural
// differences at runtime (see itemMatcher.ts), but a genuine typo (e.g.
// "Badam Halwa" vs "Badam Halva") silently breaks that lookup — stock never
// gets deducted for that item. This surfaces those mismatches in the UI
// instead of leaving them invisible.
import { canonicalItemSlug } from './itemMatcher';

/** Classic edit distance — small, dependency-free, fine for item-name-length strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

export interface RecipeNameMatchResult {
  /** The Recipe Management item name this most closely matches. */
  match: string;
  /** True if it matches exactly once case/spacing/plural differences are ignored — no action needed. */
  exact: boolean;
  distance: number;
}

/**
 * Compare `name` against every Recipe Management item name and report the
 * closest one. Returns null when nothing is close enough to be a plausible
 * typo of the same item (i.e. this is probably a genuinely different item
 * that just doesn't have a recipe yet — not worth warning about).
 */
export function closestRecipeMatch(name: string, recipeItemNames: string[]): RecipeNameMatchResult | null {
  const clean = name.trim();
  if (!clean || recipeItemNames.length === 0) return null;
  const slug = canonicalItemSlug(clean);

  // 1. Exact once normalized (case, spacing, punctuation, plurals, packet-size
  //    suffixes) — this is what itemMatcher.ts already resolves at runtime,
  //    so nothing is actually broken; no warning needed.
  const exactMatch = recipeItemNames.find((r) => canonicalItemSlug(r) === slug);
  if (exactMatch) return { match: exactMatch, exact: true, distance: 0 };

  // 2. Otherwise find the closest by edit distance on the lowercase name,
  //    and only surface it if it's close enough to plausibly be the same
  //    item misspelled (not just two short unrelated names).
  let best: { match: string; distance: number } | null = null;
  const lower = clean.toLowerCase();
  for (const r of recipeItemNames) {
    const d = levenshtein(lower, r.trim().toLowerCase());
    if (!best || d < best.distance) best = { match: r, distance: d };
  }
  if (!best || best.distance === 0) return null;
  const threshold = Math.max(2, Math.round(lower.length * 0.3));
  if (best.distance > threshold) return null;
  return { match: best.match, exact: false, distance: best.distance };
}
