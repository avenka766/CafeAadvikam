import { useState, useEffect } from 'react';
import { Inbox, Plus, Trash2, Send, CheckCircle2, Loader2, Phone, User, Hash } from 'lucide-react';
import { useBakeryStore } from './bakeryStore';
import { useAuthStore } from '@/stores/authStore';
import { BAKERY_ITEMS } from './types';
import type { BakeryOrderItem } from './types';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-700 border-amber-200',
  baking:     'bg-orange-100 text-orange-700 border-orange-200',
  packed:     'bg-purple-100 text-purple-700 border-purple-200',
  dispatched: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'At Store', baking: 'Baking', packed: 'Packed', dispatched: 'Dispatched',
};

function NewOrderForm({ onSubmitted }: { onSubmitted: () => void }) {
  const { submitOrder } = useBakeryStore();
  const { currentUser } = useAuthStore();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderRef, setOrderRef] = useState('');
  // qty stored as string so user can clear the field fully
  const defaultItem = BAKERY_ITEMS[0];
  const [lines, setLines] = useState<{ itemId: string; itemName: string; qty: string }[]>([
    { itemId: defaultItem.id, itemName: defaultItem.name, qty: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const updateItem = (idx: number, itemId: string) => {
    const item = BAKERY_ITEMS.find(b => b.id === itemId);
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, itemId, itemName: item?.name || '' } : l));
  };

  const updateQty = (idx: number, val: string) => {
    // Allow empty string or positive numbers only
    if (val === '' || (Number(val) >= 0)) {
      setLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: val } : l));
    }
  };

  const addLine = () =>
    setLines(prev => [...prev, { itemId: defaultItem.id, itemName: defaultItem.name, qty: '' }]);

  const removeLine = (idx: number) => {
    if (lines.length === 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const valid = lines.every(l => l.qty !== '' && Number(l.qty) > 0);

  const handleSubmit = async () => {
    if (!currentUser || !valid) return;
    setSubmitting(true);
    const items: BakeryOrderItem[] = lines.map(l => ({
      itemId: l.itemId,
      itemName: l.itemName,
      quantity: Number(l.qty),
    }));
    const label = [
      customerName.trim() || 'Walk-in',
      customerPhone.trim() ? `📞 ${customerPhone.trim()}` : '',
      orderRef.trim() ? `Ref: ${orderRef.trim()}` : '',
      `| ${currentUser.displayName}`,
    ].filter(Boolean).join(' ');
    await submitOrder(items, label);
    setSubmitting(false);
    setSuccess(true);
    setCustomerName(''); setCustomerPhone(''); setOrderRef('');
    setLines([{ itemId: defaultItem.id, itemName: defaultItem.name, qty: '' }]);
    setTimeout(() => { setSuccess(false); onSubmitted(); }, 2000);
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Inbox className="size-4 text-primary" />
        <h2 className="font-display font-bold text-foreground">Receive New Order</h2>
      </div>
      <div className="px-4 pt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 flex items-center gap-1">
              <User className="size-3" /> Customer Name
            </label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in / Name"
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 flex items-center gap-1">
              <Phone className="size-3" /> Phone
            </label>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+91 XXXXX" type="tel"
              className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1 flex items-center gap-1">
            <Hash className="size-3" /> Order Reference (optional)
          </label>
          <input value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="WhatsApp / phone order #"
            className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="border-t border-border pt-2">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-2">Order Items</p>
          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <select value={line.itemId} onChange={e => updateItem(idx, e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {(['Sweets', 'Savouries', 'Bakery', 'Cookies'] as const).map(category => (
                    <optgroup key={category} label={
                      category === 'Sweets'    ? '🍬 Sweets' :
                      category === 'Savouries' ? '🥜 Savouries' :
                      category === 'Bakery'    ? '🍞 Bakery' :
                      '🍪 Cookies'
                    }>
                      {BAKERY_ITEMS.filter(item => item.category === category).map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={line.qty}
                  onChange={e => updateQty(idx, e.target.value)}
                  placeholder="Qty"
                  className={cn(
                    'w-16 h-10 px-2 rounded-xl border bg-background text-sm font-body text-center focus:outline-none focus:ring-2 focus:ring-primary/30',
                    line.qty === '' ? 'border-amber-400' : 'border-border'
                  )}
                />
                <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                  className="size-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all shrink-0">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="px-4 py-3 flex gap-2">
        <button onClick={addLine}
          className="h-10 px-4 rounded-xl border-2 border-dashed border-border text-sm font-body font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center gap-1.5 shrink-0">
          <Plus className="size-4" /> Item
        </button>
        <button onClick={handleSubmit} disabled={submitting || success || !valid}
          className={cn(
            'flex-1 h-10 rounded-xl text-sm font-body font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50',
            success ? 'bg-emerald-500 text-white' : 'cafe-gradient text-primary-foreground'
          )}>
          {submitting ? <Loader2 className="size-4 animate-spin" />
            : success ? <><CheckCircle2 className="size-4" /> Sent to Store!</>
            : <><Send className="size-4" /> Forward to Store</>}
        </button>
      </div>
    </div>
  );
}

export default function OrderReceiverDashboard() {
  const { fetchOrders, orders, loading } = useBakeryStore();
  const [refreshKey, setRefreshKey] = useState(0);

  // ✅ Load data immediately on mount
  useEffect(() => { fetchOrders(); }, [refreshKey]);

  const todayCount = orders.filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString()).length;
  const pendingCount = orders.filter(o => o.status === 'pending').length;

  return (
    <div className="min-h-screen bg-background pt-14 pb-24 px-4">
      <div className="pt-4 pb-3">
        <h1 className="font-display text-2xl font-bold text-foreground">Order Receiver</h1>
        <p className="text-xs font-body text-muted-foreground mt-0.5">Receive customer orders and forward to Store</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Today's Orders", value: todayCount, color: 'text-primary' },
          { label: 'Forwarded', value: orders.filter(o => o.status !== 'pending').length, color: 'text-emerald-600' },
          { label: 'At Store', value: pendingCount, color: pendingCount > 0 ? 'text-amber-600' : 'text-muted-foreground' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-3 text-center">
            <p className={cn('font-display font-bold text-xl tabular-nums', color)}>{value}</p>
            <p className="text-[9px] font-body font-semibold text-muted-foreground uppercase leading-tight mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <NewOrderForm onSubmitted={() => setRefreshKey(k => k + 1)} />

        {/* Order history */}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : orders.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold text-sm text-foreground">All Received Orders</h2>
              <span className="text-[11px] font-body text-muted-foreground">{orders.length} total</span>
            </div>
            <div className="divide-y divide-border/40">
              {orders.slice(0, 20).map(order => (
                <div key={order.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-body font-bold text-foreground">#{order.orderNumber}</span>
                      <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border',
                        STATUS_STYLE[order.status] || STATUS_STYLE.pending)}>
                        {STATUS_LABEL[order.status] || order.status}
                      </span>
                    </div>
                    <span className="text-[10px] font-body text-muted-foreground shrink-0">
                      {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] font-body font-semibold text-foreground mb-1">
                    {order.createdBy.split(' | ')[0]}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {order.items.map((item, i) => (
                      <span key={i} className="text-[10px] font-body bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                        {item.itemName} ×{item.quantity}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
