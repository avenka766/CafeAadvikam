import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatCurrency } from '@/lib/utils';
import { CalendarDays, IndianRupee, ChevronDown, Printer } from 'lucide-react';
import OrderCard from '@/components/features/OrderCard';
import EmptyState from '@/components/ui/EmptyState';
import type { Order } from '@/types';

// U-09 FIX: number of orders per page to prevent loading thousands of rows into one scroll
const PAGE_SIZE = 20;

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  part_payment: 'Split Payment',
  advance: 'Advance',
  credit: 'Credit',
  unpaid: 'Unpaid',
};

function safeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dateTimeLabel(value?: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isPrintableBill(order: Order) {
  if (order.status === 'cancelled' || order.paymentType === 'unpaid') return false;
  if (order.paymentType === 'advance') return (order.balanceDue ?? 0) <= 0 || Boolean(order.fullyPaidAt);
  return true;
}

function printDuplicateBill(order: Order) {
  const win = window.open('', '_blank', 'width=420,height=720');
  if (!win) return;
  const paidBy = PAYMENT_LABELS[order.paymentType] || order.paymentType;
  const total = order.paymentType === 'advance' ? (order.fullAmount ?? order.subtotal ?? order.total) : order.total;
  const breakdownRows = order.paymentBreakdown ? `
    <div class="row"><span>Cash</span><span class="b">${safeHtml(formatCurrency(order.paymentBreakdown.cash || 0))}</span></div>
    <div class="row"><span>UPI</span><span class="b">${safeHtml(formatCurrency(order.paymentBreakdown.upi || 0))}</span></div>
    <div class="row"><span>Card</span><span class="b">${safeHtml(formatCurrency(order.paymentBreakdown.card || 0))}</span></div>
  ` : '';
  const rows = order.items.map(ci => `
    <tr><td>${safeHtml(ci.menuItem.name)}</td><td class="c">${ci.quantity}</td><td class="r">${safeHtml(formatCurrency(ci.menuItem.price * ci.quantity))}</td></tr>
  `).join('');
  win.document.write(`<!DOCTYPE html><html><head><title>Duplicate Bill ${String(order.orderNumber).padStart(4, '0')}</title>
<style>@page{margin:5mm;size:80mm auto}*{box-sizing:border-box}body{margin:0;width:76mm;font-family:'Courier New',monospace;color:#000;font-size:12px;line-height:1.25}.c{text-align:center}.r{text-align:right}.b{font-weight:900}.muted{color:#555}.dash{border-top:1px dashed #000;margin:6px 0}.solid{border-top:1px solid #000;margin:6px 0}.row{display:flex;justify-content:space-between;gap:8px}.mt{margin-top:6px}table{width:100%;border-collapse:collapse}td,th{padding:2px 1px;vertical-align:top}th{text-align:left}.pill{border:1px solid #000;border-radius:999px;padding:2px 6px;display:inline-block;font-weight:900}.total{font-size:16px;font-weight:900}</style></head><body>
    <div class="c"><div class="b" style="font-size:15px">Café Aadvikam</div><div class="muted">DUPLICATE BILL</div><div class="pill mt">Bill #${String(order.orderNumber).padStart(4, '0')}</div></div>
    <div class="dash"></div>
    <div class="row"><span>Date</span><span class="b">${safeHtml(dateTimeLabel(order.createdAt))}</span></div>
    <div class="row"><span>Type</span><span class="b">${order.orderType === 'dine_in' ? `Table ${order.tableNumber ?? '-'}` : 'Takeaway'}</span></div>
    <div class="row"><span>Cashier</span><span class="b">${safeHtml(order.billedBy || order.createdBy)}</span></div>
    ${order.customerName ? `<div class="row"><span>Customer</span><span class="b">${safeHtml(order.customerName)}</span></div>` : ''}
    <div class="dash"></div>
    <table><thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="solid"></div>
    <div class="row total"><span>Total</span><span>${safeHtml(formatCurrency(total))}</span></div>
    <div class="row"><span>Payment</span><span class="b">${safeHtml(paidBy)}</span></div>
    ${breakdownRows}
    <div class="dash"></div><div class="c b">Duplicate copy</div>
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); win.close(); }, 350);
}

export default function OrderHistory() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { currentUser } = useAuthStore();
  const [filter, setFilter] = useState<'all' | 'today' | 'served' | 'cancelled'>('all');
  // U-09 FIX: date search and pagination state
  const [dateSearch, setDateSearch] = useState('');
  const [page, setPage] = useState(1);

  // Reset page when filter or date changes
  useEffect(() => { setPage(1); }, [filter, dateSearch]);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const isToday = (d: string) => new Date(d).toDateString() === new Date().toDateString();

  const filtered = useMemo(() => {
    let list = [...orders];
    if (currentUser?.role === 'order_taker') list = list.filter(o => o.createdBy === currentUser.username);
    switch (filter) {
      case 'today':     list = list.filter(o => isToday(o.createdAt)); break;
      case 'served':    list = list.filter(o => o.status === 'served'); break;
      case 'cancelled': list = list.filter(o => o.status === 'cancelled'); break;
    }
    // U-09 FIX: filter by date if a date is typed
    if (dateSearch) {
      list = list.filter(o => new Date(o.createdAt).toISOString().slice(0, 10) === dateSearch);
    }
    return list;
  }, [orders, filter, currentUser, dateSearch]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(0, page * PAGE_SIZE);
  const hasMore    = page * PAGE_SIZE < filtered.length;

  const todayTotal = orders
    .filter(o => isToday(o.createdAt) && o.status === 'served')
    .reduce((s, o) => s + o.total, 0);
  const todayCount = orders.filter(o => isToday(o.createdAt)).length;

  const FILTERS = [
    { key: 'all'       as const, label: 'All Orders' },
    { key: 'today'     as const, label: 'Today' },
    { key: 'served'    as const, label: 'Completed' },
    { key: 'cancelled' as const, label: 'Cancelled' },
  ];

  return (
    <div className="dashboard-screen min-h-screen bg-transparent pt-0 pb-6">

      {/* ── Page header ── */}
      <div className="px-4 pt-4 pb-4 border-b border-border">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="kpi-card">
            <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              <CalendarDays className="size-4 text-primary" />
            </div>
            <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-none">{todayCount}</p>
            <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase tracking-wide mt-1">
              Today's Orders
            </p>
          </div>
          {currentUser?.role !== 'kitchen' && currentUser?.role !== 'order_taker' && (
            <div className="kpi-card" style={{ background: 'linear-gradient(135deg, hsl(164 52% 26% / 0.08), hsl(164 52% 26% / 0.04))', borderColor: 'hsl(164 52% 26% / 0.2)' }}>
              <div className="size-8 rounded-xl bg-primary/15 flex items-center justify-center mb-2">
                <IndianRupee className="size-4 text-primary" />
              </div>
              <p className="font-display text-2xl font-bold text-primary tabular-nums leading-none">{formatCurrency(todayTotal)}</p>
              <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase tracking-wide mt-1">
                Revenue Today
              </p>
            </div>
          )}
        </div>

        {/* U-09 FIX: date picker for searching a specific day */}
        <div className="mt-3">
          <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1 block">
            Search by date
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={dateSearch}
              onChange={e => setDateSearch(e.target.value)}
              max={businessDate()}
              className="flex-1 px-3 py-2 bg-card border border-border rounded-xl text-sm font-body"
            />
            {dateSearch && (
              <button
                onClick={() => setDateSearch('')}
                className="text-xs font-body font-semibold text-primary underline underline-offset-2 whitespace-nowrap active:opacity-70"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Filter chips ── */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-md border-b border-border px-4 py-2.5 flex gap-2 overflow-x-auto scrollbar-hide">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-body font-semibold whitespace-nowrap transition-all shrink-0 active:scale-95',
              filter === f.key
                ? 'text-primary-foreground shadow-teal'
                : 'bg-card border border-border text-foreground'
            )}
            style={filter === f.key ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      <div className="px-4 py-4 space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            icon="🕐"
            message="No orders found"
            sub={dateSearch ? `No orders on ${dateSearch}` : 'Orders will appear here after they are placed.'}
          />
        ) : (
          <>
            <p className="text-xs font-body text-muted-foreground">
              Showing {paginated.length} of {filtered.length} order{filtered.length !== 1 ? 's' : ''}
              {dateSearch ? ` on ${dateSearch}` : ''}
            </p>
            {paginated.map(order => (
              <div key={order.id} className="space-y-2">
                <OrderCard order={order} />
                {isPrintableBill(order) && (currentUser?.role === 'billing' || currentUser?.role === 'admin') && (
                  <button
                    onClick={() => printDuplicateBill(order)}
                    className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-black text-foreground flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                  >
                    <Printer className="size-4" /> Print Duplicate Bill
                  </button>
                )}
              </div>
            ))}

            {/* U-09 FIX: "Load more" pagination instead of one endless scroll */}
            {hasMore && (
              <button
                onClick={() => setPage(p => p + 1)}
                className="w-full py-3 rounded-xl border border-border text-sm font-body font-semibold text-foreground flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <ChevronDown className="size-4" />
                Load more ({filtered.length - paginated.length} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
