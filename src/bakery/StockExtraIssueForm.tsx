import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field, fieldClass, panelClass, WorkspaceTabs } from './MaterialWorkspaceControls';
import StockIssueMaterials, { issueRows, newIssueLine } from './StockIssueMaterials';
import type { OrderRootCard } from './StockProductionOrders';
import type { Material } from './materialWorkspace';

const deductionTabs = ['Recipe Materials', 'Custom Items'] as const;
export type StockDeductionTab = (typeof deductionTabs)[number];

export default function StockExtraIssueForm({ materials, cards, busy, tab, changeTab, submitRecipe, submitCustom }: {
  materials: Material[]; cards: OrderRootCard[]; busy: boolean; tab: StockDeductionTab;
  changeTab: (tab: StockDeductionTab) => void;
  submitRecipe: (payload: object) => Promise<boolean>; submitCustom: (payload: object) => Promise<boolean>;
}) {
  const recipeOnly = tab === 'Recipe Materials';
  const [query, setQuery] = useState('');
  const [selected, select] = useState<string>();
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState(() => [newIssueLine()]);
  const item = cards.find(card => card.id === selected);
  const search = query.trim().toLowerCase();
  const matches = !item && search ? cards
    .filter(card => card.name.toLowerCase().includes(search) || card.card.toLowerCase().includes(search)).slice(0, 12) : [];
  const label = (quantity: number) => Number(quantity.toFixed(6));
  const recipeMaterials = new Set(item?.recipe_materials ?? []);
  const available = recipeOnly ? materials.filter(material => recipeMaterials.has(material.name.trim().toLowerCase())) : materials;
  const rows = issueRows(lines, available);
  const valid = !!((!recipeOnly || item) && reason.trim() && rows.length && rows.length === lines.length);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const payload = { reason: reason.trim(), rows };
    const saved = recipeOnly
      ? item && await submitRecipe({ ...payload, run: item.id })
      : await submitCustom(payload);
    if (saved) {
      setLines([newIssueLine()]);
      setReason('');
    }
  }

  return <form className={panelClass} onSubmit={save}><h2 className="font-semibold">Extra raw materials</h2>
    <fieldset disabled={busy} className="mt-4 space-y-4">
      <WorkspaceTabs tabs={deductionTabs} active={tab} change={next => {
        changeTab(next);
        setQuery('');
        select(undefined);
        setReason('');
        setLines([newIssueLine()]);
      }}/>
      {recipeOnly && <>
        {!cards.length && <p className="text-sm text-muted-foreground">No items with recipes were sent to production today (IST).</p>}
        <Field label="Find an item sent to production today"><Input type="search" autoComplete="off" placeholder="Search by item name or Root Card"
          value={query} onChange={event => { setQuery(event.target.value); select(undefined); setLines([newIssueLine()]); }}/></Field>
        {!!matches.length && <ul aria-label="Order item suggestions" className="divide-y rounded-md border">
          {matches.map(group => <li key={group.card}><button type="button"
            className="flex w-full flex-wrap justify-between gap-2 p-2 text-left hover:bg-muted"
            onClick={() => { select(group.id); setQuery(group.name); }}>
            {group.name} · {label(group.quantity)} {group.unit}<span>Root Card {group.card}</span>
          </button></li>)}
        </ul>}
        {search && !item && !matches.length && <p role="status">No matching item was sent to production today.</p>}
        {item && <>
          <p className="font-medium">{item.name} · {label(item.quantity)} {item.unit} · Root Card {item.card}</p>
          {recipeOnly && !available.length
            ? <p className="text-sm text-muted-foreground">No recipe materials are available for this item. Use Custom Items to select from inventory.</p>
            : <StockIssueMaterials lines={lines} materials={available} change={setLines}/>}
        </>}
      </>}
      {!recipeOnly && <StockIssueMaterials lines={lines} materials={materials} change={setLines}/>}
      {(!recipeOnly || item) && <>
        <Field label={recipeOnly ? 'Reason for extra raw materials' : 'Reason for deduction'}>
          <textarea required maxLength={1900} className={fieldClass} value={reason} onChange={event => setReason(event.target.value)}/>
        </Field>
        <Button type="submit" disabled={!valid}>Record deduction</Button>
      </>}
    </fieldset>
  </form>;
}
