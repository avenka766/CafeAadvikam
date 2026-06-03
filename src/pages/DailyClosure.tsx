import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  History,
  IndianRupee,
  Printer,
  Receipt,
  RefreshCw,
  Smartphone,
  UserCheck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useOrderStore } from '@/stores/orderStore';
import { useAuthStore } from '@/stores/authStore';
import type { Order } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';

type PaymentKey = 'cash' | 'upi' | 'card';
type PaymentTotals = Record<PaymentKey, number>;

const paymentLabels: Record<PaymentKey, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
};

const paymentIcons: Record<PaymentKey, ReactNode> = {
  cash: <Banknote className="size-5" />,
  upi: <Smartphone className="size-5" />,
  card: <CreditCard className="size-5" />,
};

function toDateInput(date = new Date()) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
}

function sameBusinessDate(value: string | undefined, date: string) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return toDateInput(parsed) === date;
}

function safeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function paymentTotalForOrder(order: Order) {
  if (order.paymentBreakdown) {
    return safeNumber(order.paymentBreakdown.cash) + safeNumber(order.paymentBreakdown.upi) + safeNumber(order.paymentBreakdown.card);
  }
  return safeNumber(order.total);
}

function addPayment(totals: PaymentTotals, key: string | undefined, amount: number) {
  if (amount <= 0) return;
  if (key === 'cash' || key === 'upi' || key === 'card') totals[key] += amount;
}

function printableDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function timeLabel(value?: string) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function StatCard({
  title,
  value,
  icon,
  tone = 'emerald',
  helper,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  tone?: 'emerald' | 'blue' | 'amber' | 'red' | 'slate' | 'violet';
  helper?: string;
}) {
  const toneClasses = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
  }[tone];

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
          <p className="mt-2 font-display text-2xl font-black text-foreground tabular-nums">{value}</p>
          {helper && <p className="mt-1 text-xs font-semibold text-muted-foreground">{helper}</p>}
        </div>
        <div className={cn('size-11 rounded-2xl border flex items-center justify-center shrink-0', toneClasses)}>{icon}</div>
      </div>
    </div>
  );
}

function PaymentRow({ label, value, percent, icon }: { label: string; value: number; percent: number; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">{icon}</div>
          <div>
            <p className="font-body text-sm font-black text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{percent.toFixed(1)}% of collection</p>
          </div>
        </div>
        <p className="font-display text-xl font-black tabular-nums text-foreground">{formatCurrency(value)}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  );
}

