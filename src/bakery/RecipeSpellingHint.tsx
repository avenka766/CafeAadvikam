// src/bakery/RecipeSpellingHint.tsx
// Small inline warning shown next to an item-name field in SNB/VRSNB item
// master and Hosur shop price lists: if the typed name is close to — but
// doesn't exactly match — a Recipe Management item name, it nudges the user
// to align the spelling so recipe-based stock deduction actually finds it.
import { AlertTriangle } from 'lucide-react';
import { closestRecipeMatch } from './recipeNameMatch';

export default function RecipeSpellingHint({
  itemName, recipeItemNames, onApply,
}: {
  itemName: string;
  recipeItemNames: string[];
  onApply?: (name: string) => void;
}) {
  const result = closestRecipeMatch(itemName, recipeItemNames);
  if (!result || result.exact) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-amber-700">
      <AlertTriangle className="size-3 shrink-0" />
      Spelling doesn't match Recipe Management — did you mean{' '}
      {onApply ? (
        <button type="button" onClick={() => onApply(result.match)} className="underline decoration-dotted underline-offset-2 hover:text-amber-900">
          "{result.match}"
        </button>
      ) : (
        <span className="italic">"{result.match}"</span>
      )}
      ?
    </p>
  );
}
