import { useCallback, useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { printViaIframe } from '@/lib/printViaIframe';
import { supabase } from '@/lib/supabase';
import { dateKey, type Material } from './materialWorkspace';
import { Field, MaterialTable, panelClass, WorkspaceTabs } from './MaterialWorkspaceControls';
import { storeOrderCategory } from './productionRouting';
import StockIssueMaterials, { issueRows, type IssueDraft } from './StockIssueMaterials';

export interface OrderRootCard {
  id: string; name: string; quantity: number; unit: string; card: string; recipe_materials: string[];
}
interface Requirement { stock_id: string | null; name: string; quantity: number; unit: string }
interface BatchPlan { materials?: Requirement[]; issue: string | null; output_qty?: number; output_unit?: string }
interface OrderLine {
  index: number; itemId: string; name: string; quantity: number; unit: string;
  group_key: string; recipe?: string; order_batches?: number; yield_qty?: number; yield_unit?: string; issue?: string | null;
}
interface Order { id: string; number: number; version: string; items: OrderLine[] }
interface ProductionData { cards: OrderRootCard[]; orders: Order[] }
type SourceLine = { order: Order; line: OrderLine };
type PreviewRequest = { order: string; index: number; version: string; batches: number };
type ReleaseAction = 'release_production' | 'production_extra';

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
  const save = async (action: ReleaseAction, payload: object) => {
    const key = JSON.stringify([action, payload]);
    const id = requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, id);
    try {
      const result = await request(action, payload, id) as { card: string };
      requests.current.delete(key);
      return result;
    }
    finally { await refresh(); }
  };
  return { data, error, refresh, save };
}

function printRequirements(name: string, total: number, unit: string, requirements: Requirement[]) {
  const html = renderToStaticMarkup(<html><head><title>{'Material requirement · ' + name}</title>
    <style>{'body{font:15px system-ui;margin:2rem;color:#17202a}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.6rem;border-bottom:1px solid #ccc}'}</style>
    </head><body><h1>Raw material requirement</h1><p>{dateKey()} IST</p>
    <h2>{name} · {total} {unit}</h2>
    <table><thead><tr><th>Raw material</th><th>Required</th><th>Unit</th></tr></thead><tbody>
      {requirements.map((material, index) => <tr key={index}><td>{material.name}</td><td>{Number.isFinite(material.quantity) ? material.quantity : '—'}</td><td>{material.unit}</td></tr>)}
    </tbody></table></body></html>);
  printViaIframe('<!doctype html>' + html);
}

const previewBatch = (payload: PreviewRequest) => request('batch_preview', payload) as Promise<BatchPlan>;
const rounded = (value: number) => Number(value.toFixed(6));

