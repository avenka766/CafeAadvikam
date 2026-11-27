import { useEffect, useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, fieldClass, MaterialSelect, panelClass } from './MaterialWorkspaceControls';
import { useRecipeStore } from './recipeStore';
import type { RootCard } from './StockProductionOrders';
import type { Material } from './materialWorkspace';

const key = (value: string) => value.trim().toLowerCase();
const newLine = () => ({ key: crypto.randomUUID(), stockId: '', quantity: '' });
type Mode = 'Item' | 'Custom';

export default function StockExtraIssueForm({ materials, cards, busy, recipeError, submit }: {
  materials: Material[]; cards: RootCard[]; busy: boolean; recipeError: boolean;
  submit: (mode: Mode, payload: object) => Promise<boolean>;
}) {
  const [mode,setMode] = useState<Mode>('Item');
  const [query,setQuery] = useState('');
  const [card,setCard] = useState('');
  const [reason,setReason] = useState('');
  const [lines,setLines] = useState(() => [newLine()]);
  const recipe = cards.find(r => r.card === card);
  const { recipes, loaded, error, loadRecipes } = useRecipeStore();
  const needsLegacyRecipe = mode === 'Item' && !!recipe && !Array.isArray(recipe.ingredients);
  useEffect(() => { if (needsLegacyRecipe) void loadRecipes(true); }, [needsLegacyRecipe, loadRecipes]);
  // Older Stock servers return the card and display name only. Require an exact,
  // unambiguous catalogue match before offering ingredients from the recipe store.
  const legacy = needsLegacyRecipe && loaded ? Object.values(recipes).filter(r =>
    key(r.itemName || r.itemId.replaceAll('-', ' ')) === key(recipe!.name)) : [];
  const ingredients = recipe?.ingredients ?? (legacy.length === 1 ? legacy[0].materials.map(i=>({name:i.material})) : []);
  const allowedNames = new Set(ingredients.map(i=>key(i.name)));
  const stockNameCounts = new Map<string,number>();
  materials.forEach(m=>stockNameCounts.set(key(m.name),(stockNameCounts.get(key(m.name)) ?? 0)+1));
  const choices = mode === 'Custom' ? materials : materials.filter(m=>allowedNames.has(key(m.name)) && stockNameCounts.get(key(m.name))===1);
  const unavailable = [...allowedNames].filter(name=>stockNameCounts.get(name)!==1);
  const suggestions = !recipe && key(query) ? cards.filter(r=>key(r.name+' '+r.card).includes(key(query))).slice(0,12) : [];
  const ready = mode === 'Custom' || (!!recipe && !recipeError);
  const rows = lines.flatMap(line=>{
    const stock = choices.find(m=>m.id===line.stockId);
    const quantity = Number(line.quantity);
    if (!stock || !Number.isFinite(quantity) || quantity<=0 || quantity>stock.quantity) return [];
    return [{ stock_id:stock.id, quantity, unit:stock.unit }];
  });
  function reset() { setLines([newLine()]); setReason(''); setCard(''); setQuery(''); }
  function update(id:string,change:Partial<ReturnType<typeof newLine>>) {
    setLines(current=>current.map(line=>line.key===id ? {...line,...change} : line));
  }
  async function save(event:FormEvent) {
    event.preventDefault();
    if (!ready || rows.length!==lines.length || !reason.trim()) return;
    const common = { reason:reason.trim(), section:'Production', rows };
    const payload = mode === 'Item' ? {...common,card:recipe!.card,item:recipe!.item} : {...common,recipe:'Custom deduction'};
    if (await submit(mode,payload)) reset();
  }
  return <form className={panelClass} onSubmit={save}><h2 className="font-semibold">Custom stock deduction</h2>
    <fieldset disabled={busy} className="mt-4 space-y-4">
      <fieldset className="flex gap-5"><legend className="mb-2 text-sm font-medium">Deduction type</legend>
        {(['Item','Custom'] as const).map(value=><label key={value} className="flex items-center gap-2">
          <input type="radio" name="deduction-type" checked={mode===value} onChange={()=>{reset();setMode(value);}}/>{value}</label>)}
      </fieldset>
      {mode==='Item' && <>
        <Field label="Find recipe"><Input type="search" autoComplete="off" placeholder="Search by recipe name or root card number"
          value={query} onChange={e=>{setQuery(e.target.value);setCard('');setLines([newLine()]);}}/></Field>
        {!!suggestions.length && <ul aria-label="Recipe suggestions" className="divide-y rounded-md border">
          {suggestions.map(r=><li key={r.card}><button type="button" className="flex w-full justify-between p-2 text-left hover:bg-muted"
            onClick={()=>{setCard(r.card);setQuery(r.name);setLines([newLine()]);}}>{r.name}<small>{r.card}</small></button></li>)}</ul>}
        {!recipe && key(query) && !suggestions.length && <p role="status">No matching recipe or root card.</p>}
        {recipe && <p>{recipe.name} · {recipe.card}</p>}
        {needsLegacyRecipe && error && <p role="alert">{error} <Button type="button" variant="outline" onClick={()=>void loadRecipes(true)}>Retry recipes</Button></p>}
        {recipe && !choices.length && <p role="status">{needsLegacyRecipe && !loaded && !error ? 'Loading recipe materials…' : 'No eligible inventory materials for this recipe.'}</p>}
        {!!unavailable.length && <p className="text-sm">Missing or duplicate inventory entries: {unavailable.join(', ')}</p>}
      </>}
      {ready && <>
        {lines.map((line,index)=>{
          const stock = choices.find(m=>m.id===line.stockId);
          return <div key={line.key} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
            <Field label={'Raw material '+(index+1)}><MaterialSelect selected={stock?.id ?? ''}
              materials={choices.filter(m=>m.id===line.stockId || !lines.some(other=>other.stockId===m.id))}
              change={stockId=>update(line.key,{stockId,quantity:''})}/></Field>
            {stock && <Field label={'Quantity ('+stock.unit+')'}><Input type="number" required value={line.quantity}
              min={['pcs','nos'].includes(key(stock.unit)) ? 1 : 0.000001} max={stock.quantity}
              step={['pcs','nos'].includes(key(stock.unit)) ? 1 : 0.000001} onChange={e=>update(line.key,{quantity:e.target.value})}/></Field>}
            {stock && <p className="text-sm text-muted-foreground">Available {stock.quantity} {stock.unit}</p>}
            {lines.length>1 && <Button type="button" variant="outline" onClick={()=>setLines(lines.filter(l=>l.key!==line.key))}>Remove material {index+1}</Button>}
          </div>;})}
        <Button type="button" variant="outline" disabled={lines.some(line=>!line.stockId) || lines.length>=Math.min(choices.length,200)}
          onClick={()=>setLines([...lines,newLine()])}>Add material</Button>
        <Field label={mode==='Item' ? 'Reason for extra raw materials' : 'Reason for deduction'}>
          <textarea required maxLength={1900} className={fieldClass} value={reason} onChange={e=>setReason(e.target.value)}/></Field>
        <Button type="submit" disabled={!rows.length || rows.length!==lines.length || !reason.trim()}>Record deduction</Button>
      </>}
    </fieldset>
  </form>;
}
