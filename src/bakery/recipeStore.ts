import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { makeSingletonSubscriber } from '@/lib/realtimeChannel';
import { RECIPE_DEFINITIONS, type RecipeDefinition } from './recipeDefinitions';
import { canonicalItemSlug, nameToSlug } from './itemMatcher';

export interface LiveRecipe extends RecipeDefinition {
  itemId: string;
  itemName?: string;
  source: 'database' | 'seed';
  updatedAt?: string;
  updatedBy?: string;
}

function seedRecipes(): Record<string, LiveRecipe> {
  return Object.fromEntries(Object.entries(RECIPE_DEFINITIONS).map(([itemId, recipe]) => [
    itemId,
    {
      itemId,
      outputQty: recipe.outputQty,
      outputUnit: recipe.outputUnit,
      materials: recipe.materials.map((material) => ({ ...material })),
      source: 'seed' as const,
    },
  ]));
}

function mapRow(row: Record<string, unknown>): LiveRecipe {
  return {
    itemId: String(row.item_id),
    itemName: row.item_name ? String(row.item_name) : undefined,
    outputQty: row.output_qty == null ? null : Number(row.output_qty),
    outputUnit: (row.output_unit ?? null) as RecipeDefinition['outputUnit'],
    materials: Array.isArray(row.materials)
      ? (row.materials as Array<Record<string, unknown>>).map((material) => ({
          material: String(material.material ?? ''),
          qty: Number(material.qty ?? 0),
          unit: String(material.unit ?? 'kg'),
        }))
      : [],
    source: 'database',
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
    updatedBy: row.updated_by ? String(row.updated_by) : undefined,
  };
}

function resolveRecipeKey(recipes: Record<string, LiveRecipe>, itemId: string, itemName?: string) {
  if (recipes[itemId]) return itemId;
  if (!itemName) return null;
  const slug = nameToSlug(itemName);
  if (recipes[slug]) return slug;
  const entries = Object.entries(recipes);
  const canonicalSlug = canonicalItemSlug(itemName);
  const byStoredName = entries.find(([key, recipe]) =>
    canonicalItemSlug(recipe.itemName || key) === canonicalSlug
  );
  if (byStoredName) return byStoredName[0];
  const prefix = entries.find(([key]) => {
    const canonicalKey = canonicalItemSlug(key);
    return canonicalSlug.startsWith(canonicalKey) || canonicalKey.startsWith(canonicalSlug);
  });
  return prefix?.[0] ?? null;
}

interface RecipeState {
  recipes: Record<string, LiveRecipe>;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadRecipes: (force?: boolean) => Promise<void>;
  saveRecipe: (
    itemId: string,
    itemName: string,
    recipe: Pick<LiveRecipe, 'outputQty' | 'outputUnit' | 'materials'>,
    updatedBy: string,
  ) => Promise<string | null>;
  subscribe: () => () => void;
  getRecipe: (itemId: string, itemName?: string) => LiveRecipe | null;
  calculateMaterials: (
    itemId: string,
    itemName: string,
    quantity: number,
    unit: 'kg' | 'pcs' | 'loaf',
  ) => { material: string; quantity: number; unit: string }[];
  getAllMaterials: () => { name: string; unit: string }[];
}

export const useRecipeStore = create<RecipeState>((set, get) => ({
  recipes: seedRecipes(),
  loaded: false,
  loading: false,
  error: null,

  loadRecipes: async (force = false) => {
    if (!force && (get().loaded || get().loading)) return;
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase.from('bakery_recipes').select('item_id, item_name, output_qty, output_unit, materials, updated_at, updated_by');
      if (error) throw error;
      const merged = seedRecipes();
      (data ?? []).forEach((row) => {
        const recipe = mapRow(row as Record<string, unknown>);
        merged[recipe.itemId] = recipe;
      });
      set({ recipes: merged, loaded: true });
    } catch (error) {
      set({
        recipes: get().recipes,
        loaded: true,
        error: error instanceof Error ? error.message : 'Failed to load recipes.',
      });
    } finally {
      set({ loading: false });
    }
  },

  saveRecipe: async (itemId, itemName, recipe, updatedBy) => {
    const payload = {
      item_id: itemId,
      item_name: itemName,
      output_qty: recipe.outputQty,
      output_unit: recipe.outputUnit,
      materials: recipe.materials,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };
    let result = await supabase.from('bakery_recipes').upsert(payload, { onConflict: 'item_id' }).select('item_id, item_name, output_qty, output_unit, materials, updated_at, updated_by').single();
    if (result.error && /updated_by|updated_at|column/i.test(result.error.message)) {
      const legacyPayload = { ...payload } as Record<string, unknown>;
      delete legacyPayload.updated_by;
      delete legacyPayload.updated_at;
      result = await supabase.from('bakery_recipes').upsert(legacyPayload, { onConflict: 'item_id' }).select('item_id, item_name, output_qty, output_unit, materials, updated_at, updated_by').single();
    }
    if (result.error || !result.data) return result.error?.message ?? 'Failed to save recipe.';
    const saved = mapRow(result.data as Record<string, unknown>);
    set((state) => ({ recipes: { ...state.recipes, [itemId]: saved } }));
    return null;
  },

  subscribe: makeSingletonSubscriber('bakery-recipes-live', (ch) =>
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'bakery_recipes' },
      () => { void get().loadRecipes(true); }),
  ),

  getRecipe: (itemId, itemName) => {
    const key = resolveRecipeKey(get().recipes, itemId, itemName);
    return key ? get().recipes[key] ?? null : null;
  },

  calculateMaterials: (itemId, itemName, quantity, unit) => {
    const recipeKey = resolveRecipeKey(get().recipes, itemId, itemName);
    const recipe = recipeKey ? get().recipes[recipeKey] ?? null : null;
    if (!recipe || !recipe.outputQty || quantity <= 0) return [];
    const seedOutputUnit = recipeKey ? RECIPE_DEFINITIONS[recipeKey]?.outputUnit : undefined;
    const pieceCompatible = unit === 'pcs' && (recipe.outputUnit === 'loaf' || seedOutputUnit === null);
    if (recipe.outputUnit && recipe.outputUnit !== unit && !pieceCompatible) return [];
    const scaleFactor = quantity / recipe.outputQty;
    return recipe.materials.map((material) => ({
      material: material.material,
      quantity: Number((material.qty * scaleFactor).toFixed(6)),
      unit: material.unit,
    }));
  },

  getAllMaterials: () => {
    const seen = new Map<string, { name: string; unit: string }>();
    Object.values(get().recipes).forEach((recipe) => {
      recipe.materials.forEach((material) => {
        const name = material.material.trim();
        const key = name.toLowerCase();
        if (name && !seen.has(key)) seen.set(key, { name, unit: material.unit });
      });
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  },
}));
