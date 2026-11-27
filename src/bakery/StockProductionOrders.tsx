import { useCallback, useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '@/components/ui/button';
import { printViaIframe } from '@/lib/printViaIframe';
import { supabase } from '@/lib/supabase';
import { dateKey, type Material } from './materialWorkspace';
import { MaterialTable, panelClass, WorkspaceTabs } from './MaterialWorkspaceControls';
import { storeOrderCategory } from './productionRouting';

export interface RootCard { card: string; item: string; name: string; ingredients: { name: string; unit: string }[] }
interface Requirement { stock_id: string | null; name: string; quantity: number; unit: string }
interface OrderLine {
  index: number; itemId: string; name: string; quantity: number; unit: string;
  recipe?: string; card?: string; materials?: Requirement[]; issue: string | null;
}
interface Order { id: string; number: number; version: string; items: OrderLine[] }
interface ProductionData { cards: RootCard[]; orders: Order[] }

async function request(action: string, payload: object, requestId: string | null = null) {
  const { data, error } = await supabase.rpc('stock_production_v1', { action, payload, request_id: requestId });
  if (error) throw new Error(error.message);
  return data;
}

export function useStockProduction(active: boolean) {
  const [data, setData] = useState<ProductionData>();
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const requests = useRef(new Map<string, string>());
  const refresh = useCallback(async () => {
    const token = ++sequence.current;
    try {
      const result = await request('read', {}) as ProductionData;
      if (token === sequence.current) { setData(result); setError(''); }
    } catch (cause) {
      if (token === sequence.current) setError(cause instanceof Error ? cause.message : 'Could not load planner orders.');
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    void refresh();
    const visible = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(visible, 20000);
    window.addEventListener('focus', visible);
    return () => { sequence.current++; clearInterval(timer); window.removeEventListener('focus', visible); };
  }, [active, refresh]);
  const save = async (action: 'release' | 'extra', payload: object) => {
    const key = JSON.stringify([action, payload]);
    const id = requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, id);
    try { await request(action, payload, id); requests.current.delete(key); }
    finally { await refresh(); }
  };
  return { data, error, refresh, save };
}

function printRequirements(order: Order, item: OrderLine) {
  const html = renderToStaticMarkup(<html><head><title>Material requirement · {item.card}</title>
    <style>{'body{font:15px system-ui;margin:2rem;color:#17202a}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.6rem;border-bottom:1px solid #ccc}'}</style>
    </head><body><h1>Raw material requirement</h1><p>Order #{order.number} · {dateKey()} IST</p>
    <h2>{item.name} · {item.quantity} {item.unit}</h2><p>{item.recipe} · {item.card}</p>
    <table><thead><tr><th>Raw material</th><th>Required</th><th>Unit</th></tr></thead><tbody>
      {item.materials?.map((m, i) => <tr key={i}><td>{m.name}</td><td>{m.quantity}</td><td>{m.unit}</td></tr>)}
    </tbody></table>{item.issue && <p>{item.issue}</p>}</body></html>);
  printViaIframe('<!doctype html>' + html);
}

function selection(line: OrderLine) {
  const { card, recipe, materials, issue } = line;
  return { index: line.index, plan: { card, recipe, materials, issue }, section: storeOrderCategory({
    itemId: line.itemId, itemName: line.name, quantity: line.quantity,
  }, []) };
}

function OrderPanel({ order, matched, materials, busy, send }: {
  order: Order; matched: boolean; materials: Material[]; busy: boolean;
  send: (payload: object) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const lines = order.items.filter(line => Boolean(line.card) === matched);
  if (!lines.length) return null;
  const selectedLines = lines.filter(line => selected.includes(JSON.stringify(selection(line))) && !line.issue);
  const required = new Map<string, number>();
  for (const line of selectedLines) for (const m of line.materials ?? []) {
    if (m.stock_id) required.set(m.stock_id, (required.get(m.stock_id) ?? 0) + m.quantity);
  }
  const shortages = [...required].flatMap(([id, quantity]) => {
    const stock = materials.find(m => m.id === id);
    return !stock || Number(quantity.toFixed(6)) > stock.quantity ? [stock ? stock.name + ' requires ' + Number(quantity.toFixed(6)) + ' ' + stock.unit + ', available ' + stock.quantity : 'Material is no longer in stock'] : [];
  });
  return <section className={panelClass + ' space-y-4'}><h3 className="font-semibold">Order #{order.number}</h3>
    {lines.map(line => {
      const key = JSON.stringify(selection(line));
      return <article key={line.index} className="space-y-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 font-semibold">
          {matched && <input type="checkbox" disabled={busy || !!line.issue} checked={selected.includes(key)}
            onChange={e => setSelected(current => e.target.checked ? [...current,key] : current.filter(x => x !== key))}/>}
          {line.name} · {line.quantity} {line.unit}</label>
          {Boolean(line.materials?.length) && <Button variant="outline" onClick={() => printRequirements(order,line)}>Print materials</Button>}
        </div>
        {line.card && <p className="text-sm">{line.card} · {line.recipe}</p>}
        {line.issue && <p className="text-sm text-amber-800">{line.issue}</p>}
        {Boolean(line.materials?.length) && <details><summary className="cursor-pointer text-sm font-medium">Raw materials required ({line.materials!.length})</summary>
          <MaterialTable label={'Requirements for ' + line.name} empty="" headings={['Raw material','Required','Unit','Available (stock unit)']}
            rows={line.materials!.map(m => [m.name,m.quantity,m.unit,materials.find(s => s.id === m.stock_id)?.quantity ?? '—'])}/></details>}
      </article>;
    })}
    {shortages.map(msg => <p key={msg} role="status" className="text-sm text-destructive">{msg}</p>)}
    {matched && <Button disabled={busy || !selectedLines.length || !!shortages.length} onClick={async () => {
      if (await send({ order: order.id, version: order.version, selected: selectedLines.map(selection) })) setSelected([]);
    }}>Send to production ({selectedLines.length})</Button>}
  </section>;
}

export function StockProductionOrders({ orders, materials, busy, refresh, send }: {
  orders: Order[]; materials: Material[]; busy: boolean; refresh: () => void; send: (payload: object) => Promise<boolean>;
}) {
  const [tab,setTab] = useState<'Matched recipes' | 'Unmatched items'>('Matched recipes');
  const matched = tab === 'Matched recipes';
  const count = orders.flatMap(o => o.items).filter(i => Boolean(i.card) === matched).length;
  return <div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-2">
    <div className="space-y-2"><h2 className="font-semibold">Planner orders</h2><WorkspaceTabs tabs={['Matched recipes','Unmatched items'] as const} active={tab} change={setTab}/></div>
    <Button variant="outline" onClick={refresh}>Refresh orders</Button></div>
    {!count && <p className={panelClass}>{matched ? 'No matched items awaiting production.' : 'No unmatched items in the queue.'}</p>}
    {orders.map(order => <OrderPanel key={order.id + order.version} {...{ order, matched, materials, busy, send }}/>)}
  </div>;
}
