import { useCallback, useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '@/components/ui/button';
import { printViaIframe } from '@/lib/printViaIframe';
import { supabase } from '@/lib/supabase';
import { dateKey, type Material } from './materialWorkspace';
import { MaterialTable, panelClass, WorkspaceTabs } from './MaterialWorkspaceControls';
import { storeOrderCategory } from './productionRouting';
import StockIssueMaterials, { issueRows, type IssueDraft } from './StockIssueMaterials';

export interface OrderRootCard {
  id: string; number: number | string;
  items: Array<{ index: number; name: string; quantity: number; unit: string; card: string; combined_card: string; recipe_materials: string[] }>;
}
interface Requirement { stock_id: string | null; name: string; quantity: number; unit: string }
interface OrderLine {
  index: number; itemId: string; name: string; quantity: number; unit: string;
  card: string; combined_card: string; recipe?: string; materials?: Requirement[]; issue: string | null;
}
interface Order { id: string; number: number; version: string; items: OrderLine[] }
interface ProductionData { cards: OrderRootCard[]; orders: Order[] }

async function request(action: string, payload: object, requestId: string | null = null) {
  const { data, error } = await supabase.rpc('stock_production_v1', { action, payload, request_id: requestId });
  if (error) throw new Error(error.message);
  return data;
}

export function useStockProduction(active: boolean, view: 'orders' | 'custom') {
  const [data, setData] = useState<ProductionData>();
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const requests = useRef(new Map<string, string>());
  const refresh = useCallback(async () => {
    const token = ++sequence.current;
    try {
      const result = await request('read', { view }) as ProductionData;
      if (token === sequence.current) { setData(result); setError(''); }
    } catch (cause) {
      if (token === sequence.current) setError(cause instanceof Error ? cause.message : 'Could not load planner orders.');
    }
  }, [view]);
  useEffect(() => {
    if (!active) return;
    void refresh();
    const visible = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(visible, 20000);
    window.addEventListener('focus', visible);
    return () => { sequence.current++; clearInterval(timer); window.removeEventListener('focus', visible); };
  }, [active, refresh]);
  const save = async (action: 'release' | 'release_batch' | 'extra', payload: object) => {
    const key = JSON.stringify([action, payload]);
    const id = requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, id);
    try { await request(action, payload, id); requests.current.delete(key); }
    finally { await refresh(); }
  };
  return { data, error, refresh, save };
}

function printRequirements(name: string, total: number, unit: string, card: string, requirements: Requirement[]) {
  const html = renderToStaticMarkup(<html><head><title>{'Material requirement · ' + card}</title>
    <style>{'body{font:15px system-ui;margin:2rem;color:#17202a}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.6rem;border-bottom:1px solid #ccc}'}</style>
    </head><body><h1>Raw material requirement</h1><p>{dateKey()} IST</p>
    <h2>{name} · {total} {unit}</h2><p>Root Card {card}</p>
    <table><thead><tr><th>Raw material</th><th>Required</th><th>Unit</th></tr></thead><tbody>
      {requirements.map((material, index) => <tr key={index}><td>{material.name}</td><td>{Number.isFinite(material.quantity) ? material.quantity : '—'}</td><td>{material.unit}</td></tr>)}
    </tbody></table></body></html>);
  printViaIframe('<!doctype html>' + html);
}

function combinedRequirements(sources: SourceLine[]): Requirement[] {
  const totals = new Map<string, Requirement>();
  for (const { line } of sources) for (const material of line.materials ?? []) {
    const key = JSON.stringify([material.stock_id ?? material.name.trim().toLowerCase(), material.unit]);
    const current = totals.get(key);
    const quantity = Number.isFinite(material.quantity) ? material.quantity : NaN;
    totals.set(key, { ...material, quantity: (current?.quantity ?? 0) + quantity });
  }
  return [...totals.values()].map(row => ({ ...row, quantity: Number(row.quantity.toFixed(6)) }));
}

function selection(line: OrderLine) {
  const { recipe, materials, issue } = line;
  return { index: line.index, plan: { recipe, materials, issue }, section: storeOrderCategory({
    itemId: line.itemId, itemName: line.name, quantity: line.quantity,
  }, []) };
}

type SourceLine = { order: Order; line: OrderLine };
type ReleaseOrder = { order: string; version: string; selected: unknown[] };

function lineKey({ order, line }: SourceLine) {
  return JSON.stringify([order.id, order.version, line.card, selection(line)]);
}