export default function DailyClosure() {
  const { orders, startPolling, stopPolling, loading, polling, loadOrders } = useOrderStore(
    useShallow(s => ({
      orders: s.orders,
      startPolling: s.startPolling,
      stopPolling: s.stopPolling,
      loading: s.loading,
      polling: s.polling,
      loadOrders: s.loadOrders,
    }))
  );
  const { currentUser } = useAuthStore();
  const [selectedDate, setSelectedDate] = useState(toDateInput());
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    startPolling(60);
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const closure = useMemo(() => {
    const dayOrders = orders
      .filter(order => sameBusinessDate(order.createdAt, selectedDate))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const cancelled = dayOrders.filter(order => order.status === 'cancelled');
    const unpaid = dayOrders.filter(order => order.status !== 'cancelled' && order.paymentType === 'unpaid');
    const billable = dayOrders.filter(order => order.status !== 'cancelled' && order.paymentType !== 'unpaid');

    const payments: PaymentTotals = { cash: 0, upi: 0, card: 0 };
    let creditSales = 0;
    let advanceReceived = 0;
    let advanceOrderValue = 0;
    let advanceBalanceOpen = 0;
    let discountTotal = 0;
    let parcelTotal = 0;
    let billedValue = 0;
    let splitPaymentTotal = 0;

    const paymentModeCount: Record<string, number> = {};
    const billPersonMap = new Map<string, { bills: number; collected: number; credit: number }>();

    for (const order of billable) {
      const orderValue = order.paymentType === 'advance' ? safeNumber(order.fullAmount || order.subtotal || order.total) : safeNumber(order.total);
      billedValue += orderValue;
      discountTotal += safeNumber(order.discount);
      parcelTotal += safeNumber(order.parcelCharges);

      const person = order.billedBy || order.createdBy || 'Unknown';
      const personStats = billPersonMap.get(person) || { bills: 0, collected: 0, credit: 0 };
      personStats.bills += 1;

      if (order.paymentBreakdown) {
        addPayment(payments, 'cash', safeNumber(order.paymentBreakdown.cash));
        addPayment(payments, 'upi', safeNumber(order.paymentBreakdown.upi));
        addPayment(payments, 'card', safeNumber(order.paymentBreakdown.card));
        splitPaymentTotal += paymentTotalForOrder(order);
        personStats.collected += paymentTotalForOrder(order);
      } else if (order.paymentType === 'cash' || order.paymentType === 'upi' || order.paymentType === 'card') {
        addPayment(payments, order.paymentType, safeNumber(order.total));
        personStats.collected += safeNumber(order.total);
      } else if (order.paymentType === 'advance') {
        const amount = safeNumber(order.total || order.advanceAmount);
        advanceReceived += amount;
        advanceOrderValue += safeNumber(order.fullAmount || order.subtotal || order.total);
        advanceBalanceOpen += safeNumber(order.balanceDue);
        addPayment(payments, order.advancePaidBy, amount);
        personStats.collected += amount;
      } else if (order.paymentType === 'credit') {
        creditSales += safeNumber(order.total);
        personStats.credit += safeNumber(order.total);
      }

      const modeLabel = order.paymentType === 'advance'
        ? `advance-${order.advancePaidBy || 'unknown'}`
        : order.paymentType;
      paymentModeCount[modeLabel] = (paymentModeCount[modeLabel] || 0) + 1;
      billPersonMap.set(person, personStats);
    }

    const collectionTotal = payments.cash + payments.upi + payments.card;
    const totalSales = collectionTotal + creditSales;
    const averageBill = billable.length > 0 ? totalSales / billable.length : 0;
    const itemCount = billable.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + safeNumber(item.quantity), 0), 0);

    const advanceOpen = dayOrders.filter(order => order.paymentType === 'advance' && safeNumber(order.balanceDue) > 0);
    const advanceClosedToday = orders.filter(order => sameBusinessDate(order.fullyPaidAt, selectedDate));

    const billers = Array.from(billPersonMap.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.collected + b.credit - (a.collected + a.credit));

    return {
      dayOrders,
      billable,
      cancelled,
      unpaid,
      payments,
      collectionTotal,
      totalSales,
      creditSales,
      advanceReceived,
      advanceOrderValue,
      advanceBalanceOpen,
      advanceOpen,
      advanceClosedToday,
      discountTotal,
      parcelTotal,
      billedValue,
      splitPaymentTotal,
      averageBill,
      itemCount,
      paymentModeCount,
      billers,
    };
  }, [orders, selectedDate]);

  const closingCashValue = Number(closingCash || 0);
  const cashDifference = Number.isFinite(closingCashValue) ? closingCashValue - closure.payments.cash : 0;
  const printableTitle = `Daily Closure - ${printableDate(selectedDate)}`;

  const handlePrint = () => {
    window.print();
  };

  const refresh = () => {
    loadOrders(60);
  };

  const paymentRows: PaymentKey[] = ['cash', 'upi', 'card'];

  return (
    <div className="daily-closure-page flex flex-col bg-background" style={{ minHeight: 'calc(100dvh - var(--header-h, 3.5rem))', paddingBottom: 'var(--nav-h, 5.25rem)' }}>
      <div className="print:hidden border-b border-border bg-background/95 backdrop-blur px-4 py-3 sticky top-0 z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className={cn('size-2 rounded-full', polling ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400')} />
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Biller daily closure</p>
            </div>
            <h1 className="font-display text-2xl font-black text-foreground">Daily Closure</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="h-11 rounded-xl border border-border bg-card pl-9 pr-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <button onClick={refresh} disabled={loading} className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-bold flex items-center gap-2 active:scale-95 disabled:opacity-60">
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />Refresh
            </button>
            <button onClick={handlePrint} className="h-11 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground flex items-center gap-2 active:scale-95">
              <Printer className="size-4" />Print Closure
            </button>
          </div>
        </div>
      </div>

      <div className="hidden print:block p-4 border-b border-black">
        <h1 className="text-2xl font-black">{printableTitle}</h1>
        <p>Closed by: {currentUser?.displayName || currentUser?.username || 'Biller'} · Printed: {new Date().toLocaleString('en-IN')}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 print:overflow-visible print:p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total sales" value={formatCurrency(closure.totalSales)} icon={<IndianRupee className="size-5" />} helper="Collections + credit" tone="emerald" />
          <StatCard title="Total collection" value={formatCurrency(closure.collectionTotal)} icon={<WalletCards className="size-5" />} helper="Cash + UPI + Card" tone="blue" />
          <StatCard title="Bills closed" value={String(closure.billable.length)} icon={<Receipt className="size-5" />} helper={`${closure.itemCount} item qty`} tone="violet" />
          <StatCard title="Cancelled" value={String(closure.cancelled.length)} icon={<XCircle className="size-5" />} helper={formatCurrency(closure.cancelled.reduce((s, o) => s + safeNumber(o.total), 0))} tone="red" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Payment details</p>
                <h2 className="font-display text-xl font-black text-foreground">Cash / UPI / Card Collection</h2>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 border border-emerald-200">
                {formatCurrency(closure.collectionTotal)} collected
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              {paymentRows.map(key => (
                <PaymentRow
                  key={key}
                  label={paymentLabels[key]}
                  value={closure.payments[key]}
                  percent={closure.collectionTotal > 0 ? (closure.payments[key] / closure.collectionTotal) * 100 : 0}
                  icon={paymentIcons[key]}
                />
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Cash closure check</p>
              <h2 className="font-display text-xl font-black text-foreground">Cash Counter</h2>
            </div>
            <div className="rounded-2xl bg-muted/40 p-3 space-y-2">
              <div className="flex justify-between text-sm"><span>System cash</span><span className="font-black tabular-nums">{formatCurrency(closure.payments.cash)}</span></div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Physical closing cash</label>
                <input
                  type="number"
                  value={closingCash}
                  onChange={e => setClosingCash(e.target.value)}
                  placeholder="Enter counted cash"
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-3 text-lg font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className={cn('rounded-2xl px-3 py-3 flex items-center justify-between border',
                Math.abs(cashDifference) < 0.01 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700')}>
                <span className="text-sm font-black">Difference</span>
                <span className="font-display text-xl font-black tabular-nums">{formatCurrency(cashDifference)}</span>
              </div>
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Closure notes, cash shortage/excess reason, UPI settlement note…"
              rows={3}
              className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="UPI" value={formatCurrency(closure.payments.upi)} icon={<Smartphone className="size-5" />} helper={`${closure.paymentModeCount.upi || 0} direct bills`} tone="blue" />
          <StatCard title="Card" value={formatCurrency(closure.payments.card)} icon={<CreditCard className="size-5" />} helper={`${closure.paymentModeCount.card || 0} direct bills`} tone="amber" />
          <StatCard title="Credit sales" value={formatCurrency(closure.creditSales)} icon={<History className="size-5" />} helper="Pending collection" tone="red" />
          <StatCard title="Average bill" value={formatCurrency(closure.averageBill)} icon={<Receipt className="size-5" />} helper="Total sales / bills" tone="slate" />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Advance details</p>
                <h2 className="font-display text-xl font-black text-foreground">Advance Orders</h2>
              </div>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 border border-amber-200">
                Open {closure.advanceOpen.length}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3"><p className="text-[10px] font-black text-amber-700 uppercase">Advance received</p><p className="font-display text-xl font-black">{formatCurrency(closure.advanceReceived)}</p></div>
              <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3"><p className="text-[10px] font-black text-blue-700 uppercase">Order value</p><p className="font-display text-xl font-black">{formatCurrency(closure.advanceOrderValue)}</p></div>
              <div className="rounded-2xl bg-red-50 border border-red-200 p-3"><p className="text-[10px] font-black text-red-700 uppercase">Balance open</p><p className="font-display text-xl font-black">{formatCurrency(closure.advanceBalanceOpen)}</p></div>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto print:max-h-none">
              {closure.advanceOpen.length === 0 ? (
                <div className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" />No open advance balance for this date.</div>
              ) : closure.advanceOpen.map(order => (
                <div key={order.id} className="rounded-2xl border border-border bg-background p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-sm truncate">#{String(order.orderNumber).padStart(4, '0')} · {order.customerName || 'Customer'}</p>
                    <p className="text-xs text-muted-foreground">Delivery: {order.deliveryDate ? new Date(order.deliveryDate).toLocaleString('en-IN') : '-'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p className="font-black tabular-nums text-red-600">{formatCurrency(safeNumber(order.balanceDue))}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Biller wise summary</p>
              <h2 className="font-display text-xl font-black text-foreground">Cashier Performance</h2>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto print:max-h-none">
              {closure.billers.length === 0 ? (
                <div className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">No closed bills for this date.</div>
              ) : closure.billers.map(biller => (
                <div key={biller.name} className="rounded-2xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary"><UserCheck className="size-4" /></div>
                      <div className="min-w-0">
                        <p className="font-black text-sm truncate">{biller.name}</p>
                        <p className="text-xs text-muted-foreground">{biller.bills} bill{biller.bills !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black tabular-nums">{formatCurrency(biller.collected + biller.credit)}</p>
                      {biller.credit > 0 && <p className="text-[10px] text-red-600 font-bold">Credit {formatCurrency(biller.credit)}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Bill audit</p>
              <h2 className="font-display text-xl font-black text-foreground">Closed Bills for {printableDate(selectedDate)}</h2>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <Download className="size-4" />Print this page for closure record
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Bill</th>
                  <th className="p-3 text-left">Time</th>
                  <th className="p-3 text-left">Customer / Type</th>
                  <th className="p-3 text-left">Payment</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-left">Biller</th>
                  <th className="p-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {closure.billable.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No bills closed for this date.</td></tr>
                ) : closure.billable.map(order => (
                  <tr key={order.id} className="border-t border-border">
                    <td className="p-3 font-black">#{String(order.orderNumber).padStart(4, '0')}</td>
                    <td className="p-3">{timeLabel(order.createdAt)}</td>
                    <td className="p-3">
                      <p className="font-bold">{order.customerName || (order.orderType === 'dine_in' ? `Table ${order.tableNumber || '-'}` : 'Walk-in')}</p>
                      <p className="text-xs text-muted-foreground capitalize">{order.orderType.replace('_', ' ')}</p>
                    </td>
                    <td className="p-3 uppercase font-bold">{order.paymentType === 'advance' ? `ADVANCE ${order.advancePaidBy || ''}` : order.paymentType.replace('_', ' ')}</td>
                    <td className="p-3 text-right font-black tabular-nums">{formatCurrency(order.paymentType === 'advance' ? safeNumber(order.total || order.advanceAmount) : safeNumber(order.total))}</td>
                    <td className="p-3">{order.billedBy || order.createdBy || '-'}</td>
                    <td className="p-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 border border-emerald-200">{order.status.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {(closure.unpaid.length > 0 || closure.cancelled.length > 0) && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="size-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-amber-900">Closure attention needed</p>
                <p className="text-sm text-amber-800">Unpaid or cancelled orders are excluded from collection totals. Review before final handover.</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl bg-background/70 p-3 border border-amber-200"><p className="text-xs font-black uppercase text-amber-700">Unpaid orders</p><p className="font-display text-2xl font-black">{closure.unpaid.length}</p></div>
              <div className="rounded-2xl bg-background/70 p-3 border border-amber-200"><p className="text-xs font-black uppercase text-amber-700">Cancelled orders</p><p className="font-display text-2xl font-black">{closure.cancelled.length}</p></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