function ItemGroup({ sources, matched, materials, busy, send, preview }: {
  sources: SourceLine[]; matched: boolean; materials: Material[]; busy: boolean;
  send: (payload: object) => Promise<boolean>; preview: (payload: PreviewRequest) => Promise<BatchPlan>;
}) {
  const [quantity, setQuantity] = useState('');
  const [manual, setManual] = useState<IssueDraft[]>([]);
  const [calculated, setCalculated] = useState<{ key: string; plan?: BatchPlan; error?: string }>();
  const { line: first, order } = sources[0];
  const total = rounded(sources.reduce((sum, { line }) => sum + line.quantity, 0));
  const batchCount = sources.every(({ line }) => line.order_batches != null)
    ? rounded(sources.reduce((sum, { line }) => sum + (line.order_batches ?? 0), 0)) : undefined;
  const amount = Number(quantity);
  const amountValid = Number.isFinite(amount) && amount >= 0.000001 && amount <= 1e9 && amount === rounded(amount)
    && (matched || first.unit !== 'pcs' || Number.isInteger(amount));
  const previewKey = JSON.stringify([order.id, order.version, first.index, amount]);
  const current = calculated?.key === previewKey ? calculated : undefined;
  useEffect(() => {
    if (!matched || !amountValid) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const plan = await preview({ order: order.id, index: first.index, version: order.version, batches: amount });
        if (active) setCalculated({ key: previewKey, plan });
      } catch (cause) {
        if (active) setCalculated({ key: previewKey, error: cause instanceof Error ? cause.message : 'Could not calculate materials.' });
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [matched, amountValid, preview, order.id, order.version, first.index, amount, previewKey]);

  const rows = issueRows(manual, materials);
  const plan = current?.plan;
  const requirements = matched ? plan?.materials ?? [] : rows.map(row => ({
    ...row, name: materials.find(stock => stock.id === row.stock_id)?.name ?? '',
  }));
  const required = new Map<string, number>();
  for (const row of requirements) if (row.stock_id && Number.isFinite(row.quantity)) {
    required.set(row.stock_id, (required.get(row.stock_id) ?? 0) + row.quantity);
  }
  const shortages = [...required].flatMap(([id, amount]) => {
    const stock = materials.find(material => material.id === id);
    const needed = rounded(amount);
    if (!stock) return ['Material is no longer in stock'];
    return needed > stock.quantity ? [stock.name + ' requires ' + needed + ' ' + stock.unit + ', available ' + stock.quantity] : [];
  });
  const output = matched ? plan?.output_qty : amount;
  const outputUnit = matched ? plan?.output_unit : first.unit;
  const error = current?.error || plan?.issue || first.issue;
  const valid = amountValid && !shortages.length && (matched
    ? !!(plan && !plan.issue && requirements.length && output)
    : rows.length > 0 && rows.length === manual.length);

  async function release() {
    if (!valid) return;
    const orders = new Map<string,{order: string; version: string; selected: {index: number; section: string}[]}>();
    for (const source of sources) {
      const { order, line } = source;
      const entry = orders.get(order.id) ?? { order: order.id, version: order.version, selected: [] };
      entry.selected.push({ index: line.index, section: storeOrderCategory({
        itemId: line.itemId, itemName: line.name, quantity: line.quantity,
      }, []) });
      orders.set(order.id, entry);
    }
    if (await send({ group_key: first.group_key, orders: [...orders.values()], ...(matched ? { batches: amount, plan } : { quantity: amount, rows }) })) {
      setQuantity('');
      setManual([]);
      setCalculated(undefined);
    }
  }

  return <section className={panelClass + ' space-y-3'}>
    <h3 className="font-semibold">{first.name} · {total} {first.unit} ordered</h3>
    <div className="flex flex-wrap items-end gap-4">
      {matched && <div className="text-sm">
        <p>{batchCount === undefined ? 'Ordered batch count unavailable' : 'Ordered batches ' + batchCount}</p>
        {first.yield_qty && <p className="text-muted-foreground">One batch yields {first.yield_qty} {first.yield_unit}</p>}
      </div>}
      <Field label={matched ? 'Production batches' : 'Production quantity (' + first.unit + ')'}>
        <Input type="number" min={!matched && first.unit === 'pcs' ? 1 : 0.000001}
          step={!matched && first.unit === 'pcs' ? 1 : 'any'} value={quantity} disabled={busy}
          onChange={event => { setQuantity(event.target.value); setCalculated(undefined); }}/>
      </Field>
    </div>
    {matched && amountValid && !current && <p role="status" className="text-sm">Calculating raw materials…</p>}
    {matched && error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
    {matched && output && outputUnit && <p className="text-sm">Planned output {output} {outputUnit}</p>}
    {!matched && <fieldset disabled={busy}><legend className="text-sm font-medium">Add production materials</legend>
      <StockIssueMaterials lines={manual} materials={materials} change={setManual}/>
    </fieldset>}
    {!!requirements.length && <details open>
      <summary className="cursor-pointer text-sm font-medium">Raw materials for {output} {outputUnit}</summary>
      <div className="mt-2 space-y-2">
        <MaterialTable label={'Production requirements for ' + first.name} empty="" headings={['Raw material','Required','Unit','Available (stock unit)']}
          rows={requirements.map(row => [row.name,Number.isFinite(row.quantity) ? row.quantity : '—',row.unit,
            materials.find(stock => stock.id === row.stock_id)?.quantity ?? '—'])}/>
        <Button variant="outline" disabled={!valid || !output || !outputUnit}
          onClick={() => { if (output && outputUnit) printRequirements(first.name,output,outputUnit,requirements); }}>Print materials</Button>
      </div>
    </details>}
    {shortages.map(message => <p key={message} role="status" className="text-sm text-destructive">{message}</p>)}
    <Button disabled={busy || !valid} onClick={() => void release()}>Send to production</Button>
  </section>;
}

export function StockProductionOrders({ orders, materials, busy, refresh, send, preview = previewBatch }: {
  orders: Order[]; materials: Material[]; busy: boolean; refresh: () => void;
  send: (payload: object) => Promise<boolean>;
  preview?: (payload: PreviewRequest) => Promise<BatchPlan>;
}) {
  const [tab,setTab] = useState<'Matched recipes' | 'Unmatched items'>('Matched recipes');
  const matched = tab === 'Matched recipes';
  const groups = new Map<string, SourceLine[]>();
  for (const order of orders) for (const line of order.items) {
    if (Boolean(line.recipe) !== matched) continue;
    const key = line.group_key;
    const sources = groups.get(key);
    if (sources) sources.push({ order, line });
    else groups.set(key, [{ order, line }]);
  }
  return <div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-2">
    <div className="space-y-2"><h2 className="font-semibold">Planner orders</h2><WorkspaceTabs tabs={['Matched recipes','Unmatched items'] as const} active={tab} change={setTab}/></div>
    <Button variant="outline" onClick={refresh}>Refresh orders</Button></div>
    {!groups.size && <p className={panelClass}>{matched ? 'No matched items awaiting production.' : 'No unmatched items in the queue.'}</p>}
    {[...groups].map(([key,sources]) => <ItemGroup key={key} {...{ sources, matched, materials, busy, send, preview }}/>)}
  </div>;
}
