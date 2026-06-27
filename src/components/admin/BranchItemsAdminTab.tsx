import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Hash, Pencil, Plus, Search, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useBranchStore } from '@/branch/branchStore';
import {
  catalogCategories,
  useBranchCatalogStore,
  type BranchCatalogItem,
  type CatalogBranch,
  type CatalogUom,
} from '@/stores/branchCatalogStore';

const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const normal = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

type Draft = { name: string; price: string; uom: CatalogUom; category: string; active: boolean };
const blankDraft = (category: string): Draft => ({ name: '', price: '', uom: 'Nos', category, active: true });

function ItemDialog({
  branch,
  item,
  categories,
  onClose,
}: {
  branch: CatalogBranch;
  item: BranchCatalogItem | null;
  categories: string[];
  onClose: () => void;
}) {
  const { currentUser } = useAuthStore();
  const { addItem, updateItem } = useBranchCatalogStore();
  const [draft, setDraft] = useState<Draft>(() => item ? {
    name: item.name,
    price: String(item.price),
    uom: item.uom,
    category: item.category,
    active: item.active,
  } : blankDraft(categories[0] ?? 'Other'));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const price = Number(draft.price);
    if (!draft.name.trim()) return setError('Item name is required.');
    if (!Number.isFinite(price) || price <= 0) return setError('Enter a valid price.');
    setSaving(true);
    const updatedBy = currentUser?.displayName || currentUser?.username || 'Admin';
    const message = item
      ? await updateItem(branch, item.barcode, { ...draft, name: draft.name.trim(), price }, updatedBy)
      : (await addItem(branch, { name: draft.name.trim(), price, uom: draft.uom, category: draft.category }, updatedBy)).error;
    setSaving(false);
    if (message) return setError(message);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="font-bold">{item ? `Edit ${branch} Item` : `Add ${branch} Item`}</p>
            {item && <p className="text-xs text-muted-foreground">Barcode #{item.barcode}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-muted"><X className="size-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block text-xs font-semibold">Item name
            <input className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold">Price
              <input type="number" min="0" step="0.01" className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            </label>
            <label className="block text-xs font-semibold">Unit
              <select className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm" value={draft.uom} onChange={(e) => setDraft({ ...draft, uom: e.target.value as CatalogUom })}>
                <option value="Nos">Nos</option><option value="Kgs">Kgs</option>
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold">Category
            <input list={`${branch}-categories`} className="mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-sm" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            <datalist id={`${branch}-categories`}>{categories.map((category) => <option key={category} value={category} />)}</datalist>
          </label>
          {item && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active in operational screens</label>}
          {error && <p className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="size-4" />{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold">Cancel</button>
          <button disabled={saving} onClick={save} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

export default function BranchItemsAdminTab({ branch }: { branch: CatalogBranch }) {
  const { items, errors, loadCatalog, subscribe } = useBranchCatalogStore();
  const { stock, fetchBranchData } = useBranchStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [dialog, setDialog] = useState<BranchCatalogItem | 'new' | null>(null);

  useEffect(() => {
    void loadCatalog(branch);
    void fetchBranchData(branch);
    return subscribe(branch);
  }, [branch, fetchBranchData, loadCatalog, subscribe]);

  const catalogue = items[branch];
  const categories = useMemo(() => catalogCategories(catalogue), [catalogue]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogue.filter((item) => (category === 'All' || item.category === category) && (!q || item.name.toLowerCase().includes(q) || String(item.barcode).includes(q)));
  }, [catalogue, category, search]);

  const stockByBarcode = useMemo(() => new Map(stock[branch].filter((row) => row.itemBarcode != null).map((row) => [Number(row.itemBarcode), row])), [branch, stock]);

  return <div className="space-y-4">
    {errors[branch] && <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"><AlertCircle className="size-4 shrink-0" />{errors[branch]}</div>}
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item or barcode" className="w-full rounded-xl border bg-background py-2 pl-9 pr-3 text-sm" /></div>
      <select className="rounded-xl border bg-background px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}><option>All</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
      <button onClick={() => setDialog('new')} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="size-4" />Add Item</button>
    </div>
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Barcode</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead>
      <tbody>{filtered.map((item) => {
        const row = stockByBarcode.get(item.barcode) ?? stock[branch].find((entry) => normal(entry.itemName) === normal(item.name));
        return <tr key={item.barcode} className="border-t"><td className="px-4 py-3 font-mono text-xs"><Hash className="mr-1 inline size-3" />{item.barcode}</td><td className="px-4 py-3 font-semibold">{item.name}</td><td className="px-4 py-3">{item.category}</td><td className="px-4 py-3">{item.uom}</td><td className="px-4 py-3 text-right font-bold">{money(item.price)}</td><td className="px-4 py-3 text-right">{Number(row?.quantity ?? 0).toLocaleString('en-IN')}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{item.active ? 'Active' : 'Inactive'}</span></td><td className="px-4 py-3 text-right"><button onClick={() => setDialog(item)} className="rounded-lg border p-2 hover:bg-muted"><Pencil className="size-4" /></button></td></tr>;
      })}</tbody></table>
    </div>
    {dialog && <ItemDialog branch={branch} item={dialog === 'new' ? null : dialog} categories={categories} onClose={() => setDialog(null)} />}
  </div>;
}
