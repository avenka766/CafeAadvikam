// src/bakery/PurchaseOrderTab.tsx
// Store dashboard tab - raise and manage purchase orders for raw materials.

import { useState, useEffect } from 'react';
import { Plus, Loader2, ShoppingCart, CheckCircle2, Send, Truck, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { usePurchaseOrderStore, type POItem, type POStatus } from './purchaseOrderStore';
import { useStoreStockStore } from './storeStockStore';
import { useSupplierStore } from './supplierStore';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

const STATUS_META: Record<POStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft:    { label: 'Draft',    color: 'bg-muted text-muted-foreground border-border',          icon: ShoppingCart },
  sent:     { label: 'Sent',     color: 'bg-blue-50 text-blue-700 border-blue-200',              icon: Send         },
  received: { label: 'Received', color: 'bg-emerald-50 text-emerald-700 border-emerald-200',     icon: CheckCircle2 },
};

function POCard({ po, onStatusChange, onDelete }: {
  po: ReturnType<typeof usePurchaseOrderStore.getState>['orders'][0];
  onStatusChange: (id: string, status: POStatus) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[po.status];
  const Icon = meta.icon;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button className="w-full px-4 py-3.5 flex items-center gap-3 text-left" onClick={() => setExpanded(e => !e)}>
        <div className="size-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-body font-bold text-foreground">{po.orderNumber}</p>
            <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border', meta.color)}>
              {meta.label}
            </span>
          </div>
          <p className="text-xs font-body text-muted-foreground truncate">
            {po.supplierName} - {po.items.length} item(s)
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-body text-muted-foreground">
            {new Date(po.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </p>
          {expanded ? <ChevronUp className="size-3.5 text-muted-foreground mt-1 ml-auto" /> : <ChevronDown className="size-3.5 text-muted-foreground mt-1 ml-auto" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-12 px-3 py-2 bg-muted/50 text-[9px] font-body font-bold text-muted-foreground uppercase">
              <span className="col-span-6">Material</span>
              <span className="col-span-3 text-right">Qty</span>
              <span className="col-span-3 text-right">Unit</span>
            </div>
            {po.items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 px-3 py-2.5 border-t border-border text-xs font-body">
                <span className="col-span-6 font-semibold text-foreground">{item.materialName}</span>
                <span className="col-span-3 text-right text-foreground">{item.quantity}</span>
                <span className="col-span-3 text-right text-muted-foreground">{item.unit}</span>
              </div>
            ))}
          </div>

          {po.notes && (
            <p className="text-xs font-body text-muted-foreground bg-muted/40 px-3 py-2 rounded-xl">{po.notes}</p>
          )}

          <div className="flex items-center gap-2 text-[10px] font-body text-muted-foreground">
            <span>Created {new Date(po.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            {po.sentAt && <><span>-</span><span>Sent {new Date(po.sentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></>}
            {po.receivedAt && <><span>-</span><span>Received {new Date(po.receivedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></>}
          </div>

          <div className="flex gap-2">
            {po.status === 'draft' && (
              <button
                onClick={() => onStatusChange(po.id, 'sent')}
                className="flex-1 h-9 rounded-xl bg-blue-500 text-white text-xs font-body font-bold flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Send className="size-3.5" /> Mark as Sent
              </button>
            )}
            {po.status === 'sent' && (
              <button
                onClick={() => onStatusChange(po.id, 'received')}
                className="flex-1 h-9 rounded-xl bg-emerald-500 text-white text-xs font-body font-bold flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Truck className="size-3.5" /> Mark as Received
              </button>
            )}
            {po.status !== 'received' && (
              <button
                onClick={() => onDelete(po.id)}
                className="size-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center active:scale-95"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CreatePOForm({ onClose, branchScope }: { onClose: () => void; branchScope?: 'SNB' }) {
  const { items: stockItems } = useStoreStockStore();
  const { suppliers }         = useSupplierStore();
  const { currentUser }       = useAuthStore();
  const { createPO }          = usePurchaseOrderStore();

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [notes,      setNotes]      = useState('');
  const [lines,      setLines]      = useState<POItem[]>([{ materialName: stockItems[0]?.name ?? '', quantity: 1, unit: stockItems[0]?.unit ?? 'kg' }]);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const addLine    = () => setLines(p => [...p, { materialName: stockItems[0]?.name ?? '', quantity: 1, unit: stockItems[0]?.unit ?? 'kg' }]);
  const removeLine = (i: number) => setLines(p => p.filter((_, j) => j !== i));
  const setItem    = (i: number, name: string) => {
    const stock = stockItems.find(s => s.name === name);
    setLines(p => p.map((l, j) => j === i ? { ...l, materialName: name, unit: stock?.unit ?? l.unit } : l));
  };
  const setQty = (i: number, qty: number) => setLines(p => p.map((l, j) => j === i ? { ...l, quantity: qty } : l));

  const supplier = suppliers.find(s => s.id === supplierId);

  const handleSubmit = async () => {
    if (!supplierId || !supplier || lines.some(l => !l.materialName || l.quantity <= 0)) {
      setError('Please fill all fields.'); return;
    }
    setSaving(true);
    const err = await createPO({
      supplierId,
      supplierName: supplier.businessName,
      branch: branchScope,
      items: lines,
      status: 'draft',
      notes,
      createdBy: currentUser?.displayName ?? 'Store',
    });
    setSaving(false);
    if (err) { setError(err); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl px-4 pt-5 pb-10 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-border rounded-full mx-auto -mt-1 mb-2" />
        <h3 className="font-display font-bold text-lg text-foreground">New Purchase Order</h3>

        <div className="space-y-1">
          <p className="text-[11px] font-body font-bold text-muted-foreground uppercase">Supplier</p>
          <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none">
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.businessName}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-body font-bold text-muted-foreground uppercase">Materials</p>
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select value={line.materialName} onChange={e => setItem(i, e.target.value)}
                className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none">
                {stockItems.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <input type="number" min={1} value={line.quantity} onChange={e => setQty(i, Number(e.target.value))}
                className="w-16 h-10 px-2 rounded-xl border border-border bg-background text-sm font-body text-center focus:outline-none" />
              <span className="text-xs font-body text-muted-foreground w-8">{line.unit}</span>
              <button onClick={() => removeLine(i)} disabled={lines.length === 1}
                className="size-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center disabled:opacity-30">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <button onClick={addLine}
            className="w-full h-9 rounded-xl border-2 border-dashed border-border text-sm font-body font-semibold text-muted-foreground flex items-center justify-center gap-1.5">
            <Plus className="size-4" /> Add Material
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-body font-bold text-muted-foreground uppercase">Notes (optional)</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-body focus:outline-none resize-none" />
        </div>

        {error && <p className="text-xs font-body text-destructive">{error}</p>}

        <button onClick={handleSubmit} disabled={saving}
          className="w-full h-11 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <><ShoppingCart className="size-4" /> Create Purchase Order</>}
        </button>
      </div>
    </div>
  );
}

export default function PurchaseOrderTab({ branchScope }: { branchScope?: 'SNB' } = {}) {
  const { orders, loaded, loading, load, updateStatus, deletePO } = usePurchaseOrderStore();
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | POStatus>('all');

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  const scopedOrders = branchScope
    ? orders.filter(o => o.branch === branchScope)
    : orders.filter(o => !o.branch);
  const filtered = scopedOrders.filter(o => filterStatus === 'all' || o.status === filterStatus);
  const draftCount    = scopedOrders.filter(o => o.status === 'draft').length;
  const sentCount     = scopedOrders.filter(o => o.status === 'sent').length;
  const receivedCount = scopedOrders.filter(o => o.status === 'received').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Draft',    value: draftCount,    color: draftCount > 0 ? 'text-muted-foreground' : 'text-muted-foreground', bg: '' },
          { label: 'Sent',     value: sentCount,     color: sentCount > 0 ? 'text-blue-600' : 'text-muted-foreground',          bg: sentCount > 0 ? 'bg-blue-50 border-blue-200' : '' },
          { label: 'Received', value: receivedCount, color: 'text-emerald-600', bg: receivedCount > 0 ? 'bg-emerald-50 border-emerald-200' : '' },
        ].map(s => (
          <div key={s.label} className={cn('bg-card border border-border rounded-xl p-2.5 text-center', s.bg)}>
            <p className={cn('font-display text-xl font-bold', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 flex-1 overflow-x-auto pb-0.5">
          {(['all', 'draft', 'sent', 'received'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn('shrink-0 text-[11px] font-body font-semibold px-3 py-1.5 rounded-full border transition-all',
                filterStatus === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground')}>
              {s === 'all' ? 'All' : STATUS_META[s].label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate(true)}
          className="size-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground shrink-0 active:scale-90">
          <Plus className="size-4" />
        </button>
      </div>

      {loading && !loaded ? (
        <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <ShoppingCart className="size-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-body text-muted-foreground">No purchase orders yet.</p>
          <button onClick={() => setShowCreate(true)} className="mt-2 text-xs text-primary underline">Create one now</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(po => (
            <POCard key={po.id} po={po}
              onStatusChange={updateStatus}
              onDelete={deletePO} />
          ))}
        </div>
      )}

      {showCreate && <CreatePOForm branchScope={branchScope} onClose={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}
