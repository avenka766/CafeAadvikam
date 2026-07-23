import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Minus, PackagePlus, Plus, RefreshCw, Search, Send, Trash2 } from 'lucide-react';
import { useBranchCatalogStore, type BranchCatalogItem } from '@/stores/branchCatalogStore';
import { useBakeryStore } from '@/bakery/bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import type { BakeryOrderItem } from '@/bakery/types';
import { cn } from '@/lib/utils';

type PlanLine = {
  key: string;
  itemId: string;
  itemName: string;
  quantity: number;
  dispatchUnit: 'pcs' | 'kg';
  category: string;
  isCustom?: boolean;
};

function stepFor(item: BranchCatalogItem) {
  return item.uom === 'Kgs' ? 0.25 : 1;
}

export default function AdminPlanningTab() {
  const catalog = useBranchCatalogStore(state => state.items.SNB);
  const loading = useBranchCatalogStore(state => state.loading.SNB);
  const loadCatalog = useBranchCatalogStore(state => state.loadCatalog);
  const submitOrder = useBakeryStore(state => state.submitOrder);
  const currentUser = useAuthStore(state => state.currentUser);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [lines, setLines] = useState<PlanLine[]>([]);
  const [custom, setCustom] = useState({ name: '', quantity: '', unit: 'pcs' as 'pcs' | 'kg' });
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { void loadCatalog('SNB'); }, [loadCatalog]);

  const activeItems = useMemo(() => catalog.filter(item => item.active), [catalog]);
  const categories = useMemo(() => ['All', ...Array.from(new Set(activeItems.map(item => item.category))).sort()], [activeItems]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activeItems.filter(item =>
      (category === 'All' || item.category === category)
      && (!query || `${item.name} ${item.barcode} ${item.category}`.toLowerCase().includes(query))
    );
  }, [activeItems, category, search]);

  const addCatalogItem = (item: BranchCatalogItem) => {
    const key = `snb-${item.barcode}`;
    const step = stepFor(item);
    setLines(current => current.some(line => line.key === key)
      ? current.map(line => line.key === key ? { ...line, quantity: Number((line.quantity + step).toFixed(2)) } : line)
      : [...current, {
          key,
          itemId: key,
          itemName: item.name,
          quantity: step,
          dispatchUnit: item.uom === 'Kgs' ? 'kg' : 'pcs',
          category: item.category,
        }]
    );
  };

  const setQuantity = (key: string, quantity: number) => {
    setLines(current => quantity <= 0
      ? current.filter(line => line.key !== key)
      : current.map(line => line.key === key ? { ...line, quantity: Number(quantity.toFixed(2)) } : line)
    );
  };

  const addCustom = () => {
    const name = custom.name.trim();
    const quantity = Number(custom.quantity);
    if (!name || !Number.isFinite(quantity) || quantity <= 0) {
      setError('Enter a custom item name and valid quantity.');
      return;
    }
    setError('');
    const customId = `custom-${crypto.randomUUID()}`;
    setLines(current => [...current, {
      key: customId,
      itemId: customId,
      itemName: name,
      quantity,
      dispatchUnit: custom.unit,
      category: 'Others',
      isCustom: true,
    }]);
    setCustom({ name: '', quantity: '', unit: 'pcs' });
  };

  const sendPlan = async () => {
    if (lines.length === 0 || sending) return;
    setSending(true);
    setError('');
    setMessage('');
    try {
      const items: BakeryOrderItem[] = lines.map(line => ({
        itemId: line.itemId,
        itemName: line.itemName,
        quantity: line.quantity,
        dispatchUnit: line.dispatchUnit,
        isCustom: line.isCustom,
      }));
      const dateLabel = new Date().toLocaleDateString('en-IN');
      const planNotes = [`Admin production plan ${dateLabel}`, notes.trim()].filter(Boolean).join(' | ');
      await submitOrder(items, currentUser?.displayName || currentUser?.username || 'Admin', 'SNB', planNotes);
      setLines([]);
      setNotes('');
      setMessage('Production plan sent to Store. Store can review stock and route each selected item to its Master.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Production plan could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search SNB item or barcode" className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <select value={category} onChange={event => setCategory(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold">
            {categories.map(value => <option key={value}>{value}</option>)}
          </select>
          <button type="button" title="Refresh SNB items" onClick={() => void loadCatalog('SNB', true)} disabled={loading} className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </button>
        </div>
        <div className="max-h-[430px] overflow-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-2">Item</th><th className="px-4 py-2">Category</th><th className="px-4 py-2">Unit</th><th className="px-4 py-2 text-right">Plan</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{visibleItems.map(item => <tr key={item.barcode}><td className="px-4 py-2.5 font-bold">{item.name}<span className="ml-2 text-[10px] text-slate-400">{item.barcode}</span></td><td className="px-4 py-2.5 text-slate-600">{item.category}</td><td className="px-4 py-2.5 text-slate-600">{item.uom === 'Kgs' ? 'kg' : 'pcs'}</td><td className="px-4 py-2.5 text-right"><button type="button" onClick={() => addCatalogItem(item)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-100"><Plus className="size-3.5" /> Add</button></td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2"><PackagePlus className="size-5 text-emerald-700" /><h3 className="font-black text-slate-950">Custom Item</h3></div>
        <div className="grid gap-2 md:grid-cols-[1fr_120px_110px_auto]">
          <input value={custom.name} onChange={event => setCustom(current => ({ ...current, name: event.target.value }))} placeholder="Custom item name" className="h-11 rounded-xl border border-slate-200 px-3 text-sm" />
          <input value={custom.quantity} onChange={event => setCustom(current => ({ ...current, quantity: event.target.value }))} type="number" min="0" step={custom.unit === 'kg' ? '0.25' : '1'} placeholder="Quantity" className="h-11 rounded-xl border border-slate-200 px-3 text-sm" />
          <select value={custom.unit} onChange={event => setCustom(current => ({ ...current, unit: event.target.value as 'pcs' | 'kg' }))} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold"><option value="pcs">pcs</option><option value="kg">kg</option></select>
          <button type="button" onClick={addCustom} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white"><Plus className="size-4" /> Add</button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div className="flex items-center gap-2"><ClipboardList className="size-5 text-emerald-700" /><h3 className="font-black text-slate-950">Planned Items</h3></div><span className="text-xs font-black text-slate-500">{lines.length} lines</span></div>
        {lines.length === 0 ? <p className="p-8 text-center text-sm font-semibold text-slate-500">Add SNB or custom items to create a production plan.</p> : <div className="divide-y divide-slate-100">{lines.map(line => {
          const step = line.dispatchUnit === 'kg' ? 0.25 : 1;
          return <div key={line.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-bold text-slate-950">{line.itemName}</p><p className="text-xs text-slate-500">{line.category} | {line.isCustom ? 'Custom item' : 'SNB catalogue'}</p></div><div className="flex items-center gap-1"><button type="button" title="Decrease quantity" onClick={() => setQuantity(line.key, line.quantity - step)} className="grid size-9 place-items-center rounded-lg border"><Minus className="size-4" /></button><input value={line.quantity} onChange={event => setQuantity(line.key, Number(event.target.value))} type="number" min={step} step={step} className="h-9 w-24 rounded-lg border px-2 text-center text-sm font-black" /><span className="w-7 text-xs font-bold text-slate-500">{line.dispatchUnit}</span><button type="button" title="Increase quantity" onClick={() => setQuantity(line.key, line.quantity + step)} className="grid size-9 place-items-center rounded-lg border"><Plus className="size-4" /></button></div><button type="button" title="Remove item" onClick={() => setLines(current => current.filter(item => item.key !== line.key))} className="grid size-9 place-items-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 className="size-4" /></button></div>;
        })}</div>}
        <div className="border-t border-slate-100 p-4">
          <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Production notes (optional)" className="min-h-20 w-full rounded-xl border border-slate-200 p-3 text-sm" />
          {error && <p className="mt-2 text-sm font-bold text-red-600">{error}</p>}
          {message && <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</p>}
          <button type="button" onClick={() => void sendPlan()} disabled={sending || lines.length === 0} className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50"><Send className="size-4" /> {sending ? 'Sending Plan...' : 'Send Plan to Store'}</button>
        </div>
      </section>
    </div>
  );
}
