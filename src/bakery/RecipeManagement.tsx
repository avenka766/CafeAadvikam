// src/bakery/RecipeManagement.tsx — NEW FILE
// Admin screen: view, edit, and add recipe data per item
// Pulls live from supabase bakery_recipes table; falls back to RECIPE_DEFINITIONS
import { useState, useEffect, useMemo } from 'react';
import {
  ChefHat, Plus, Trash2, Pencil, Check, X, Loader2,
  Search, ChevronDown, ChevronUp, Scale, Hash, Package, Info, BookOpen,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BAKERY_ITEMS } from './types';
import { RECIPE_DEFINITIONS } from './recipeDefinitions';
import type { RecipeDefinition } from './recipeDefinitions';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Material { material: string; qty: number; unit: string }
interface RecipeRow {
  itemId: string;
  outputQty: number | null;
  outputUnit: 'kg' | 'pcs' | 'loaf' | null;
  materials: Material[];
  source: 'db' | 'excel' | 'none';
}

const OUTPUT_UNITS = ['kg', 'pcs', 'loaf'] as const;
const UNIT_ICONS: Record<string, React.ReactNode> = {
  kg:   <Scale   className="size-3.5" />,
  pcs:  <Hash    className="size-3.5" />,
  loaf: <Package className="size-3.5" />,
};
const CATEGORIES = ['Sweets', 'Savouries', 'Bakery', 'Cookies'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function blankRecipe(): Omit<RecipeRow,'itemId'|'source'> {
  return { outputQty: null, outputUnit: 'kg', materials: [{ material: '', qty: 0, unit: 'kg' }] };
}

// ── Material editor row ───────────────────────────────────────────────────────
function MatRow({
  mat, idx, onChange, onRemove, isLast,
}: {
  mat: Material; idx: number;
  onChange: (idx: number, field: keyof Material, val: string | number) => void;
  onRemove: (idx: number) => void;
  isLast: boolean;
}) {
  return (
    <div className="flex gap-1.5 items-center">
      <input
        placeholder="Material name"
        value={mat.material}
        onChange={e => onChange(idx, 'material', e.target.value)}
        className="flex-1 h-8 px-2 text-xs font-body rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
      <input
        type="number" min={0} step={0.001}
        placeholder="Qty"
        value={mat.qty || ''}
        onChange={e => onChange(idx, 'qty', parseFloat(e.target.value) || 0)}
        className="w-20 h-8 px-2 text-xs font-body rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 tabular-nums"
      />
      <select
        value={mat.unit}
        onChange={e => onChange(idx, 'unit', e.target.value)}
        className="w-16 h-8 px-1 text-xs font-body rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
      >
        {['kg','g','L','ml','nos','pcs'].map(u => <option key={u} value={u}>{u}</option>)}
      </select>
      <button onClick={() => onRemove(idx)} disabled={isLast}
        className="size-8 flex items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-20 transition-colors">
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

// ── Recipe edit panel ─────────────────────────────────────────────────────────
function RecipeEditor({
  itemId, itemName, itemIcon, initial, onSave, onCancel, saving,
}: {
  itemId: string; itemName: string; itemIcon: string;
  initial: Omit<RecipeRow,'itemId'|'source'>;
  onSave:  (data: Omit<RecipeRow,'itemId'|'source'>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [outputQty,   setOutputQty]   = useState<string>(initial.outputQty ? String(initial.outputQty) : '');
  const [outputUnit,  setOutputUnit]  = useState<'kg'|'pcs'|'loaf'>(initial.outputUnit ?? 'kg');
  const [materials,   setMaterials]   = useState<Material[]>(
    initial.materials.length > 0 ? [...initial.materials] : [{ material: '', qty: 0, unit: 'kg' }]
  );
  const [error, setError] = useState('');

  const changeMat = (idx: number, field: keyof Material, val: string | number) => {
    setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, [field]: val } : m));
  };
  const addMat    = () => setMaterials(prev => [...prev, { material: '', qty: 0, unit: 'kg' }]);
  const removeMat = (idx: number) => setMaterials(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const validMats = materials.filter(m => m.material.trim());
    if (validMats.length === 0) { setError('Add at least one material'); return; }
    setError('');
    await onSave({
      outputQty: outputQty ? parseFloat(outputQty) : null,
      outputUnit,
      materials: validMats,
    });
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span className="text-lg">{itemIcon}</span>
        <div>
          <p className="text-sm font-body font-bold text-foreground">{itemName}</p>
          <p className="text-[10px] font-body text-muted-foreground">{itemId}</p>
        </div>
      </div>

      {/* Output */}
      <div>
        <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Batch Output</p>
        <div className="flex gap-2">
          <input
            type="number" min={0} step={0.01} placeholder="e.g. 8.5"
            value={outputQty}
            onChange={e => setOutputQty(e.target.value)}
            className="flex-1 h-9 px-3 text-sm font-body rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex rounded-xl border border-border overflow-hidden">
            {OUTPUT_UNITS.map(u => (
              <button key={u}
                onClick={() => setOutputUnit(u)}
                className={cn('flex items-center gap-1 px-3 h-9 text-xs font-body font-semibold transition-colors',
                  outputUnit === u ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}>
                {UNIT_ICONS[u]} {u}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10px] font-body text-muted-foreground mt-1">
          How much this full batch produces (e.g. 8.5 kg, 38 pcs, 12 loaves)
        </p>
      </div>

      {/* Materials */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase">Ingredients</p>
          <button onClick={addMat}
            className="flex items-center gap-1 text-[10px] font-body font-bold text-primary hover:underline">
            <Plus className="size-3" /> Add row
          </button>
        </div>
        <div className="space-y-1.5">
          {materials.map((mat, idx) => (
            <MatRow key={idx} mat={mat} idx={idx} onChange={changeMat} onRemove={removeMat} isLast={materials.length === 1} />
          ))}
        </div>
      </div>

      {error && <p className="text-xs font-body text-destructive">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 h-10 rounded-xl border border-border text-sm font-body font-semibold text-foreground hover:bg-muted transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 h-10 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save Recipe
        </button>
      </div>
    </div>
  );
}

// ── Item row in list ──────────────────────────────────────────────────────────
function ItemRecipeRow({
  item, recipe, onEdit,
}: {
  item: { id: string; name: string; icon: string };
  recipe: RecipeRow | null;
  onEdit: (itemId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasRecipe = recipe && recipe.materials.length > 0;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors">
        <span className="text-base w-6 text-center shrink-0">{item.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-body font-semibold text-foreground truncate">{item.name}</p>
          {hasRecipe ? (
            <p className="text-[10px] font-body text-emerald-600">
              ✓ {recipe.materials.length} ingredients · {recipe.outputQty} {recipe.outputUnit}
              <span className="ml-1 text-muted-foreground">({recipe.source === 'db' ? 'custom' : 'from Excel'})</span>
            </p>
          ) : (
            <p className="text-[10px] font-body text-amber-600">⚠ No recipe data</p>
          )}
        </div>
        <button onClick={e => { e.stopPropagation(); onEdit(item.id); }}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-[10px] font-body font-bold hover:bg-primary/20 transition-colors shrink-0">
          <Pencil className="size-3" /> {hasRecipe ? 'Edit' : 'Add'}
        </button>
        {expanded ? <ChevronUp className="size-3.5 text-muted-foreground shrink-0 ml-1" /> : <ChevronDown className="size-3.5 text-muted-foreground shrink-0 ml-1" />}
      </button>

      {expanded && hasRecipe && (
        <div className="border-t border-border bg-muted/20 divide-y divide-border/30">
          {recipe.materials.map((mat, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-1.5">
              <span className="text-xs font-body text-foreground">{mat.material}</span>
              <span className="text-xs font-body font-bold tabular-nums text-muted-foreground">{mat.qty} {mat.unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function RecipeManagement() {
  const [search, setSearch]   = useState('');
  const [catFilter, setCatFilter] = useState<string>('All');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dbRecipes, setDbRecipes] = useState<Record<string, RecipeRow>>({});
  const [loading, setLoading]     = useState(true);
  const [saving,  setSaving]      = useState(false);
  const [toast,   setToast]       = useState('');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddItemId, setQuickAddItemId] = useState('');

  // Load DB overrides
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.from('bakery_recipes').select('*');
        if (data) {
          const map: Record<string, RecipeRow> = {};
          for (const row of data) {
            map[row.item_id] = {
              itemId:     row.item_id,
              outputQty:  row.output_qty,
              outputUnit: row.output_unit,
              materials:  row.materials ?? [],
              source:     'db',
            };
          }
          setDbRecipes(map);
        }
      } catch { /* table may not exist yet — graceful fallback */ }
      setLoading(false);
    })();
  }, []);

  // Merge: DB overrides > Excel defaults
  const getRecipe = (itemId: string): RecipeRow | null => {
    if (dbRecipes[itemId]) return dbRecipes[itemId];
    const def = RECIPE_DEFINITIONS[itemId];
    if (!def) return null;
    return {
      itemId,
      outputQty:  def.outputQty,
      outputUnit: def.outputUnit as 'kg'|'pcs'|'loaf'|null,
      materials:  def.materials.map(m => ({ material: m.material, qty: m.qty, unit: m.unit })),
      source:     'excel',
    };
  };

  const filteredItems = useMemo(() => {
    return BAKERY_ITEMS.filter(item => {
      const matchesCat  = catFilter === 'All' || item.category === catFilter;
      const matchesSearch = search.trim() === '' || item.name.toLowerCase().includes(search.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [search, catFilter]);

  const handleSave = async (itemId: string, data: Omit<RecipeRow,'itemId'|'source'>) => {
    setSaving(true);
    try {
      const item = BAKERY_ITEMS.find(b => b.id === itemId)!;
      const payload = {
        item_id:     itemId,
        item_name:   item.name,
        output_qty:  data.outputQty,
        output_unit: data.outputUnit,
        materials:   data.materials,
      };
      // Upsert into bakery_recipes table
      const { error } = await supabase
        .from('bakery_recipes')
        .upsert(payload, { onConflict: 'item_id' });

      if (error) throw error;
      setDbRecipes(prev => ({
        ...prev,
        [itemId]: { itemId, ...data, source: 'db' },
      }));
      setEditingId(null);
      setToast('Recipe saved!');
      setTimeout(() => setToast(''), 2500);
    } catch (err: any) {
      setToast(`Error: ${err.message ?? 'Failed to save'}`);
      setTimeout(() => setToast(''), 4000);
    }
    setSaving(false);
  };

  const editingItem = editingId ? BAKERY_ITEMS.find(b => b.id === editingId) : null;
  const editingInitial = editingId ? (getRecipe(editingId) ?? { ...blankRecipe() }) : blankRecipe();

  const recipeCounts = {
    withRecipe: filteredItems.filter(i => getRecipe(i.id) !== null).length,
    total: filteredItems.length,
  };

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      {/* Header */}
      <div className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <ChefHat className="size-6 text-primary" />
            <h1 className="font-display text-2xl font-bold text-foreground">Recipe Management</h1>
          </div>
          <button
            onClick={() => { setQuickAddOpen(true); setQuickAddItemId(''); }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition shrink-0"
          >
            <Plus className="size-3.5" />
            Add Recipe
          </button>
        </div>
        <p className="text-xs font-body text-muted-foreground">
          View and edit ingredient recipes for all items.
          Excel data auto-loaded · {recipeCounts.withRecipe}/{recipeCounts.total} items have recipes.
        </p>
      </div>

      {/* Quick Add Recipe modal */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4 pb-4">
          <div className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                <p className="font-display font-bold text-foreground text-base">Add Recipe</p>
              </div>
              <button onClick={() => setQuickAddOpen(false)} className="size-8 rounded-xl hover:bg-muted flex items-center justify-center transition">
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Select Bakery Item *</label>
                <select
                  value={quickAddItemId}
                  onChange={e => setQuickAddItemId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">— Choose an item —</option>
                  {BAKERY_ITEMS.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}{getRecipe(item.id) ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">Items marked ✓ already have a recipe</p>
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setQuickAddOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!quickAddItemId) return;
                  setEditingId(quickAddItemId);
                  setQuickAddOpen(false);
                }}
                disabled={!quickAddItemId}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition disabled:opacity-40"
              >
                Open Editor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-2 px-3 py-2 mb-3 bg-blue-50 border border-blue-200 rounded-xl">
        <Info className="size-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[11px] font-body text-blue-700">
          Recipes pre-loaded from BakeryRecipes.xlsx (191 items). Add or edit any recipe here to override.
          The Store dashboard uses these recipes to auto-calculate material quantities.
        </p>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-8 pr-3 text-sm font-body rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="h-9 px-2 text-sm font-body rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="All">All</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Edit modal overlay */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
          <div className="bg-background w-full rounded-t-3xl px-4 pb-8 pt-4 max-h-[85vh] overflow-y-auto">
            <div className="w-12 h-1 bg-muted-foreground/20 rounded-full mx-auto mb-4" />
            <RecipeEditor
              itemId={editingItem.id}
              itemName={editingItem.name}
              itemIcon={editingItem.icon}
              initial={editingInitial as Omit<RecipeRow,'itemId'|'source'>}
              onSave={(data) => handleSave(editingItem.id, data)}
              onCancel={() => setEditingId(null)}
              saving={saving}
            />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-foreground text-background text-sm font-body rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}

      {/* Item list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map(item => (
            <ItemRecipeRow
              key={item.id}
              item={item}
              recipe={getRecipe(item.id)}
              onEdit={setEditingId}
            />
          ))}
          {filteredItems.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <ChefHat className="size-10 opacity-20 mx-auto mb-2" />
              <p className="text-sm font-body">No items found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