function ItemGroup({ sources, matched, materials, busy, send }: {
  sources: SourceLine[]; matched: boolean; materials: Material[]; busy: boolean;
  send: (orders: ReleaseOrder[]) => Promise<boolean>;
}) {
  const [manual, setManual] = useState<Record<string, IssueDraft[]>>({});
  const first = sources[0].line;
  const total = Number(sources.reduce((sum, { line }) => sum + line.quantity, 0).toFixed(6));
  const issues = [...new Set(sources.flatMap(({ line }) => line.issue ? [line.issue] : []))];
  const release = new Map<string, ReleaseOrder>();
  const required = new Map<string, number>();
  let invalid = matched && issues.length > 0;

  for (const source of sources) {
    const { order, line } = source;
    const itemSelection = selection(line);
    const drafts = manual[lineKey(source)] ?? [];
    const rows = matched ? line.materials ?? [] : issueRows(drafts, materials);
    if (!rows.length || (!matched && rows.length !== drafts.length)) invalid = true;
    for (const row of rows) {
      if (row.stock_id && Number.isFinite(row.quantity)) {
        required.set(row.stock_id, (required.get(row.stock_id) ?? 0) + row.quantity);
      }
    }
    const orderRelease = release.get(order.id) ?? { order: order.id, version: order.version, selected: [] };
    orderRelease.selected.push({
      ...(matched ? itemSelection : { index: line.index, section: itemSelection.section, rows }),
      combined_card: first.combined_card,
    });
    release.set(order.id, orderRelease);
  }
  const shortages = [...required].flatMap(([id, quantity]) => {
    const stock = materials.find(material => material.id === id);
    const needed = Number(quantity.toFixed(6));
    if (!stock) return ['Material is no longer in stock'];
    return needed > stock.quantity ? [stock.name + ' requires ' + needed + ' ' + stock.unit + ', available ' + stock.quantity] : [];
  });

  const requirements = matched ? combinedRequirements(sources) : materials.flatMap(material => {
    const quantity = required.get(material.id);
    return quantity === undefined ? [] : [{
      stock_id: material.id, name: material.name, quantity: Number(quantity.toFixed(6)), unit: material.unit,
    }];
  });

  return <section className={panelClass + ' space-y-3'}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{first.name} · {total} {first.unit}</h3>
      <span className="rounded bg-muted px-2 py-1 text-sm">Root Card {first.combined_card}</span>
    </div>
    {matched && issues.map(message => <p key={message} className="text-sm text-amber-800">{message}</p>)}
    {!!requirements.length && <details>
      <summary className="cursor-pointer text-sm font-medium">Raw materials for {total} {first.unit}</summary>
      <div className="mt-2 space-y-2">
        <MaterialTable label={'Combined requirements for ' + first.name} empty="" headings={['Raw material','Required','Unit','Available (stock unit)']}
          rows={requirements.map(material => [material.name, Number.isFinite(material.quantity) ? material.quantity : '—', material.unit,
            materials.find(stock => stock.id === material.stock_id)?.quantity ?? '—'])}/>
        <Button variant="outline" onClick={() => printRequirements(first.name,total,first.unit,first.combined_card,requirements)}>Print materials</Button>
      </div>
    </details>}
    {!matched && <fieldset disabled={busy} className="space-y-3">
      <legend className="text-sm font-medium">Add raw materials for {total} {first.unit}</legend>
      {sources.map((source, index) => {
        const key = lineKey(source);
        return <div key={key} className="space-y-2">
          {sources.length > 1 && <p className="text-sm text-muted-foreground">Portion {index+1} · {source.line.quantity} {source.line.unit}</p>}
          <StockIssueMaterials lines={manual[key] ?? []} materials={materials}
            change={drafts => setManual(current => ({ ...current, [key]: drafts }))}/>
        </div>;
      })}
    </fieldset>}
    {shortages.map(message => <p key={message} role="status" className="text-sm text-destructive">{message}</p>)}
    <Button disabled={busy || !!shortages.length || invalid} onClick={async () => {
      if (await send([...release.values()])) setManual({});
    }}>Send to production</Button>
  </section>;
}

export function StockProductionOrders({ orders, materials, busy, refresh, send }: {
  orders: Order[]; materials: Material[]; busy: boolean; refresh: () => void;
  send: (orders: ReleaseOrder[]) => Promise<boolean>;
}) {
  const [tab,setTab] = useState<'Matched recipes' | 'Unmatched items'>('Matched recipes');
  const matched = tab === 'Matched recipes';
  const groups = new Map<string, SourceLine[]>();
  for (const order of orders) for (const line of order.items) {
    if (Boolean(line.recipe) !== matched) continue;
    const key = line.combined_card;
    const sources = groups.get(key);
    if (sources) sources.push({ order, line });
    else groups.set(key, [{ order, line }]);
  }
  return <div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-2">
    <div className="space-y-2"><h2 className="font-semibold">Planner orders</h2><WorkspaceTabs tabs={['Matched recipes','Unmatched items'] as const} active={tab} change={setTab}/></div>
    <Button variant="outline" onClick={refresh}>Refresh orders</Button></div>
    {!groups.size && <p className={panelClass}>{matched ? 'No matched items awaiting production.' : 'No unmatched items in the queue.'}</p>}
    {[...groups].map(([key,sources]) => <ItemGroup key={key} {...{ sources, matched, materials, busy, send }}/>)}
  </div>;
}
