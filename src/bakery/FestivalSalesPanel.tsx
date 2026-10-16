import { type FestivalSaleDraft } from './festivalSales';

export default function FestivalSalesPanel({ rows, onChange }: { rows: FestivalSaleDraft[]; onChange: (rows: FestivalSaleDraft[]) => void }) {
  const update = (id: string, field: 'name' | 'quantity' | 'price' | 'unit', value: string) => onChange(rows.map(row => row.id === id ? { ...row, [field]: value } : row));
  return <div className="space-y-3">
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><h3 className="font-bold text-amber-950">Festival Sales</h3><p className="text-xs text-amber-900">Enter the number of packs and price per pack. Festival packs use pcs, including 1KG packs. Custom items can use pcs or kg. A row appears in the cart as soon as you enter a value.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{rows.map(row => <fieldset key={row.id} className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      <legend className="px-1 text-xs font-black">{row.custom ? `Custom item ${rows.filter(r => r.custom).findIndex(r => r.id === row.id) + 1}` : row.name}</legend>
      {row.custom && <button type="button" onClick={() => onChange(rows.filter(r => r.id !== row.id))} aria-label={`Remove custom item ${rows.filter(r => r.custom).findIndex(r => r.id === row.id) + 1}`} className="text-xs font-bold text-destructive underline">Remove item</button>}
      {row.custom && <label className="block text-xs font-bold">Custom item name<input aria-label="Festival custom item name" value={row.name} onChange={event => update(row.id, 'name', event.target.value)} placeholder="Enter item name" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label>}
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label className="text-xs font-bold">Quantity<input aria-label={`${row.custom ? 'Custom item' : row.name} quantity`} type="number" onWheel={event => event.currentTarget.blur()} min={row.custom && row.unit === 'kg' ? "0.001" : "1"} step={row.custom && row.unit === 'kg' ? "0.001" : "1"} inputMode={row.custom && row.unit === 'kg' ? "decimal" : "numeric"} value={row.quantity} onChange={event => update(row.id, 'quantity', event.target.value)} placeholder="Qty" className="mt-1 h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm" /></label>
        <label className="text-xs font-bold">{row.custom ? `Price / ${row.unit || 'pcs'}` : 'Price / pack'}<input aria-label={`${row.custom ? 'Custom item' : row.name} price`} type="number" onWheel={event => event.currentTarget.blur()} min="0.01" step="0.01" inputMode="decimal" value={row.price} onChange={event => update(row.id, 'price', event.target.value)} placeholder="Price" className="mt-1 h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm" /></label>
        {row.custom ? <label className="text-xs font-bold">Unit<select aria-label="Custom item unit" value={row.unit || 'pcs'} onChange={event => update(row.id, 'unit', event.target.value)} className="mt-1 h-10 rounded-lg border border-border bg-background px-2 text-sm"><option value="pcs">pcs</option><option value="kg">kg</option></select></label> : <span className="pb-3 text-xs font-bold text-muted-foreground">pcs</span>}
      </div>
    </fieldset>)}</div>
    <button type="button" onClick={() => onChange([...rows, { id: `festival-custom-${crypto.randomUUID()}`, name: '', quantity: '', price: '', custom: true }])} className="w-full rounded-xl border border-dashed border-amber-500 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 hover:bg-amber-100">+ Add another custom item</button>
  </div>;
}

