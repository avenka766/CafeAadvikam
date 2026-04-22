import { useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { formatCurrency } from '@/lib/utils';
import {
  TrendingUp, ShoppingBag, IndianRupee, Clock,
  Package, XCircle, RefreshCw, Wifi,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AdminDashboard() {
  const { orders, startPolling, stopPolling, polling } = useOrderStore();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toDateString();
  }, []);

  const todayOrders = useMemo(
    () => orders.filter((o) => new Date(o.createdAt).toDateString() === todayStr),
    [orders, todayStr]
  );

  const served = todayOrders.filter((o) => o.status === 'served');
  const pending = todayOrders.filter((o) => o.status === 'pending');
  const preparing = todayOrders.filter((o) => o.status === 'preparing');
  const ready = todayOrders.filter((o) => o.status === 'ready');
  const cancelled = todayOrders.filter((o) => o.status === 'cancelled');

  const totalRevenue = served.reduce((s, o) => s + o.total, 0);
  const totalOrders = todayOrders.length;
  const avgOrderValue = served.length > 0 ? Math.round(totalRevenue / served.length) : 0;

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    served.forEach((o) =>
      o.items.forEach((ci) => {
        const ex = map.get(ci.menuItem.id);
        if (ex) { ex.qty += ci.quantity; ex.revenue += ci.menuItem.price * ci.quantity; }
        else { map.set(ci.menuItem.id, { name: ci.menuItem.name, qty: ci.quantity, revenue: ci.menuItem.price * ci.quantity }); }
      })
    );
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [served]);

  const paymentTotals = useMemo(() => {
    let cash = 0, upi = 0, card = 0;
    served.forEach((o) => {
      if (o.paymentType === 'cash') cash += o.total;
      else if (o.paymentType === 'upi') upi += o.total;
      else if (o.paymentType === 'card') card += o.total;
      else if (o.paymentType === 'part_payment' && o.paymentBreakdown) {
        cash += o.paymentBreakdown.cash; upi += o.paymentBreakdown.upi; card += o.paymentBreakdown.card;
      }
    });
    return { cash, upi, card };
  }, [served]);

  const peakHour = useMemo(() => {
    const hours: Record<number, number> = {};
    served.forEach((o) => { const h = new Date(o.createdAt).getHours(); hours[h] = (hours[h] || 0) + 1; });
    let max = 0, maxH = 0;
    Object.entries(hours).forEach(([h, c]) => { if (Number(c) > max) { max = Number(c); maxH = Number(h); } });
    if (max === 0) return 'N/A';
    return `${maxH > 12 ? maxH - 12 : maxH}${maxH >= 12 ? 'PM' : 'AM'}`;
  }, [served]);

  return (
    <div className="min-h-screen bg-background pt-14 pb-20">
      <div className="px-4 pt-4 pb-2">
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-sm font-body text-muted-foreground">
            Today&apos;s Summary • {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
          <Wifi className={cn('size-3', polling ? 'text-emerald-500' : 'text-muted-foreground')} />
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <KPI icon={<IndianRupee className="size-4" />} label="Total Revenue" value={formatCurrency(totalRevenue)} color="bg-primary/10 text-primary" />
          <KPI icon={<ShoppingBag className="size-4" />} label="Total Orders" value={String(totalOrders)} color="bg-accent/20 text-accent-foreground" />
          <KPI icon={<TrendingUp className="size-4" />} label="Avg Order Value" value={formatCurrency(avgOrderValue)} color="bg-blue-50 text-blue-700" />
          <KPI icon={<Clock className="size-4" />} label="Peak Hour" value={peakHour} color="bg-amber-50 text-amber-700" />
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <RefreshCw className="size-4 text-primary" />Live Order Status
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <StatusBadge label="Pending" count={pending.length} color="bg-amber-100 text-amber-800" />
            <StatusBadge label="Preparing" count={preparing.length} color="bg-blue-100 text-blue-800" />
            <StatusBadge label="Ready" count={ready.length} color="bg-emerald-100 text-emerald-800" />
            <StatusBadge label="Cancelled" count={cancelled.length} color="bg-red-100 text-red-800" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-lg font-bold text-foreground mb-3">Payment Breakdown</h3>
          <div className="space-y-2">
            <PaymentRow label="💵 Cash" amount={paymentTotals.cash} total={totalRevenue} />
            <PaymentRow label="📱 UPI" amount={paymentTotals.upi} total={totalRevenue} />
            <PaymentRow label="💳 Card" amount={paymentTotals.card} total={totalRevenue} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-lg font-bold text-foreground mb-3">Top Selling Items</h3>
          {topItems.length === 0 ? (
            <p className="text-sm font-body text-muted-foreground text-center py-4">No sales today yet</p>
          ) : (
            <div className="space-y-2">
              {topItems.map((item, i) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', i === 0 ? 'gold-gradient text-white' : i < 3 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                  <div className="flex-1 min-w-0"><p className="text-sm font-body font-semibold text-foreground truncate">{item.name}</p></div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-body font-bold tabular-nums">{item.qty} sold</p>
                    <p className="text-[10px] font-body text-muted-foreground tabular-nums">{formatCurrency(item.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-lg font-bold text-foreground mb-3">GST Summary</h3>
          {totalRevenue === 0 ? (
            <p className="text-sm font-body text-muted-foreground text-center py-4">No data</p>
          ) : (() => {
            const taxable = Math.round((totalRevenue / 1.05) * 100) / 100;
            const gst = Math.round((totalRevenue - taxable) * 100) / 100;
            const cgst = Math.round((gst / 2) * 100) / 100;
            const sgst = Math.round((gst / 2) * 100) / 100;
            return (
              <div className="space-y-1.5">
                <Row label="Revenue (incl. GST)" value={formatCurrency(totalRevenue)} bold />
                <Row label="Taxable Amount" value={formatCurrency(taxable)} />
                <Row label="GST @ 5%" value={formatCurrency(gst)} />
                <div className="border-t border-border pt-1.5 mt-1.5">
                  <Row label="CGST @ 2.5%" value={formatCurrency(cgst)} highlight />
                  <Row label="SGST @ 2.5%" value={formatCurrency(sgst)} highlight />
                </div>
              </div>
            );
          })()}
        </div>

        {cancelled.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-display text-lg font-bold text-foreground mb-2 flex items-center gap-2">
              <XCircle className="size-4 text-destructive" />Cancelled Orders
            </h3>
            <div className="flex justify-between text-sm font-body mb-2">
              <span className="text-muted-foreground">Count</span><span className="font-bold text-destructive">{cancelled.length}</span>
            </div>
            <div className="flex justify-between text-sm font-body">
              <span className="text-muted-foreground">Lost Revenue</span>
              <span className="font-bold text-destructive">{formatCurrency(cancelled.reduce((s, o) => s + o.total, 0))}</span>
            </div>
          </div>
        )}

        <div className="bg-muted/50 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" />
            <p className="text-xs font-body text-muted-foreground">Data retained for last 60 days. Older records are automatically purged.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3.5">
      <div className={cn('size-8 rounded-lg flex items-center justify-center mb-2', color)}>{icon}</div>
      <p className="font-display text-xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase mt-0.5">{label}</p>
    </div>
  );
}

function StatusBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={cn('rounded-lg p-2 text-center', color)}>
      <p className="font-display text-lg font-bold tabular-nums">{count}</p>
      <p className="text-[10px] font-bold uppercase">{label}</p>
    </div>
  );
}

function PaymentRow({ label, amount, total }: { label: string; amount: number; total: number }) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-body w-20 shrink-0">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-2"><div className="h-full rounded-full cafe-gradient" style={{ width: `${pct}%` }} /></div>
      <span className="text-sm font-body font-bold tabular-nums shrink-0 w-20 text-right">{formatCurrency(amount)}</span>
    </div>
  );
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={cn('flex justify-between py-0.5', highlight && 'pl-3')}>
      <span className={cn('text-sm font-body', bold ? 'font-bold text-foreground' : 'text-muted-foreground')}>{label}</span>
      <span className={cn('text-sm font-body tabular-nums', bold ? 'font-bold text-foreground' : highlight ? 'font-semibold text-primary' : 'text-foreground')}>{value}</span>
    </div>
  );
}
