import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useOrderStore, dbRowToOrder } from '@/stores/orderStore';
import { useShallow } from 'zustand/react/shallow'; // STORE-01 FIX: granular selectors
import { useMenuStore } from '@/stores/menuStore';
import { useAuthStore } from '@/stores/authStore';
import { useBranchStore } from '@/branch/branchStore';
import type { CreditSale } from '@/branch/branchStore';
import type { Branch } from '@/branch/types';
import { useBranchOpsStore } from '@/branch/branchOpsStore';
import { cn, formatCurrency, formatTime } from '@/lib/utils';
import {
  Inbox, Wifi, Plus, Minus, Search, X,
  ShoppingBag, MapPin, User as UserIcon, StickyNote,
  ChevronDown, ChevronRight, AlertCircle, Trash2, Receipt,
  QrCode, UserCheck, IndianRupee, Clock, CheckCircle2,
  CreditCard, Banknote, Smartphone, Wallet, Loader2,
  Edit3, UtensilsCrossed, Printer, Calendar, Building2, Bell, RefreshCw,
  ArrowRightLeft,
} from 'lucide-react';
import OrderCard from '@/components/features/OrderCard';
import CategoryFilter from '@/components/features/CategoryFilter';
import MenuItemCard from '@/components/features/MenuItemCard';
import type { OrderStatus, OrderType, PaymentType, PaymentBreakdown, Order, CartItem, MenuItem } from '@/types';
import { TABLES_G, TABLES_A, tableSectionOf, tableLabel } from '@/constants/config';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import EmptyState from '@/components/ui/EmptyState';
import { supabase } from '@/lib/supabase';
import { businessDate } from '@/lib/businessDate';
import { printViaQz, listQzPrinters, isQzAvailable, getPrinterPref, setPrinterPref } from '@/lib/qzPrint';
import { useNotificationStore } from '@/bakery/notificationStore';
import { useSearchParams } from 'react-router-dom';
import WalletOffersPanel, { type WalletOtherMode } from '@/components/commerce/WalletOffersPanel';
import type { PromotionCartLine, PromotionEvaluation, WalletCustomer } from '@/features/commerce/types';

// -- Branch Credit Panel (Biller view - scope controlled by caller) -----------
const ALL_BRANCHES: Branch[] = ['Cafe', 'VRSNB', 'SNB', 'Hosur'];

const BRANCH_BADGE: Record<Branch, string> = {
  Cafe:  'bg-green-100 text-green-700 border-green-200',
  VRSNB: 'bg-blue-100 text-blue-700 border-blue-200',
  SNB:   'bg-amber-100 text-amber-700 border-amber-200',
  Hosur: 'bg-teal-100 text-teal-700 border-teal-200',
};

// -- Notify VRSNB Admin + Admin whenever a new credit sale is recorded ---------
async function notifyCreditSale(params: {
  customerName: string;
  amount: number;
  billNo: string;
  branch: Branch;
  soldBy: string;
  dueDate?: string;
}) {
  // Best-effort fire-and-forget - biller UI must never block on this
  try {
    const { pushCreditSale } = useNotificationStore.getState();
    await pushCreditSale(params);
  } catch (error) {
    console.error('Credit-sale notification failed', error);
  }
}

const ROLE_BRANCHES: Record<string, Branch[]> = {
  owner: ALL_BRANCHES,
  admin: ALL_BRANCHES,
  billing: ['Cafe'],
  biller: ['Cafe'],
  admin_vrsnb: ['VRSNB'],
  branch_vrsnb: ['VRSNB'],
  admin_snb: ['SNB'],
  branch_snb: ['SNB'],
  branch_hosur: ['Hosur'],
  hosur_biller: ['Hosur'],
};

function todayIso(value = new Date()) {
  const now = value;
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

function useCafeCounterOpened() {
  const counterOpenings = useBranchOpsStore((s) => s.counterOpenings);
  const cashierClosures = useBranchOpsStore((s) => s.cashierClosures);
  const [remoteCounter, setRemoteCounter] = useState({ opened: false, closed: false, loaded: false });
  const today = todayIso();
  const localClosed = cashierClosures.some(
    (record) => record.branch === 'Cafe' && todayIso(new Date(record.createdAt)) === today,
  );

  useEffect(() => {
    let alive = true;
    const checkCounterOpening = async () => {
      if (!useBranchOpsStore.persist.hasHydrated()) {
        await useBranchOpsStore.persist.rehydrate();
      }
      const [{ data: closureRows, error: closureError }, { data: opRows, error: opError }] = await Promise.all([
        supabase
          .from('branch_daily_closures')
          .select('status, created_at')
          .eq('branch', 'Cafe')
          .eq('closure_date', today),
        // BUG FIX: this used to only select `record_id` and check
        // `opRows.length > 0` — i.e. "does ANY counter_opening row exist for
        // today", completely ignoring whether that row's status was later
        // flipped to "Closed" by closeCounter(). Verified directly against
        // production data: rows genuinely do end up with status "Closed"
        // (and the counter can be opened/closed more than once a day), so
        // this was reporting the counter as open all day even hours after
        // it had actually been closed. Now pulls status + updated_at for
        // every row so the *latest* one decides, same pattern already used
        // for the formal daily-closure rows just above.
        supabase
          .from('branch_operation_records')
          .select('status, updated_at, created_at')
          .eq('branch', 'Cafe')
          .eq('record_type', 'counter_opening')
          .eq('record_no', today),
      ]);
      if (!alive) return;
      const formalRows = !closureError && Array.isArray(closureRows) ? closureRows : [];
      const latestRow = [...formalRows].sort(
        (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime(),
      )[0];
      const latestStatus = String(latestRow?.status || '').toLowerCase();
      const closed = latestStatus === 'finalized';

      const openingRows = !opError && Array.isArray(opRows) ? opRows : [];
      const latestOpeningRow = [...openingRows].sort((a, b) =>
        new Date((b.updated_at || b.created_at) as string).getTime() - new Date((a.updated_at || a.created_at) as string).getTime(),
      )[0];
      const latestOpeningStatus = String(latestOpeningRow?.status || '').toLowerCase();
      const opened =
        latestStatus === 'draft' ||
        (!closed && latestOpeningStatus === 'opened');
      setRemoteCounter({ opened, closed, loaded: true });
    };
    void checkCounterOpening();
    return () => {
      alive = false;
    };
  }, [today]);

  // BUG FIX (part 1): closeCounter() in branchOpsStore.ts doesn't remove or
  // move the day's counterOpenings record when the counter is closed — it
  // just flips that same record's `active` field to false in place. This
  // check never looked at `active` at all, so it kept counting today's
  // record as "open" even after it had been closed.
  const todaysLocalOpening = counterOpenings.find((record) => record.branch === 'Cafe' && record.date === today);
  const localOpened = todaysLocalOpening ? todaysLocalOpening.active !== false : false;

  // BUG FIX (part 2, the actual root cause of "close isn't working"): the
  // remote snapshot above is fetched exactly once per mount (the effect only
  // depends on `today`) and never refreshed afterward. The old final line —
  // `return remoteCounter.opened || localOpened` — meant that once the
  // remote fetch had seen the counter open, closing it locally later in the
  // very same session could never flip this back to false: `true ||
  // anything` is always `true`. A local record for today (this session
  // having just opened and/or closed the counter itself, right now) is
  // always fresher information than that one-time remote snapshot, so it
  // must take priority over it rather than only ever being OR'd in.
  if (todaysLocalOpening) return localOpened;
  if (localClosed) return false;
  // BUG FIX (audit 2026-08-10): this used to default to `true` while the
  // remote fetch above was still in flight, so a bill could be pushed
  // through in the brief window right after a fresh page load / new device,
  // even if the counter was actually closed for the day (nothing local yet
  // to say otherwise). A billing-integrity gate like this should fail
  // closed while its answer is unknown, not fail open — the loading window
  // is at most a second, and the error is instantly recoverable the moment
  // the fetch resolves.
  if (!remoteCounter.loaded) return false;
  return remoteCounter.opened && !remoteCounter.closed;
}

function BillerCreditTab() {
  const { currentUser } = useAuthStore();
  const branches = useMemo<Branch[]>(() => ROLE_BRANCHES[currentUser?.role ?? ''] ?? [], [currentUser?.role]);
  const { creditSales: allCreditSales, settleCreditSale, fetchCreditSales } = useBranchStore();

  const branchesKey = branches.join('|');
  useEffect(() => {
    branches.forEach((branch) => void fetchCreditSales(branch));
  }, [fetchCreditSales, branchesKey, branches]);

  const [filter, setFilter] = useState<'all' | 'pending' | 'partial' | 'settled'>('pending');
  const [branchFilter, setBranchFilter] = useState<Branch | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [settling, setSettling] = useState<string | null>(null);
  const [settleAmts, setSettleAmts] = useState<Record<string, string>>({});
  const [settleModes, setSettleModes] = useState<Record<string, 'cash' | 'upi' | 'card'>>({});
  const [error, setError] = useState('');

  // Flatten all branch credit sales with branch tag
  const allSales: (CreditSale & { branch: Branch })[] = useMemo(() =>
    branches.flatMap(b =>
      (allCreditSales?.[b] || []).map(cs => ({ ...cs, branch: b }))
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [allCreditSales, branches]
  );

  const filtered = useMemo(() => {
    let result = allSales;
    if (branchFilter !== 'all') result = result.filter(cs => cs.branch === branchFilter);
    if (filter !== 'all') result = result.filter(cs => cs.status === filter);
    return result;
  }, [allSales, filter, branchFilter]);

  const totalDue = useMemo(() =>
    filtered.filter(cs => cs.status !== 'settled').reduce((s, c) => s + c.creditAmount, 0),
    [filtered]
  );

  const pendingCount = filtered.filter(cs => cs.status !== 'settled').length;

  const handleSettle = async (cs: CreditSale & { branch: Branch }) => {
    const amt = parseFloat(settleAmts[cs.id] || '0');
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return; }
    if (amt > cs.creditAmount) { setError('Amount exceeds balance due'); return; }
    setSettling(cs.id); setError('');
    const mode = settleModes[cs.id];
    if (!mode) { setError('Select Cash, UPI, or Card'); setSettling(null); return; }
    const err = await settleCreditSale(cs.branch, cs.id, amt, { mode, collectedBy: currentUser?.username ?? 'Biller', collectedRole: currentUser?.role ?? null });
    setSettling(null);
    if (err) setError(err);
    else setSettleAmts(prev => { const n = { ...prev }; delete n[cs.id]; return n; });
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-red-100 text-red-700 border-red-200',
    partial: 'bg-amber-100 text-amber-700 border-amber-200',
    settled: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  return (
    <div className="p-3 space-y-3 pb-8">
      {/* Summary banner */}
      <div className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-orange-700 uppercase tracking-widest mb-1">Total Credit Outstanding</p>
        <p className="font-display text-3xl font-bold text-orange-600 tabular-nums">
          Rs {totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {pendingCount} open account{pendingCount !== 1 ? 's' : ''}  -  All Branches
        </p>
        {/* Per-branch outstanding summary */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {branches.map(b => {
            const due = (allCreditSales?.[b] || [])
              .filter(cs => cs.status !== 'settled')
              .reduce((s, c) => s + c.creditAmount, 0);
            if (due <= 0) return null;
            return (
              <div key={b} className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold', BRANCH_BADGE[b])}>
                <Building2 className="size-3" />{b}: Rs {due.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-xl text-xs text-destructive">
          <AlertCircle className="size-3 shrink-0" />{error}
        </div>
      )}

      {/* Branch filter - only shown when more than one branch is in scope */}
      {branches.length > 1 && (
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setBranchFilter('all')}
          className={cn('px-3 py-1.5 rounded-full text-[11px] font-bold border transition',
            branchFilter === 'all' ? 'bg-foreground text-background border-transparent' : 'bg-card border-border text-muted-foreground')}>
          All Branches
        </button>
        {branches.map(b => (
          <button key={b} onClick={() => setBranchFilter(b)}
            className={cn('px-3 py-1.5 rounded-full text-[11px] font-bold border transition',
              branchFilter === b ? `${BRANCH_BADGE[b]} border-transparent` : 'bg-card border-border text-muted-foreground')}>
            {b}
          </button>
        ))}
      </div>
      )}

      {/* Status filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all', 'pending', 'partial', 'settled'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-3 py-1.5 rounded-full text-[11px] font-bold border transition',
              filter === f ? 'bg-amber-500 text-white border-transparent' : 'bg-card border-border text-muted-foreground')}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && (
              <span className="ml-1 opacity-70">
                ({allSales.filter(cs => (branchFilter === 'all' || cs.branch === branchFilter) && cs.status === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Credit sale cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
            <Wallet className="size-8 opacity-25" />
          </div>
          <p className="text-sm font-body">No {filter !== 'all' ? filter : ''} credit sales</p>
          <p className="text-xs font-body text-muted-foreground/70">
            Credit sales recorded via branch billing will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(cs => (
            <div key={cs.id} className="bg-card border-2 border-border rounded-2xl overflow-hidden">
              {/* Card header */}
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-body font-bold text-sm text-foreground truncate">{cs.customerName || '-'}</span>
                    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', statusColors[cs.status])}>
                      {cs.status.toUpperCase()}
                    </span>
                    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', BRANCH_BADGE[cs.branch])}>
                      {cs.branch}
                    </span>
                  </div>
                  {cs.customerPhone && <p className="text-xs text-muted-foreground mt-0.5">{cs.customerPhone}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Bill #{cs.billNo.split('-').pop()}  -  {new Date(cs.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}  -  {cs.soldBy}
                  </p>
                  {cs.dueDate && (
                    <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                      Due: {new Date(cs.dueDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="text-[10px] text-muted-foreground">Due</p>
                  <p className="font-display font-bold text-lg text-red-600 tabular-nums">
                    Rs {cs.creditAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Expand/collapse */}
              <button onClick={() => setExpanded(prev => prev === cs.id ? null : cs.id)}
                className="w-full flex items-center justify-between px-4 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground">
                <span>Total: Rs {cs.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}  -  Paid: Rs {cs.amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                {expanded === cs.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>

              {expanded === cs.id && (
                <div className="px-4 py-3 border-t border-border/50 space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Items</p>
                  {cs.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-foreground">{item.quantity}{item.sellUnit === 'kg' ? 'kg' : 'x'} {item.itemName}</span>
                      <span className="font-bold tabular-nums">Rs {item.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  {cs.notes && <p className="text-xs text-muted-foreground italic mt-1">"{cs.notes}"</p>}
                </div>
              )}

              {/* Collect payment */}
              {cs.status !== 'settled' && (
                <div className="px-4 py-3 border-t border-border bg-muted/10 space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Collect Payment</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['cash', 'upi', 'card'] as const).map((mode) => (
                      <button key={mode} type="button" onClick={() => { setSettleModes(prev => ({ ...prev, [cs.id]: mode })); setError(''); }}
                        className={cn('py-1.5 rounded-lg border text-[11px] font-bold uppercase', settleModes[cs.id] === mode ? 'bg-amber-500 text-white border-amber-500' : 'bg-card border-border text-muted-foreground')}>
                        {mode}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                      <input type="number" placeholder={`Max Rs ${cs.creditAmount.toFixed(2)}`}
                        value={settleAmts[cs.id] || ''}
                        onChange={e => { setSettleAmts(prev => ({ ...prev, [cs.id]: e.target.value })); setError(''); }}
                        className="w-full pl-7 pr-2 py-2 rounded-xl bg-card border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
                    </div>
                    <button onClick={() => handleSettle(cs)} disabled={settling === cs.id || !settleAmts[cs.id]}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold active:scale-95 disabled:opacity-50 transition">
                      {settling === cs.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                      {settling === cs.id ? '...' : 'Collect'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_TABS: { key: OrderStatus; label: string; dotColor: string }[] = [
  { key: 'pending', label: 'New', dotColor: 'bg-amber-500' },
  { key: 'served', label: 'Completed', dotColor: 'bg-emerald-500' },
  { key: 'cancelled', label: 'Cancelled', dotColor: 'bg-red-500' },
];

const QUICK_NOTES = [
  'Less spicy', 'Extra spicy', 'No onion', 'No garlic',
  'Less oil', 'Extra chutney', 'Pack separately', 'Allergy - check ingredients',
];


const PAYMENT_LABELS_PRINT: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  part_payment: 'Split Payment',
  advance: 'Advance',
  credit: 'Credit',
  wallet: 'Wallet',
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

function buildSlipDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><title>${safeHtml(title)}</title>
<style>
@page{margin:4mm;size:80mm auto}*{box-sizing:border-box}body{margin:0;width:66mm;padding-bottom:10mm;font-family:'Courier New',monospace;color:#000;font-size:12px;line-height:1.3}.c{text-align:center}.r{text-align:right}.b{font-weight:900}.muted{color:#444}.big{font-size:16px}.shop{font-size:17px;font-weight:900}.dash{border-top:1px dashed #000;margin:6px 0}.solid{border-top:2px solid #000;margin:6px 0}.kv{width:100%;border-collapse:collapse}.kv td{padding:1px 0;vertical-align:top}.mt{margin-top:6px}.paid{font-size:15px;font-weight:900;text-align:center;margin-bottom:3px}.pick{text-align:right;font-size:16px;font-weight:900}table{width:100%;border-collapse:collapse}td,th{padding:3px 6px;vertical-align:top}th{text-align:left;border-bottom:1px solid #000}tbody tr.item-row td{border-bottom:1px solid #ddd}.num{text-align:right}.qty{text-align:center}.grand td{font-size:18px;font-weight:900;padding:6px 0}.thanks{text-align:center;font-size:14px;margin-top:8px}.small{font-size:10px}
/* KOT (kitchen ticket) — deliberately larger + heavier than the customer bill so kitchen staff can read it at a glance across the pass. */
.kot-slip{font-size:14px;font-weight:700}
.kot-slip .kot-title{font-size:19px;font-weight:900;margin:2px 0}
.kot-slip .kot-item{width:100%;border-collapse:collapse;margin:4px 0}
.kot-slip .kot-item th{font-size:12px;font-weight:900;text-align:left;border-bottom:1px solid #000;padding:2px 1px}
.kot-slip .kot-item td{padding:3px 1px;vertical-align:top;border-bottom:1px dashed #ccc}
.kot-slip .kot-name{font-size:16px;font-weight:900;word-wrap:break-word;white-space:normal}
.kot-slip .kot-note-cell{font-size:12px;font-weight:700;font-style:italic;white-space:normal}
.kot-slip .kot-qty{font-size:18px;font-weight:900;text-align:center;width:40px;white-space:nowrap}
</style></head><body>${bodyHtml}</body></html>`;
}

function printCounterSlipViaIframe(title: string, bodyHtml: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.left = '-10000px';
  frame.style.bottom = '0';
  // BUG FIX (2026-08-18): was 1px x 1px. Chrome's print pipeline computes
  // the `@page { size: 80mm auto }` height from the iframe's own layout
  // box in some driver/OS combinations — a near-zero-sized container gave
  // it no real dimensional context, and trailing content (often the very
  // last line, e.g. "Thank You & Visit Again") got cut off at the physical
  // print/cut edge. Still fully invisible (off-screen + opacity 0 +
  // pointer-events none), just no longer starved for layout space.
  frame.style.width = '302px';
  frame.style.height = '2000px';
  frame.style.border = '0';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  if (!win) { frame.remove(); return Promise.resolve(); }

  win.document.open();
  win.document.write(buildSlipDocument(title, bodyHtml));
  win.document.close();

  return new Promise<void>((resolve) => {
    let cleaned = false;
    const finish = () => {
      if (cleaned) return;
      cleaned = true;
      frame.remove();
      resolve();
    };
    win.onafterprint = finish;
    // Safety-net timeout matches the one already proven safe in the branch
    // billing print pipeline (printCounterBill in printUtils.ts) — long
    // enough that it never yanks the iframe out from under an actual native
    // print dialog still open and waiting on the cashier, but still
    // guarantees eventual cleanup if onafterprint never fires.
    window.setTimeout(finish, 60_000);
    setTimeout(() => { try { win.focus(); win.print(); } catch { finish(); } }, 350);
  });
}

// Tries QZ Tray first (silent print straight to whichever named printer is
// configured for this role — 'kot' for the Kitchen ticket, 'bill' for
// everything customer-facing), and only falls back to the manual
// window.print() dialog/iframe pipeline if QZ Tray isn't installed/running
// or no printer has been assigned yet in Printer Setup. This is what makes
// the KOT land on the kitchen printer and the bill land on the counter
// printer automatically, with no change in behavior for anyone who hasn't
// set up QZ Tray yet.
async function printCounterSlip(title: string, bodyHtml: string, role: 'kot' | 'bill' = 'bill') {
  const html = buildSlipDocument(title, bodyHtml);
  const printedViaQz = await printViaQz(role, html);
  if (printedViaQz) return;
  await printCounterSlipViaIframe(title, bodyHtml);
}

// Two/three-column receipt rows MUST use a <table> (not flex/grid divs) — on
// this printer pipeline, plain divs with flex/grid collapse and run text
// together (e.g. "Date: 29/07/26Table 1"), while <table> layout reliably
// stays aligned, exactly like the item table already does.
function kvRow(cells: string[], opts: { bold?: boolean; big?: boolean } = {}): string {
  const tds = cells.map((c, i) => `<td class="${i === cells.length - 1 && cells.length > 1 ? 'r' : ''}">${c}</td>`).join('');
  return `<table class="kv${opts.big ? ' grand' : ''}"><tr class="${opts.bold ? 'b' : ''}">${tds}</tr></table>`;
}

function moneyHtml(value: number): string {
  return `&#8377;${Number(value || 0).toFixed(2)}`;
}

function billNo(order: Order, prefix = ''): string {
  return `${prefix}${String(order.orderNumber).padStart(4, '0')}`;
}

function receiptDate(value?: string) {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime())
    ? { date: '-', time: '-' }
    : {
        date: d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '/'),
        time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
      };
}

function cafeHeader(status: string, slipTitle: string): string {
  return `
    ${status ? `<div class="paid">${safeHtml(status)}</div>` : ''}
    <div class="c">
      <div class="shop">Cafe Aadvikam</div>
      <div>#109/1C, Hosur main Road, Berigai,</div>
      <div>Soolagiri TK, Krishnagiri DT,</div>
      <div>Tamilnadu 635105</div>
      <div class="mt">GST No: 33AAZFV1266C1ZZ</div>
      <div>FSSAI No: 12425011000098</div>
    </div>
    <div class="solid"></div>
    ${slipTitle ? `<div class="c b big">${safeHtml(slipTitle)}</div>` : ''}
  `;
}

function orderItemsRows(order: Pick<Order, 'items'>): string {
  return order.items.map((ci) => {
    const lineAmount = ci.menuItem.price * ci.quantity;
    return `
      <tr class="item-row">
        <td>${safeHtml(ci.menuItem.name)}</td>
        <td class="qty">${ci.quantity}</td>
        <td class="num">${ci.menuItem.price.toFixed(2)}</td>
        <td class="num">${lineAmount.toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

function receiptItemTable(order: Order): string {
  return `
    <table>
      <thead><tr><th>Item</th><th class="qty">Qty.</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
      <tbody>${orderItemsRows(order)}</tbody>
    </table>
  `;
}

function receiptTotals(order: Order, payable: number, extraRows = ''): string {
  const itemsTotal = order.items.reduce((sum, ci) => sum + ci.menuItem.price * ci.quantity, 0);
  const totalQty = order.items.reduce((sum, ci) => sum + ci.quantity, 0);
  const parcelCharges = order.parcelCharges ?? 0;
  // FEATURE (2026-08-30 / Cafe Biller discount + round-off): order.discount
  // now holds the COMBINED discount (manual biller discount + promotion),
  // not just the promotion portion — "Promotion" as a label would misname a
  // purely-manual discount, so this is generic now. Round off is whatever's
  // left after subtracting that combined discount from items+parcel doesn't
  // exactly equal the final whole-rupee `payable` — surface it explicitly
  // rather than let the printed subtotal/discount silently not add up.
  const preRoundOff = itemsTotal + parcelCharges - Number(order.discount || 0);
  const roundOff = Math.round((payable - preRoundOff) * 100) / 100;
  return `
    <div class="solid"></div>
    ${kvRow([`Total Qty: ${totalQty}`, 'Sub Total', itemsTotal.toFixed(2)])}
    ${parcelCharges > 0 ? kvRow(['', 'Parcel', parcelCharges.toFixed(2)]) : ''}
    ${Number(order.discount || 0) > 0 ? kvRow(['', 'Discount', `-${Number(order.discount).toFixed(2)}`]) : ''}
    ${Math.abs(roundOff) >= 0.005 ? kvRow(['', 'Round off', `${roundOff >= 0 ? '+' : ''}${roundOff.toFixed(2)}`]) : ''}
    ${extraRows}
    <div class="solid"></div>
    ${kvRow(['Grand Total', moneyHtml(payable)], { big: true })}
  `;
}

function dateTimeLabel(value?: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Dedicated row renderer for KOT items — uses a FIXED-width quantity column
// (kot-qty, width:56px, table-layout:fixed) so a long item/combo name can
// never squeeze the quantity cell down to nothing or wrap it out of view,
// which is what was happening with the generic shared kvRow() table (its
// columns auto-size to content, so a long dish name could shrink "xN" to an
// almost invisible sliver). Notes now get their own bold/italic line below
// the item instead of being crammed in parentheses on the same line.
function kotItemRow(name: string, quantity: number, notes?: string): string {
  return `<tr><td class="kot-name">${safeHtml(name)}</td><td class="kot-qty">${quantity}</td><td class="kot-note-cell">${notes ? safeHtml(notes) : '--'}</td></tr>`;
}

function kotBody(order: Order): string {
  const dt = receiptDate(order.createdAt);
  const rows = order.items.map(ci => kotItemRow(ci.menuItem.name, ci.quantity, ci.notes)).join('');
  const pickupLabel = order.orderType === 'dine_in'
    ? `Dine In: ${order.tableNumber ? tableLabel(order.tableNumber) : '-'}`
    : 'Pick Up';
  return `
    <div class="kot-slip">
      <div class="c">${safeHtml(dt.date)} ${safeHtml(dt.time)}</div>
      <div class="c kot-title">KOT - ${order.orderNumber}</div>
      <div class="c b">${safeHtml(pickupLabel)}</div>
      <div class="dash"></div>
      <table class="kot-item">
        <!-- BUG FIX (2026-08-19): Qty moved from the last column to the
             middle. The right edge of every line is exactly where a page-
             width overflow (see the body width fix above) clips content
             first — Qty being last meant it was the first thing lost.
             Special Note now sits last instead, since a missing "--" is
             far less costly than a missing quantity. -->
        <thead><tr><th>Item</th><th class="num">Qty.</th><th>Special Note</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function printKotSlip(order: Order) {
  return printCounterSlip(`KOT ${order.orderNumber}`, kotBody(order), 'kot');
}

function billBody(order: Order, copyType: 'original' | 'duplicate' = 'original', cashTendered?: number): string {
  const paidBy = PAYMENT_LABELS_PRINT[order.paymentType] || order.paymentType;
  const breakdownRows = order.paymentBreakdown ? `
    ${kvRow(['Cash', moneyHtml(order.paymentBreakdown.cash || 0)], { bold: true })}
    ${kvRow(['UPI', moneyHtml(order.paymentBreakdown.upi || 0)], { bold: true })}
    ${kvRow(['Card', moneyHtml(order.paymentBreakdown.card || 0)], { bold: true })}
    ${Number(order.paymentBreakdown.wallet || 0) > 0 ? kvRow(['Wallet', moneyHtml(order.paymentBreakdown.wallet || 0)], { bold: true }) : ''}
    ${Number(order.paymentBreakdown.credit || 0) > 0 ? kvRow(['Credit', moneyHtml(order.paymentBreakdown.credit || 0)], { bold: true }) : ''}
  ` : '';
  // Cash Tendered / Change — previously never collected or printed anywhere
  // in cafe billing (unlike SNB/VRSNB branch billing, which already had it).
  // Only shown for a genuine cash overpayment.
  const tenderedRows = order.paymentType === 'cash' && cashTendered != null && cashTendered > order.total
    ? `${kvRow(['Cash Tendered', moneyHtml(cashTendered)], { bold: true })}${kvRow(['Change Returned', moneyHtml(cashTendered - order.total)], { bold: true })}`
    : '';
  const dt = receiptDate(order.createdAt);
  return `
    ${cafeHeader('', copyType === 'duplicate' ? 'DUPLICATE BILL' : '')}
    ${kvRow(['Name:', safeHtml(order.customerName || '')])}
    <div class="solid"></div>
    ${kvRow([`Date: ${safeHtml(dt.date)}`, order.orderType === 'dine_in' ? `Dine In: ${safeHtml(order.tableNumber ? tableLabel(order.tableNumber) : '-')}` : 'Pick Up'])}
    ${kvRow([safeHtml(dt.time), ''])}
    ${kvRow([`Cashier: ${safeHtml(order.billedBy || order.createdBy)}`, `Bill No.: ${safeHtml(billNo(order))}`])}
    <div class="dash"></div>
    ${receiptItemTable(order)}
    ${receiptTotals(order, order.total)}
    ${kvRow([`Paid via ${safeHtml(paidBy)}`, ''])}
    ${breakdownRows}
    ${tenderedRows}
    ${order.walletTransactionId ? kvRow(['Wallet Txn', safeHtml(order.walletTransactionId)]) : ''}
    ${order.walletBalanceRemaining !== undefined ? kvRow(['Wallet Balance', moneyHtml(order.walletBalanceRemaining)], { bold: true }) : ''}
    ${Number(order.walletCashback || 0) > 0 ? kvRow(['Wallet Cashback', moneyHtml(order.walletCashback || 0)], { bold: true }) : ''}
    <div class="solid"></div>
    <div class="thanks">Thank You & Visit Again...!!!</div>
  `;
}

function printPaidBill(order: Order, copyType: 'original' | 'duplicate' = 'original', cashTendered?: number) {
  return printCounterSlip(`Bill ${order.orderNumber}`, billBody(order, copyType, cashTendered));
}

// BUG FIX: this used to merge the KOT and the paid bill into ONE print job
// (KOT section, then a divider, then the bill, all on one slip) — so every
// customer receipt had kitchen prep info printed on it, and there was no way
// to route the KOT to a separate kitchen printer since it was physically
// part of the bill document. The kitchen has its own KOT printer, separate
// from the counter's bill/receipt printer, so these now fire as two
// independent print jobs — the KOT job first (so the kitchen starts prepping
// immediately), then the customer bill — instead of one combined slip.
// Still awaited in sequence (not parallel) so the two jobs can't race each
// other on machines with only one active print queue.
async function printKotThenBill(order: Order, copyType: 'original' | 'duplicate' = 'original', cashTendered?: number) {
  await printKotSlip(order);
  await printPaidBill(order, copyType, cashTendered);
}

function printAdvanceSalesSlip(order: Order, mobile: string, orderDate: string, billPerson: string) {
  const advance = order.advanceAmount ?? 0;
  const fullAmount = order.fullAmount ?? order.subtotal;
  const balance = order.balanceDue ?? Math.max(0, fullAmount - advance);
  const dt = receiptDate(order.createdAt);
  printCounterSlip(`Sales Order ${order.orderNumber}`, `
    ${cafeHeader(balance <= 0 ? 'PAID' : 'ADVANCE PAID', 'SALES ORDER SLIP')}
    ${kvRow(['Name:', safeHtml(order.customerName || '-')])}
    ${kvRow(['Mobile:', safeHtml(mobile || '-')])}
    <div class="solid"></div>
    ${kvRow([`Date: ${safeHtml(orderDate || dt.date)}`, 'Pick UP'])}
    ${kvRow([safeHtml(dt.time), `Bill No.: SO-${safeHtml(billNo(order))}`])}
    ${kvRow([`Cashier: ${safeHtml(billPerson || order.billedBy || order.createdBy)}`, ''])}
    ${kvRow([`Delivery: ${safeHtml(dateTimeLabel(order.deliveryDate))}`, ''])}
    <div class="dash"></div>
    ${receiptItemTable(order)}
    ${receiptTotals(order, fullAmount, `
      ${kvRow(['', 'Tender Amount', advance.toFixed(2)])}
      ${kvRow(['', 'Balance Due', balance.toFixed(2)])}
    `)}
    <div>Paid via ${safeHtml(PAYMENT_LABELS_PRINT[order.advancePaidBy || ''] || order.advancePaidBy || '-')}</div>
    <div>Advances from Sales Order: ${moneyHtml(advance)}</div>
    <div class="solid"></div>
    <div class="thanks">Thank You & Visit Again...!!!</div>
  `);
}

function printAdvanceClosureBill(order: Order, balancePaymentType: string, balancePaidBy: string) {
  const advance = order.advanceAmount ?? 0;
  const fullAmount = order.fullAmount ?? order.subtotal;
  const paidNow = order.balanceDue ?? Math.max(0, fullAmount - advance);
  const dt = receiptDate(new Date().toISOString());
  printCounterSlip(`Advance Closure ${order.orderNumber}`, `
    ${cafeHeader('PAID', 'ADVANCE FINAL BILL')}
    ${kvRow(['Name:', safeHtml(order.customerName || '-')])}
    <div class="solid"></div>
    ${kvRow([`Date: ${safeHtml(dt.date)}`, 'Pick UP'])}
    ${kvRow([safeHtml(dt.time), `Bill No.: ${safeHtml(billNo(order))}`])}
    ${kvRow([`Cashier: ${safeHtml(balancePaidBy)}`, ''])}
    ${kvRow([`Delivery: ${safeHtml(dateTimeLabel(order.deliveryDate))}`, ''])}
    <div class="dash"></div>
    ${receiptItemTable(order)}
    ${receiptTotals(order, fullAmount, `
      ${kvRow(['', 'Advance Paid', advance.toFixed(2)])}
      ${kvRow(['', 'Paid Now', paidNow.toFixed(2)])}
    `)}
    <div>Paid via ${safeHtml(PAYMENT_LABELS_PRINT[balancePaymentType] || balancePaymentType)}</div>
    <div class="solid"></div>
    <div class="thanks">Thank You & Visit Again...!!!</div>
  `);
}

function printCreditBill(order: Order, phone: string, dueDate: string) {
  const dt = receiptDate(order.createdAt);
  printCounterSlip(`Credit Bill ${order.orderNumber}`, `
    ${cafeHeader('CREDIT', 'CREDIT BILL')}
    ${kvRow(['Name:', safeHtml(order.customerName || '-')])}
    ${kvRow(['Mobile:', safeHtml(phone || '-')])}
    ${kvRow(['Due Date:', safeHtml(dueDate || '-')])}
    <div class="solid"></div>
    ${kvRow([`Date: ${safeHtml(dt.date)}`, order.orderType === 'dine_in' ? `TABLE ${order.tableNumber ?? '-'}` : 'Pick UP'])}
    ${kvRow([safeHtml(dt.time), `Bill No.: CR-${safeHtml(billNo(order))}`])}
    ${kvRow([`Cashier: ${safeHtml(order.billedBy || order.createdBy)}`, ''])}
    <div class="dash"></div>
    ${receiptItemTable(order)}
    ${receiptTotals(order, order.total)}
    <div>Payment Details: Credit</div>
    <div>Credit Due: ${moneyHtml(order.total)}</div>
    <div class="solid"></div>
    <div class="thanks">Thank You & Visit Again...!!!</div>
  `);
}

type SourceFilter = 'all' | 'staff' | 'qr';
type DirectPaymentMethod = 'cash' | 'upi' | 'card';
type BillPaymentMethod = DirectPaymentMethod | 'part_payment' | 'wallet';
type SplitPaymentInputs = Record<DirectPaymentMethod, string>;

const EMPTY_CAFE_PROMOTION: PromotionEvaluation = {
  originalSubtotal: 0, eligibleSubtotal: 0, discount: 0, payableSubtotal: 0, cashback: 0,
  applied: [], eligible: [], nearThreshold: null, excludedLines: [], reasons: [],
};

// -- Advance Order Card --------------------------------------------------------
function AdvanceOrderCard({ order }: { order: Order }) {
  // STORE-01 FIX: select only actions - stable refs, avoids re-renders from orders/cart changes
  const { collectBalance, setAdvancePayment, loadOrders } = useOrderStore(
    useShallow(s => ({
      collectBalance: s.collectBalance,
      setAdvancePayment: s.setAdvancePayment,
      loadOrders: s.loadOrders,
    }))
  );
  const { currentUser } = useAuthStore();
  const [showCollect, setShowCollect] = useState(false);
  const [collectMethod, setCollectMethod] = useState<'cash' | 'upi' | 'card' | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const billedBy = currentUser?.displayName || currentUser?.username || '';
  const advance = order.advanceAmount || 0;
  const fullBill = order.fullAmount ?? order.subtotal;
  const balance = order.balanceDue ?? Math.max(0, fullBill - advance);

  const handleCollect = async () => {
    if (!collectMethod) return;
    setCollecting(true);
    try {
      await collectBalance(order.id, collectMethod, billedBy);
      // Refresh from Supabase immediately so a settled advance cannot remain visible
      // because of a stale polling response or another open biller session.
      await loadOrders(60);
      printAdvanceClosureBill(order, collectMethod, billedBy);
      setShowCollect(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to collect payment. Please try again.';
      alert(msg);
    } finally {
      setCollecting(false);
    }
  };

  const PAYMENT_ICONS: Record<string, React.ReactNode> = {
    cash: <Banknote className="size-4" />,
    upi: <Smartphone className="size-4" />,
    card: <CreditCard className="size-4" />,
  };

  return (
    <div className="bg-card rounded-2xl border-2 border-amber-400 overflow-hidden shadow-md shadow-amber-50">
      {/* Header */}
      <div className="bg-amber-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-2xl font-bold text-foreground">
            #{String(order.orderNumber).padStart(3, '0')}
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-body font-bold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-800 border-amber-300">
               Advance Paid
            </span>
            <span className="text-[10px] font-body text-muted-foreground flex items-center gap-1">
              <Clock className="size-3" />{formatTime(order.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {order.deliveryDate && (
            <span className="text-[10px] font-body font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1">
               {new Date(order.deliveryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          )}
          <button onClick={() => setExpanded(!expanded)} className="size-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
            {expanded ? <ChevronDown className="size-4 rotate-180" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      {/* Meta row - customer name */}
      {order.customerName && (
        <div className="px-4 py-2 flex flex-wrap gap-2 text-xs font-body border-b border-border/50">
          <span className="flex items-center gap-1 text-muted-foreground"><UserIcon className="size-3" />{order.customerName}</span>
        </div>
      )}

      {/* Items (collapsible) */}
      {expanded && (
        <div className="px-4 py-3 space-y-1 border-b border-border/50">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-wide mb-2">Items</p>
          {order.items.map(ci => (
            <div key={ci.menuItem.id} className="flex items-center justify-between text-sm">
              <span className="font-body text-foreground">{ci.quantity}x {ci.menuItem.name}</span>
              <span className="font-body font-bold text-primary tabular-nums">{formatCurrency(ci.menuItem.price * ci.quantity)}</span>
            </div>
          ))}
          {order.notes && (
            <p className="mt-2 text-xs font-body bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg">Warning: {order.notes}</p>
          )}
        </div>
      )}

      {/* Payment summary */}
      <div className="px-4 py-3 space-y-2 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-body text-muted-foreground">Total Bill</span>
          <span className="text-sm font-body font-bold tabular-nums">{formatCurrency(fullBill)}</span>
        </div>
        {order.discount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-body text-muted-foreground">Discount</span>
            <span className="text-sm font-body font-bold text-emerald-600 tabular-nums">-{formatCurrency(order.discount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs font-body text-muted-foreground flex items-center gap-1">
            <Wallet className="size-3" />Advance Paid
            {order.advancePaidBy && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold ml-1 uppercase">{order.advancePaidBy}</span>}
          </span>
          <span className="text-sm font-body font-bold text-amber-600 tabular-nums">-{formatCurrency(advance)}</span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <span className="text-sm font-body font-bold text-foreground">Balance Due</span>
          <span className="text-lg font-display font-bold text-red-600 tabular-nums">{formatCurrency(balance)}</span>
        </div>
      </div>

      {/* Collect balance action */}
      {!showCollect ? (
        <div className="px-4 py-3">
          <button
            onClick={() => setShowCollect(true)}
            className="w-full py-3 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
            style={{ background: 'linear-gradient(135deg,#E07A3A,#C84B0A)', color: 'white', boxShadow: '0 4px 16px rgba(200,75,10,0.3)' }}
          >
            <IndianRupee className="size-4" />Collect Balance {formatCurrency(balance)}
          </button>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs font-body font-bold text-foreground">Select payment method for balance:</p>
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'upi', 'card'] as const).map(method => (
              <button
                key={method}
                onClick={() => setCollectMethod(method)}
                className={cn(
                  'flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-body font-bold transition-all active:scale-95',
                  collectMethod === method
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground'
                )}
              >
                {PAYMENT_ICONS[method]}
                {method.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowCollect(false); setCollectMethod(null); }}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-body font-semibold text-foreground active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={handleCollect}
              disabled={!collectMethod || collecting}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-body font-bold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="size-4" />
              {collecting ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// -- Advance Payment Modal (used inside OrderCard area for ready orders) --------
export function AdvancePaymentPanel({ order, onClose }: { order: Order; onClose: () => void }) {
  const { currentUser } = useAuthStore();
  const setAdvancePayment = useOrderStore(s => s.setAdvancePayment);
  const counterOpenedToday = useCafeCounterOpened();
  const [advanceAmt, setAdvanceAmt] = useState('');
  const [method, setMethod] = useState<'cash' | 'upi' | 'card' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const billedBy = currentUser?.displayName || currentUser?.username || '';

  const handleSave = async () => {
    if (!counterOpenedToday) { setError('Counter is not opened. Open Cashier Counter, then Counter Open before collecting payment.'); return; }
    const amt = parseFloat(advanceAmt);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid advance amount'); return; }
    if (amt >= order.total) { setError('Advance must be less than total. Use full payment instead.'); return; }
    if (!method) { setError('Select payment method'); return; }
    setSaving(true);
    try {
      await setAdvancePayment(order.id, amt, method, billedBy);
      onClose();
    } catch {
      setError('Failed to save - please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      {/* PERF FIX: dropped backdrop-blur-sm — expensive to composite on the
          old touchscreen terminal GPUs this modal opens on. */}
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full bg-background rounded-t-3xl shadow-2xl px-5 pt-5 pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-bold">Collect Advance</h2>
            <p className="text-xs font-body text-muted-foreground">Order #{String(order.orderNumber).padStart(3, '0')}  -  Total {formatCurrency(order.total)}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="size-9 rounded-full bg-muted flex items-center justify-center"><X className="size-5 text-muted-foreground" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-body font-bold text-foreground mb-1.5 block">Advance Amount (Rs )</label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="number"
                value={advanceAmt}
                onChange={e => { setAdvanceAmt(e.target.value); setError(''); }}
                placeholder="Enter advance amount"
                className="w-full pl-9 pr-4 py-3 rounded-xl border border-border bg-card text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            {advanceAmt && !isNaN(parseFloat(advanceAmt)) && parseFloat(advanceAmt) > 0 && parseFloat(advanceAmt) < order.total && (
              <p className="text-xs font-body text-muted-foreground mt-1">
                Balance due: <span className="font-bold text-red-600">{formatCurrency(order.total - parseFloat(advanceAmt))}</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-body font-bold text-foreground mb-1.5 block">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'upi', 'card'] as const).map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={cn('flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-body font-bold transition-all active:scale-95',
                    method === m ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground')}>
                  {m === 'cash' ? <Banknote className="size-4" /> : m === 'upi' ? <Smartphone className="size-4" /> : <CreditCard className="size-4" />}
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs font-body text-destructive flex items-center gap-1"><AlertCircle className="size-3" />{error}</p>}
          {!counterOpenedToday && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">
              Counter is not opened today. Open Cashier Counter, then Counter Open first.
            </p>
          )}

          <button onClick={handleSave} disabled={saving}
            className="w-full py-3.5 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#E07A3A,#C84B0A)', color: 'white' }}>
            <Wallet className="size-4" />
            {saving ? 'Saving...' : 'Record Advance Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Advance New Order Panel (menu + cart that submits as advance) -------------
// -- Custom item type (for non-menu items) -------------------------------------
interface CustomLineItem { id: string; name: string; price: number; qty: number; }


function AdvanceOrderPanel({ onCreated, advanceOrders }: { onCreated: () => void; advanceOrders: Order[] }) {
  const { items, loadMenu } = useMenuStore();
  const menuCategories = useMenuCategories();
  // BUG FIX (audit): bound to the dedicated `advanceCart` slice instead of
  // the shared `cart` NewBillPanel uses for its dine-in/takeaway drafts —
  // see the `advanceCart` field comment in orderStore.ts for why sharing one
  // cart between these two permanently-mounted panels was unsafe.
  const { cart, addToCart, updateCartQuantity, clearCart, getCartTotal, getCartCount, submitAdvanceOrder } = useOrderStore(
    useShallow(s => ({
      cart: s.advanceCart,
      addToCart: s.addToAdvanceCart,
      updateCartQuantity: s.updateAdvanceCartQuantity,
      clearCart: s.clearAdvanceCart,
      getCartTotal: s.getAdvanceCartTotal,
      getCartCount: s.getAdvanceCartCount,
      submitAdvanceOrder: s.submitAdvanceOrder,
    }))
  );
  const { currentUser } = useAuthStore();
  const counterOpenedToday = useCafeCounterOpened();

  // Menu picker state
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');

  // Custom items state
  const [customItems, setCustomItems] = useState<CustomLineItem[]>([]);
  const [customName, setCustomName]   = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty]     = useState('1');
  const [customError, setCustomError] = useState('');

  // Order meta
  const todayInput = businessDate();
  const defaultBillPerson = currentUser?.displayName || currentUser?.username || '';
  const [customerName, setCustomerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [orderDate, setOrderDate]       = useState(todayInput);
  const [notes, setNotes]               = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [billPerson, setBillPerson]     = useState(defaultBillPerson);
  const [advanceAmt, setAdvanceAmt]     = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<'cash' | 'upi' | 'card' | null>(null);
  const [isFullPayment, setIsFullPayment] = useState(false);
  const [advanceError, setAdvanceError] = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [showSuccess, setShowSuccess]   = useState(false);
  const [itemMode, setItemMode]         = useState<'menu' | 'custom'>('menu');

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const enabledItems = useMemo(() => items.filter(i => i.enabled), [items]);
  const filteredItems = useMemo(() => {
    let f = enabledItems;
    // When searching: search ALL items regardless of selected category
    if (search.trim()) return f.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    // When browsing: filter by selected category
    if (selectedCategory !== 'all') f = f.filter(i => i.category === selectedCategory);
    return f;
  }, [enabledItems, selectedCategory, search]);

  // Total = menu cart + custom items
  const menuTotal   = getCartTotal();
  const customTotal = customItems.reduce((s, c) => s + c.price * c.qty, 0);
  const total       = menuTotal + customTotal;
  const cartCount   = getCartCount();
  const getQty = (id: string) => cart.find(c => c.menuItem.id === id)?.quantity || 0;

  // -- Add custom item ----------------------------------------------------------
  const handleAddCustomItem = () => {
    const n = customName.trim();
    const p = parseFloat(customPrice);
    const q = parseInt(customQty) || 1;
    if (!n) { setCustomError('Enter item name'); return; }
    if (isNaN(p) || p <= 0) { setCustomError('Enter a valid price'); return; }
    // BUG FIX (audit): the qty field is `<input type="number" min="1">`, but
    // `min` is only a browser hint — this runs from a plain button onClick,
    // not a form submit, so nothing ever enforced it. Typing a negative
    // quantity directly (e.g. -5) created a custom line that subtracted from
    // the bill total instead of adding to it.
    if (isNaN(q) || q <= 0) { setCustomError('Enter a valid quantity'); return; }
    setCustomError('');
    setCustomItems(prev => {
      const existing = prev.find(c => c.name.toLowerCase() === n.toLowerCase());
      if (existing) return prev.map(c => c.name.toLowerCase() === n.toLowerCase() ? { ...c, qty: c.qty + q } : c);
      return [...prev, { id: `custom-${Date.now()}-${Math.random()}`, name: n, price: p, qty: q }];
    });
    setCustomName(''); setCustomPrice(''); setCustomQty('1');
  };

  const updateCustomQty = (id: string, qty: number) => {
    if (qty <= 0) setCustomItems(prev => prev.filter(c => c.id !== id));
    else setCustomItems(prev => prev.map(c => c.id === id ? { ...c, qty } : c));
  };

  const allEmpty = cartCount === 0 && customItems.length === 0;

  // -- Submit -------------------------------------------------------------------
  const handleSubmit = async () => {
    if (allEmpty) return;
    if (!currentUser) return;
    if (!counterOpenedToday) { setAdvanceError('Counter is not opened. Open Cashier Counter, then Counter Open before collecting payment.'); return; }
    if (!customerName.trim()) { setAdvanceError('Customer name is required'); return; }
    if (!mobileNumber.trim()) { setAdvanceError('Mobile number is required'); return; }
    if (!deliveryDate) { setAdvanceError('Delivery date/time is required'); return; }
    // MISSING FIX: validate delivery date is a valid date and is not in the past
    const deliveryMs = new Date(deliveryDate).getTime();
    if (Number.isNaN(deliveryMs)) { setAdvanceError('Delivery date is not a valid date'); return; }
    if (deliveryMs < Date.now() - 60_000) { setAdvanceError('Delivery date must be a future date/time'); return; }
    if (!billPerson.trim()) { setAdvanceError('Bill person is required'); return; }
    if (!isFullPayment) {
      const amt = parseFloat(advanceAmt);
      if (isNaN(amt) || amt <= 0) { setAdvanceError('Enter advance amount'); return; }
      if (amt >= total) { setAdvanceError('Advance must be less than total. Use full payment if paying everything.'); return; }
    }
    if (!advanceMethod) { setAdvanceError('Select payment method'); return; }
    setAdvanceError('');
    setSubmitting(true);

    try {
      for (const ci of customItems) {
        const syntheticItem = { id: ci.id, name: ci.name, price: ci.price, category: 'custom', timing: 'all', enabled: true };
        for (let i = 0; i < ci.qty; i++) addToCart(syntheticItem);
      }
      await new Promise(r => setTimeout(r, 0));
      const advanceNotes = [
        `Mobile: ${mobileNumber.trim()}`,
        `Order date: ${orderDate}`,
        `Bill person: ${billPerson.trim()}`,
        notes.trim() ? `Notes: ${notes.trim()}` : '',
      ].filter(Boolean).join(' | ');
      const orderId = await submitAdvanceOrder({
        orderType: 'takeaway',
        notes: advanceNotes || undefined,
        customerName: customerName.trim(),
        createdBy: billPerson.trim() || currentUser.username,
        advanceAmount: isFullPayment ? total : parseFloat(advanceAmt),
        advancePaidBy: advanceMethod,
        deliveryDate,
        isFullPayment,
      });
      const savedOrder = useOrderStore.getState().orders.find(o => o.id === orderId);
      if (savedOrder) printAdvanceSalesSlip(savedOrder, mobileNumber.trim(), orderDate, billPerson.trim());
      setShowSuccess(true);
      setNotes(''); setCustomerName(''); setMobileNumber(''); setOrderDate(todayInput); setDeliveryDate(''); setBillPerson(defaultBillPerson);
      setAdvanceAmt(''); setAdvanceMethod(null); setIsFullPayment(false);
      setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
      setTimeout(() => { setShowSuccess(false); onCreated(); }, 1800);
    } catch (err) {
      // BUG FIX (audit): submitAdvanceOrder's own catch already restores the
      // cart from its pre-submit snapshot when the insert fails, precisely
      // so a transient error doesn't discard the custom items just added
      // above — this was overriding that restoration and wiping the cart
      // anyway, forcing the biller to re-enter everything.
      setAdvanceError(err instanceof Error ? err.message : 'Failed to submit order - please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-4">
        <div className="size-20 rounded-3xl flex items-center justify-center animate-scale-in"
          style={{ background: 'linear-gradient(135deg,rgba(217,119,6,0.15),rgba(217,119,6,0.08))', border: '2px solid rgba(217,119,6,0.25)' }}>
          <Wallet className="size-10 text-amber-600" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Advance Recorded!</h2>
          <p className="text-muted-foreground font-body mt-1 text-sm">Sales order slip generated. Balance pending collection.</p>
        </div>
      </div>
    );
  }

  const PAYMENT_ICONS = { cash: <Banknote className="size-4" />, upi: <Smartphone className="size-4" />, card: <CreditCard className="size-4" /> };

  return (
    <div className="biller-workspace flex flex-1 min-h-0 overflow-hidden">

      {/* -- COL 1: Category sidebar ---------------------- */}
      {itemMode === 'menu' && (
        <div className="biller-category-sidebar shrink-0 flex flex-col border-r border-border bg-muted/40 overflow-y-auto" style={{ width: "clamp(130px, 13vw, 180px)" }}>
          <div className="biller-category-mode px-2 py-2 border-b border-border bg-background shrink-0">
            <div className="flex gap-1 p-0.5 rounded-lg bg-muted">
              <button onClick={() => setItemMode('menu')}
                className="flex-1 py-2.5 rounded-md text-sm font-body font-bold bg-card shadow text-foreground flex items-center justify-center gap-1.5">
                <UtensilsCrossed className="size-4" />Menu
              </button>
              <button onClick={() => setItemMode('custom')}
                className="flex-1 py-2.5 rounded-md text-sm font-body font-bold text-muted-foreground active:scale-95 flex items-center justify-center gap-1.5">
                <Edit3 className="size-4" />Custom
              </button>
            </div>
          </div>
          {[{ id: 'all', name: 'All Items' }, ...menuCategories].map((cat) => {
            const isActive = selectedCategory === cat.id && !search.trim();
            const catCount = cat.id === 'all'
              ? enabledItems.length
              : enabledItems.filter(i => i.category === cat.id).length;
            return (
              <button key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setSearch(''); }}
                className={cn('biller-category-button w-full text-left px-3 py-3 border-b border-border/50 transition-all',
                  isActive ? 'bg-amber-500 text-white' : 'hover:bg-muted text-foreground')}>
                <p className="text-sm font-bold leading-tight">{cat.name}</p>
                <p className={cn('text-xs mt-0.5 tabular-nums', isActive ? 'text-white/70' : 'text-muted-foreground')}>
                  {catCount} items
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* -- COL 2: Search + Items ------------------------ */}
      <div className="biller-menu-panel flex-1 min-w-0 flex flex-col overflow-hidden">
        {itemMode === 'menu' ? (
          <>
            <div className="biller-search-shell px-3 py-2.5 border-b border-border bg-background shrink-0">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input type="text" placeholder={`Search all ${enabledItems.length} items...`} value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-muted/50 border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:bg-card transition-all" />
                {search && <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button>}
              </div>
              {search.trim() ? (
                <p className="text-[11px] text-amber-600 font-semibold mt-1.5 px-1">
                  {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} across all categories
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
                  {selectedCategory === 'all' ? `${enabledItems.length} items` : `${filteredItems.length} in ${menuCategories.find(c => c.id === selectedCategory)?.name ?? selectedCategory}`}
                </p>
              )}
            </div>
            <div className="biller-item-scroll flex-1 overflow-y-auto px-2 py-2">
              {filteredItems.length === 0 ? (
                <EmptyState icon="" message="No items found" sub="Try a different category or clear your search" cta="Clear filters" onCta={() => { setSearch(''); setSelectedCategory('all'); }} />
              ) : (
                <div className="biller-menu-grid grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))' }}>
                  {filteredItems.map(item => (
                    <MenuItemCard key={item.id} item={item} quantity={getQty(item.id)}
                      onAdd={() => addToCart(item)} onRemove={() => updateCartQuantity(item.id, getQty(item.id) - 1)} compact hideImage />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="flex gap-1 p-1 rounded-xl bg-muted">
              <button onClick={() => setItemMode('menu')}
                className="flex-1 py-2 rounded-lg text-sm font-body font-semibold text-muted-foreground active:scale-95 flex items-center justify-center gap-1.5">
                <UtensilsCrossed className="size-3.5" />Menu Items
              </button>
              <button onClick={() => setItemMode('custom')}
                className="flex-1 py-2 rounded-lg text-sm font-body font-semibold bg-card shadow text-foreground flex items-center justify-center gap-1.5">
                <Edit3 className="size-3.5" />Custom Items
              </button>
            </div>
            <div className="bg-card border border-amber-200/60 rounded-2xl p-4 space-y-3 shadow-soft"
              style={{ background: 'linear-gradient(135deg,rgba(251,191,36,0.04),rgba(251,191,36,0.02))' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="size-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(217,119,6,0.15)' }}>
                  <Edit3 className="size-3.5 text-amber-600" />
                </div>
                <p className="text-sm font-body font-bold text-foreground">Add Custom Item</p>
              </div>
              <div>
                <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                  Item Name <span className="text-destructive">*</span>
                </label>
                <input type="text" placeholder="e.g. Special Cake, Custom Parcel..." value={customName}
                  onChange={e => { setCustomName(e.target.value); setCustomError(''); }}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:bg-card transition-all"
                  onKeyDown={e => e.key === 'Enter' && handleAddCustomItem()} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                    Price (Rs ) <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <input type="number" min="0" step="0.5" placeholder="0.00" value={customPrice}
                      onChange={e => { setCustomPrice(e.target.value); setCustomError(''); }}
                      className="w-full pl-8 pr-3 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:bg-card transition-all"
                      onKeyDown={e => e.key === 'Enter' && handleAddCustomItem()} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Qty</label>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCustomQty(q => String(Math.max(1, parseInt(q || '1') - 1)))}
                      aria-label="Decrease quantity"
                      className="size-10 shrink-0 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90"><Minus className="size-3.5" /></button>
                    <input type="number" min="1" value={customQty} onChange={e => setCustomQty(e.target.value)}
                      className="flex-1 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:bg-card transition-all" />
                    <button onClick={() => setCustomQty(q => String((parseInt(q || '1')) + 1))}
                aria-label="Increase quantity"
                      className="size-10 shrink-0 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90"><Plus className="size-3.5" /></button>
                  </div>
                </div>
              </div>
              {customError && (
                <p className="text-xs font-body text-destructive flex items-center gap-1.5">
                  <AlertCircle className="size-3 shrink-0" />{customError}
                </p>
              )}
              <button onClick={handleAddCustomItem}
                className="w-full py-3 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all text-white"
                style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)', boxShadow: '0 4px 16px rgba(217,119,6,0.3)' }}>
                <Plus className="size-4" />Add to Bill
              </button>
            </div>
            {customItems.length > 0 ? (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-soft">
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between" style={{ background: 'rgba(217,119,6,0.06)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-body font-bold text-amber-700">Custom Items Added</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{customItems.length}</span>
                  </div>
                  <button onClick={() => setCustomItems([])} className="text-xs font-body font-semibold text-destructive active:opacity-70">Clear all</button>
                </div>
                <div className="divide-y divide-border/50">
                  {customItems.map(ci => (
                    <div key={ci.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-body font-semibold text-foreground truncate">{ci.name}</p>
                        <p className="text-xs font-body text-muted-foreground tabular-nums">
                          {formatCurrency(ci.price)} x {ci.qty} = <span className="font-bold text-amber-600">{formatCurrency(ci.price * ci.qty)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => updateCustomQty(ci.id, ci.qty - 1)} className="size-7 rounded-lg bg-muted flex items-center justify-center active:scale-90 border border-border"><Minus className="size-3" /></button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">{ci.qty}</span>
                        <button onClick={() => updateCustomQty(ci.id, ci.qty + 1)} className="size-7 rounded-lg flex items-center justify-center active:scale-90 text-white"
                          style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)' }}><Plus className="size-3" /></button>
                        <button onClick={() => updateCustomQty(ci.id, 0)} className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 border border-destructive/20 ml-0.5"><Trash2 className="size-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                  <Edit3 className="size-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-body text-muted-foreground">No custom items added yet.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* -- COL 3: Cart + Advance form --------------------- */}
      <div className="biller-cart-panel shrink-0 flex flex-col border-l border-border bg-card overflow-hidden" style={{ width: "clamp(320px, 26vw, 420px)" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0" style={{ background: 'rgba(217,119,6,0.06)' }}>
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-amber-600" />
            <h3 className="font-display font-bold text-lg text-foreground">Advance Bill</h3>
            {!allEmpty && <span className="text-xs font-body font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{cartCount + customItems.length}</span>}
          </div>
          {!allEmpty && (
            <button onClick={() => { clearCart(); setCustomItems([]); }}
              className="text-xs font-body font-semibold text-destructive bg-destructive/10 px-2.5 py-1 rounded-lg active:scale-95 border border-destructive/15">
              Clear
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="biller-cart-items flex-1 overflow-y-auto min-h-0 px-4 py-2 space-y-2">
          {allEmpty ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground gap-2">
              <ShoppingBag className="size-7 opacity-25" />
              <p className="text-sm font-body">Add menu or custom items</p>
            </div>
          ) : (
            <>
              {cart.map(ci => (
                <div key={ci.menuItem.id} className="flex items-center gap-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-body font-semibold truncate leading-tight">{ci.menuItem.name}</p>
                    <p className="text-sm text-primary font-bold tabular-nums">{formatCurrency(ci.menuItem.price * ci.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateCartQuantity(ci.menuItem.id, ci.quantity - 1)} className="size-6 rounded-lg bg-muted flex items-center justify-center active:scale-90 border border-border"><Minus className="size-3" /></button>
                    <span className="w-5 text-center text-xs font-bold tabular-nums">{ci.quantity}</span>
                    <button onClick={() => addToCart(ci.menuItem)} className="size-6 rounded-lg text-primary-foreground flex items-center justify-center active:scale-90"
                      style={{ background: 'linear-gradient(135deg,hsl(164 52% 32%),hsl(164 52% 22%))' }}><Plus className="size-3" /></button>
                    <button onClick={() => updateCartQuantity(ci.menuItem.id, 0)} className="size-6 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 ml-0.5 border border-destructive/15"><Trash2 className="size-3" /></button>
                  </div>
                </div>
              ))}
              {customItems.map(ci => (
                <div key={ci.id} className="flex items-center gap-2 py-1.5 border-l-2 border-amber-400 pl-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-base font-body font-semibold truncate leading-tight">{ci.name}</p>
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">CUSTOM</span>
                    </div>
                    <p className="text-sm text-amber-600 font-bold tabular-nums">{formatCurrency(ci.price * ci.qty)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateCustomQty(ci.id, ci.qty - 1)} className="size-6 rounded-lg bg-muted flex items-center justify-center active:scale-90 border border-border"><Minus className="size-3" /></button>
                    <span className="w-5 text-center text-xs font-bold tabular-nums">{ci.qty}</span>
                    <button onClick={() => updateCustomQty(ci.id, ci.qty + 1)} className="size-6 rounded-lg text-white flex items-center justify-center active:scale-90"
                      style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)' }}><Plus className="size-3" /></button>
                    <button onClick={() => updateCustomQty(ci.id, 0)} className="size-6 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 ml-0.5 border border-destructive/15"><Trash2 className="size-3" /></button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Advance form + pending - fixed bottom */}
        <div className="biller-cart-footer border-t border-border shrink-0">
          {!allEmpty && (
            <div className="px-4 py-3 space-y-3 bg-muted/20">
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input type="text" placeholder="Customer name *" value={customerName} onChange={e => { setCustomerName(e.target.value); setAdvanceError(''); }}
                    className="w-full pl-8 pr-3 py-3 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
                </div>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input type="tel" placeholder="Mobile number *" value={mobileNumber} onChange={e => { setMobileNumber(e.target.value); setAdvanceError(''); }}
                    className="w-full pl-8 pr-3 py-3 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-body font-bold text-blue-700 uppercase tracking-widest mb-1.5 block flex items-center gap-1">
                    <Calendar className="size-3" /> Order Date
                  </label>
                  <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                    className="w-full px-3 py-3 bg-card border border-border rounded-xl text-sm font-body focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-body font-bold text-blue-700 uppercase tracking-widest mb-1.5 block flex items-center gap-1">
                    <Calendar className="size-3" /> Delivery Date/Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={deliveryDate}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={e => { setDeliveryDate(e.target.value); setAdvanceError(''); }}
                    className={cn(
                      'w-full px-3 py-3 bg-card border rounded-xl text-sm font-body focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all',
                      !deliveryDate ? 'border-red-300 ring-1 ring-red-200' : 'border-border'
                    )}
                  />
                </div>
              </div>

              <div className="relative">
                <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input type="text" placeholder="Bill person *" value={billPerson} onChange={e => { setBillPerson(e.target.value); setAdvanceError(''); }}
                  className="w-full pl-8 pr-3 py-3 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
              </div>

              <div className="relative">
                <StickyNote className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                <textarea placeholder="Order notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full pl-8 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
              </div>

              <div className="pt-2 border-t border-border space-y-3">
                <div className="space-y-1">
                  {menuTotal > 0 && (
                    <div className="flex justify-between text-xs font-body text-muted-foreground">
                      <span>Menu</span><span className="tabular-nums">{formatCurrency(menuTotal)}</span>
                    </div>
                  )}
                  {customTotal > 0 && (
                    <div className="flex justify-between text-xs font-body text-amber-600">
                      <span>Custom</span><span className="tabular-nums">{formatCurrency(customTotal)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <span className="font-body text-sm font-bold text-foreground">Total</span>
                    <span className="font-display text-2xl font-bold text-foreground tabular-nums">{formatCurrency(total)}</span>
                  </div>
                </div>

                {/* Full Payment Toggle */}
                <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="flex flex-col">
                    <span className="text-xs font-body font-bold text-emerald-800">Full Payment Now?</span>
                    <span className="text-[10px] font-body text-emerald-600">Customer pays the entire bill upfront</span>
                  </div>
                  <button
                    onClick={() => { setIsFullPayment(p => !p); setAdvanceError(''); }}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors shrink-0',
                      isFullPayment ? 'bg-emerald-500' : 'bg-muted border border-border'
                    )}
                  >
                    <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform', isFullPayment ? 'translate-x-5' : 'translate-x-0.5')} />
                  </button>
                </div>

                {/* Advance Amount - hidden when full payment */}
                {!isFullPayment && (
                  <div>
                    <label className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-widest mb-1.5 block">Advance Amount (Rs ) *</label>
                    <div className="relative">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <input type="number" value={advanceAmt} onChange={e => { setAdvanceAmt(e.target.value); setAdvanceError(''); }}
                        placeholder="Enter advance amount"
                        className="w-full pl-8 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-all" />
                    </div>
                    {advanceAmt && !isNaN(parseFloat(advanceAmt)) && parseFloat(advanceAmt) > 0 && parseFloat(advanceAmt) < total && (
                      <div className="flex justify-between mt-1.5 px-1">
                        <span className="text-[11px] font-body text-muted-foreground">Balance due</span>
                        <span className="text-[11px] font-body font-bold text-red-600 tabular-nums">{formatCurrency(total - parseFloat(advanceAmt))}</span>
                      </div>
                    )}
                  </div>
                )}
                {isFullPayment && (
                  <div className="flex justify-between px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-xs font-body text-emerald-700">Paying in full</span>
                    <span className="text-sm font-body font-bold text-emerald-700 tabular-nums">{formatCurrency(total)}</span>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-widest mb-1.5 block">Payment Method *</label>
                  <div className="biller-menu-grid grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))' }}>
                    {(['cash', 'upi', 'card'] as const).map(m => (
                      <button key={m} onClick={() => { setAdvanceMethod(m); setAdvanceError(''); }}
                        className={cn('flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-[11px] font-body font-bold transition-all active:scale-95',
                          advanceMethod === m ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-border bg-card text-muted-foreground')}>
                        {PAYMENT_ICONS[m]}{m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                {advanceError && (
                  <p className="text-xs font-body text-destructive flex items-center gap-1.5">
                    <AlertCircle className="size-3 shrink-0" />{advanceError}
                  </p>
                )}
                <button onClick={handleSubmit} disabled={submitting}
                  className="w-full py-3.5 rounded-xl font-body font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-white"
                  style={{ background: isFullPayment ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#b8860b,#E07A3A)', boxShadow: isFullPayment ? '0 4px 16px rgba(22,163,74,0.35)' : '0 4px 16px rgba(184,134,11,0.35)' }}>
                  {isFullPayment ? <CheckCircle2 className="size-4" /> : <Wallet className="size-4" />}
                  {submitting ? 'Saving...' : isFullPayment ? 'Record Full Payment' : 'Record Advance Order'}
                </button>
              </div>
            </div>
          )}
          {advanceOrders.length > 0 && (
            <div className="border-t-4 border-amber-200">
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: 'rgba(251,191,36,0.08)' }}>
                <div className="flex items-center gap-2">
                  <Clock className="size-3.5 text-amber-600" />
                  <span className="text-xs font-body font-bold text-amber-800">Pending Balance</span>
                </div>
                <span className="text-[10px] font-body font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
                  {advanceOrders.length} order{advanceOrders.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {advanceOrders.map(order => <AdvanceOrderCard key={order.id} order={order} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewBillPanel() {
  // BUG FIX: this panel references `currentUser` in handleSendToKitchen,
  // handleCancelTable, handleSubmit (credit/wallet/regular checkout) — 24
  // usages total — but never actually called useAuthStore() to get it. Same
  // class of bug already caught in production for `counterOpenedToday` in
  // this exact component (see client_error_events: "counterOpenedToday is
  // not defined" at /billing). Left unfixed, Send to Kitchen / Create Bill /
  // Cancel Table would throw "currentUser is not defined" the moment any of
  // them actually ran.
  const { currentUser } = useAuthStore();
  const { items, loadMenu } = useMenuStore();
  const menuCategories = useMenuCategories();
  const { orders, cart, addToCart, updateCartQuantity, clearCart, setCart, getCartTotal, getCartCount, submitOrder, loadOrders, setPaymentType, updateOrderStatus } = useOrderStore(
    useShallow(s => ({
      orders: s.orders,
      cart: s.cart,
      addToCart: s.addToCart,
      updateCartQuantity: s.updateCartQuantity,
      clearCart: s.clearCart,
      setCart: s.setCart,
      getCartTotal: s.getCartTotal,
      getCartCount: s.getCartCount,
      submitOrder: s.submitOrder,
      loadOrders: s.loadOrders,
      setPaymentType: s.setPaymentType,
      updateOrderStatus: s.updateOrderStatus,
    }))
  );

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [itemMode, setItemMode] = useState<'menu' | 'custom'>('menu');
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  // FEATURE (2026-08-08): "remove the parcel charges and add a button - and +
  // should appear and its should show the number for each one number added
  // the additional 10 rs should be added to the takeaway bill" — parcel
  // charge used to be auto-computed from total item quantity, which doesn't
  // match reality (a customer might want 2 items packed into 1 parcel, or
  // vice versa). Replaced with a manual +/- counter, takeaway-only.
  const [parcelCount, setParcelCount] = useState(0);
  useEffect(() => { if (orderType !== 'takeaway') setParcelCount(0); }, [orderType]);

  // TABLE-SYNC FIX: orders placed by the Order Pad (order-taker staff) or by a
  // customer scanning the table's QR code go through submitOrder() and land in
  // the shared `orders` table with status pending/preparing/ready — a totally
  // separate row from the "running" table-tab this screen builds via
  // start_table_order_v1/add_items_to_table_order_v1. Previously the biller had
  // no way to see these here at all (Table N looked "free" even though the
  // kitchen already had an order for it). We now surface them directly inside
  // the table/takeaway views below so they can't be missed or double-entered.
  // BUG FIX: these three useMemo blocks must come AFTER orderType/tableNumber
  // are declared above — an earlier version placed them directly below the
  // store selector (before the useState calls), which is a temporal-dead-zone
  // violation ("Cannot access 'orderType' before initialization", minified to
  // "Cannot access 'b' before initialization" in production). The dependency
  // array `[orders, orderType, tableNumber]` is evaluated synchronously as
  // this line runs, so both variables must already be initialized by then.
  // BUG FIX: these three filters only checked kitchen status, not payment
  // status. setPaymentType() (used by the single-order payment flow and, until
  // the fix above, the combine-bill flow) can stamp an order as paid without
  // ever moving it out of pending/preparing/ready - so a paid order whose
  // kitchen status never advanced would show up as "waiting" on this table
  // forever, even though it's already been billed. Two orders on Table 1 were
  // found stuck exactly this way. Adding the paymentType==='unpaid' check
  // here (already used by the combine-bill flow's own freshIncoming filter)
  // means an already-paid order can never re-appear as an incoming/waiting
  // order again, regardless of what state its kitchen status is stuck in.
  const incomingByTable = useMemo(() => {
    const map: Record<number, number> = {};
    for (const o of orders) {
      if (o.orderType !== 'dine_in' || o.tableNumber == null) continue;
      if (o.orderSource !== 'staff' && o.orderSource !== 'qr') continue;
      if (o.status !== 'pending' && o.status !== 'preparing' && o.status !== 'ready') continue;
      if (o.paymentType !== 'unpaid') continue;
      map[o.tableNumber] = (map[o.tableNumber] || 0) + o.items.reduce((s, i) => s + i.quantity, 0);
    }
    return map;
  }, [orders]);

  const incomingTableOrders = useMemo(() => {
    if (orderType !== 'dine_in' || tableNumber == null) return [];
    return orders.filter(o =>
      o.orderType === 'dine_in' &&
      o.tableNumber === tableNumber &&
      (o.orderSource === 'staff' || o.orderSource === 'qr') &&
      (o.status === 'pending' || o.status === 'preparing' || o.status === 'ready') &&
      o.paymentType === 'unpaid'
    );
  }, [orders, orderType, tableNumber]);

  const incomingTakeawayOrders = useMemo(() => orders.filter(o =>
    o.orderType === 'takeaway' &&
    (o.orderSource === 'staff' || o.orderSource === 'qr') &&
    (o.status === 'pending' || o.status === 'preparing' || o.status === 'ready') &&
    o.paymentType === 'unpaid'
  ), [orders]);

  // -- Multi-order drafts ------------------------------------------------------
  // Dine-in: each table keeps its own unsent cart while staff hops between
  // tables. Takeaway: each "ticket" is an independent unsent order so a new
  // walk-in doesn't wipe out one already being entered.
  type Draft = { cart: CartItem[]; customItems: CustomLineItem[] };
  const [tableDrafts, setTableDrafts] = useState<Record<number, Draft>>({});
  const [takeawayTickets, setTakeawayTickets] = useState<{ id: string; label: string; cart: CartItem[]; customItems: CustomLineItem[] }[]>([]);
  const [activeTakeawayId, setActiveTakeawayId] = useState<string | null>(null);
  const nextTakeawayNo = useRef(1);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [tableError, setTableError] = useState(false);
  // CART-VISIBILITY FIX: the table grid used to always render fully expanded
  // (30 buttons), pushing the actual cart items off-screen below it on
  // narrower/stacked layouts — staff had no way to see what was in the bill
  // without scrolling past the entire table board first. Collapsed to a
  // dropdown-style picker (closed by default) to match the pattern already
  // used for table selection in the staff Order Pad (OrderCart.tsx) and the
  // customer QR ordering page (QROrderPage.tsx), so the cart is visible
  // immediately.
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  // FEATURE (2026-08-08): "when I click on dine in i should get a small box
  // to select G or A. if I select G then it should show G1 to G15 and same
  // If I select A then it should show A1 to A15." TABLE_NUMBERS is a flat
  // 1-30 list — table_number stays a plain integer in the database and every
  // RPC/print path untouched; G1-G15 map to table_number 1-15 and A1-A15 map
  // to 16-30, so this is purely a two-step picker + display label on top of
  // the existing numbering, nothing schema-side changes.
  const [tableSection, setTableSection] = useState<'G' | 'A' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [billMethod, setBillMethod] = useState<BillPaymentMethod>('cash');
  const [splitPayment, setSplitPayment] = useState<SplitPaymentInputs>({ cash: '', upi: '', card: '' });
  // Cash Tendered / Change — was never collected anywhere in cafe billing at
  // all (SNB/VRSNB branch billing already has this; cafe didn't). Only
  // meaningful for a straight cash payment.
  const [cashTendered, setCashTendered] = useState('');
  // FEATURE (2026-08-30): "no option for providing the discount" — Cafe
  // Biller had promotion-based auto discounts but no manual biller-entered
  // discount, unlike Branch Billing Pro (SNB/VRSNB/Hosur) which already has
  // a % / flat discount picker. Mirrors that same shape (type + raw value);
  // the ₹ amount is derived below and re-derived server-side by every
  // checkout RPC — never trusted as a client-computed number for money.
  const [manualDiscountType, setManualDiscountType] = useState<'percentage' | 'flat'>('percentage');
  const [manualDiscountValue, setManualDiscountValue] = useState('');

  // Credit sale state
  const [paymentMode, setPaymentMode] = useState<'regular' | 'credit' | 'wallet'>('regular');
  const [selectedWallet, setSelectedWallet] = useState<WalletCustomer | null>(null);
  const [walletAmount, setWalletAmount] = useState(0);
  const [walletOtherMode, setWalletOtherMode] = useState<WalletOtherMode>(null);
  const [walletAuthorizationSecret, setWalletAuthorizationSecret] = useState('');
  const [promotionEvaluation, setPromotionEvaluation] = useState<PromotionEvaluation>(EMPTY_CAFE_PROMOTION);
  const [couponCode, setCouponCode] = useState('');
  const checkoutIdempotencyRef = useRef<string | null>(null);
  const [creditCustomerPhone, setCreditCustomerPhone] = useState('');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [creditError, setCreditError] = useState('');

  // Custom items
  const [customItems, setCustomItems] = useState<CustomLineItem[]>([]);
  const [customName, setCustomName]   = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty]     = useState('1');
  const [customError, setCustomError] = useState('');
  const [submitError, setSubmitError] = useState('');

  // BUG FIX: this panel reads `counterOpenedToday` (openBillModal, handleSubmit,
  // and the "counter not opened" banner below) but never actually called the
  // hook itself — every other panel in this file (BillerCreditTab,
  // AdvanceOrderPanel, BillingDashboard) does. Confirmed in production error
  // logs as a "counterOpenedToday is not defined" ReferenceError on /billing.
  const counterOpenedToday = useCafeCounterOpened();

  // -- Running table order (KOT) state ----------------------------------------
  // A dine-in table can accumulate items across several "Send to Kitchen"
  // actions (each prints a KOT) before one final "Bill & Print" closes it out.
  const [runningOrder, setRunningOrder] = useState<Order | null>(null);
  const [runningOrderLoading, setRunningOrderLoading] = useState(false);
  const [sendingKot, setSendingKot] = useState(false);
  const [kotSuccess, setKotSuccess] = useState<number | null>(null);

  const refreshRunningOrder = useCallback(async (table: number | null) => {
    if (!table) { setRunningOrder(null); return; }
    setRunningOrderLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('table_number', table)
        .eq('order_type', 'dine_in')
        .eq('status', 'running')
        .maybeSingle();
      if (error) throw error;
      setRunningOrder(data ? dbRowToOrder(data as Record<string, unknown>) : null);
    } catch {
      // Table view still usable even if this lookup fails; the button below
      // will surface a clear error if the table really is already running.
      setRunningOrder(null);
    } finally {
      setRunningOrderLoading(false);
    }
  }, []);

  useEffect(() => {
    if (orderType === 'dine_in') void refreshRunningOrder(tableNumber);
    else setRunningOrder(null);
  }, [orderType, tableNumber, refreshRunningOrder]);

  const runningItemCount = runningOrder?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  // -- Table Board: live status of every table (Free / Running + item count) --
  const [tableBoard, setTableBoard] = useState<Record<number, number>>({});
  const loadTableBoard = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_running_table_orders_v1');
      if (error) throw error;
      const board: Record<number, number> = {};
      (data as Record<string, unknown>[] ?? []).forEach((row) => {
        const t = row.table_number as number | null;
        if (!t) return;
        const items = (row.items as { quantity: number }[] | null) ?? [];
        board[t] = items.reduce((s, i) => s + (i.quantity || 0), 0);
      });
      setTableBoard(board);
    } catch {
      setTableBoard({});
    }
  }, []);
  useEffect(() => { void loadTableBoard(); }, [loadTableBoard]);

  const captureDraft = (): Draft => ({ cart, customItems });

  const clearTableDraft = (num: number) => {
    setTableDrafts((prev) => {
      if (!(num in prev)) return prev;
      const next = { ...prev };
      delete next[num];
      return next;
    });
  };

  const switchTable = useCallback((num: number) => {
    setTableDrafts((prev) => ({ ...prev, ...(tableNumber != null ? { [tableNumber]: captureDraft() } : {}) }));
    const incoming = tableNumber === num ? captureDraft() : (tableDrafts[num] ?? { cart: [], customItems: [] });
    setCart(incoming.cart);
    setCustomItems(incoming.customItems);
    setTableNumber(num);
    setTableError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableNumber, tableDrafts, cart, customItems]);

  const switchTakeawayTicket = useCallback((id: string) => {
    setTakeawayTickets((prev) => prev.map((t) => t.id === activeTakeawayId ? { ...t, cart, customItems } : t));
    const incoming = activeTakeawayId === id ? { cart, customItems } : takeawayTickets.find((t) => t.id === id);
    setCart(incoming?.cart ?? []);
    setCustomItems(incoming?.customItems ?? []);
    setActiveTakeawayId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTakeawayId, takeawayTickets, cart, customItems]);

  // Any items sitting in the cart with no ticket yet (staff added items
  // before tapping "New") get promoted into their own ticket instead of
  // being silently dropped when a second ticket is started.
  const newTakeawayTicket = useCallback(() => {
    const newId = globalThis.crypto?.randomUUID?.() ?? `tw-${Date.now()}`;
    setTakeawayTickets((prev) => {
      let next = prev;
      if (activeTakeawayId) {
        next = next.map((t) => t.id === activeTakeawayId ? { ...t, cart, customItems } : t);
      } else if (cart.length > 0 || customItems.length > 0) {
        next = [...next, { id: `tw-carry-${Date.now()}`, label: `Order ${nextTakeawayNo.current++}`, cart, customItems }];
      }
      return [...next, { id: newId, label: `Order ${nextTakeawayNo.current++}`, cart: [], customItems: [] }];
    });
    setCart([]); setCustomItems([]);
    setActiveTakeawayId(newId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTakeawayId, cart, customItems]);

  const switchOrderType = useCallback((type: OrderType) => {
    if (type === orderType) return;
    setTablePickerOpen(false);
    if (orderType === 'dine_in' && tableNumber != null) {
      setTableDrafts((prev) => ({ ...prev, [tableNumber]: captureDraft() }));
    } else if (orderType === 'takeaway') {
      if (activeTakeawayId) {
        setTakeawayTickets((prev) => prev.map((t) => t.id === activeTakeawayId ? { ...t, cart, customItems } : t));
      } else if (cart.length > 0 || customItems.length > 0) {
        // Leaving takeaway with unticketed items in progress — keep them
        // as a ticket rather than losing them.
        setTakeawayTickets((prev) => [...prev, { id: `tw-carry-${Date.now()}`, label: `Order ${nextTakeawayNo.current++}`, cart, customItems }]);
      }
    }
    if (type === 'takeaway') {
      if (activeTakeawayId) {
        const t = takeawayTickets.find((x) => x.id === activeTakeawayId);
        setCart(t?.cart ?? []); setCustomItems(t?.customItems ?? []);
      } else {
        setCart([]); setCustomItems([]);
      }
    } else if (tableNumber != null) {
      const d = tableDrafts[tableNumber];
      setCart(d?.cart ?? []); setCustomItems(d?.customItems ?? []);
    } else {
      setCart([]); setCustomItems([]);
    }
    setOrderType(type);
    setTableError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType, tableNumber, activeTakeawayId, takeawayTickets, tableDrafts, cart, customItems]);

  const closeActiveTakeawayTicket = () => {
    if (orderType !== 'takeaway' || !activeTakeawayId) return;
    setTakeawayTickets((prev) => prev.filter((t) => t.id !== activeTakeawayId));
    setActiveTakeawayId(null);
  };

  const [cancellingTable, setCancellingTable] = useState(false);
  const handleCancelTable = async () => {
    if (!runningOrder || !tableNumber || !currentUser) return;
    if (!window.confirm(`Cancel this table's order? All ${runningItemCount} item(s) already sent to the kitchen will be voided. This cannot be undone.`)) return;
    setCancellingTable(true);
    try {
      const billedBy = currentUser.displayName || currentUser.username;
      const { error } = await supabase.rpc('cancel_running_table_order_v1', {
        p_order_id: runningOrder.id,
        p_cancelled_by: billedBy,
        p_reason: 'Cancelled from billing dashboard',
      });
      if (error) throw new Error(error.message);
      clearTableDraft(tableNumber);
      setRunningOrder(null);
      clearCart();
      setParcelCount(0);
      setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
      void loadTableBoard();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to cancel this table.');
    } finally {
      setCancellingTable(false);
    }
  };

  // FEATURE (2026-08-19): "unable to cancel a single item once sent to
  // kitchen — only the whole order." The already-sent items list above was
  // deliberately read-only (see its own comment) since there was previously
  // no way to safely remove just one line without a dedicated RPC — voiding
  // the whole table's order was the only option. remove_item_from_table_
  // order_v1 fills that gap; this mirrors handleCancelTable's pattern
  // (confirm, call RPC, update local state, refresh the table board) at the
  // scope of a single item instead of the whole order.
  const [cancellingItemName, setCancellingItemName] = useState<string | null>(null);
  const handleCancelRunningItem = async (itemName: string) => {
    if (!runningOrder || !currentUser) return;
    if (!window.confirm(`Cancel "${itemName}" from this order? It was already sent to the kitchen — this cannot be undone.`)) return;
    setCancellingItemName(itemName);
    try {
      const removedBy = currentUser.displayName || currentUser.username;
      const { error } = await supabase.rpc('remove_item_from_table_order_v1', {
        p_order_id: runningOrder.id,
        p_item_name: itemName,
        p_removed_by: removedBy,
        p_reason: 'Removed from billing dashboard',
      });
      if (error) {
        if (error.message?.includes('LAST_ITEM_USE_CANCEL_ORDER')) {
          setSubmitError(`"${itemName}" is the only item left on this order — use "Cancel Table" to cancel the whole order instead.`);
        } else {
          throw new Error(error.message);
        }
        return;
      }
      setRunningOrder(prev => prev ? {
        ...prev,
        items: (() => {
          const idx = prev.items.findIndex(ci => ci.menuItem.name.trim().toLowerCase() === itemName.trim().toLowerCase());
          if (idx === -1) return prev.items;
          return [...prev.items.slice(0, idx), ...prev.items.slice(idx + 1)];
        })(),
      } : prev);
      void loadTableBoard();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : `Failed to cancel "${itemName}".`);
    } finally {
      setCancellingItemName(null);
    }
  };

  // FEATURE (2026-08-10): "employees will make mistake in table selection
  // and place order... option to move items to different table... complete
  // items to move to different tab" — researched Petpooja's own table
  // move/merge pattern (a moved order carries its running bill with it; an
  // occupied destination triggers a merge-confirmation rather than a silent
  // overwrite or a hard block) and modeled this on it.
  //
  // Two scopes, both reachable through one "Move" button + the same G/A
  // section-then-grid picker already used for table selection above:
  //  1. scope 'table' — moves the WHOLE table: the running KOT order plus
  //     any Order Pad/QR orders still waiting on it, plus any unsent draft
  //     items typed but not yet sent. table_number is simply repointed to
  //     the destination for every relevant `orders` row (RLS on `orders` is
  //     fully open, so a plain client update is enough — no new RPC).
  //     Afterwards the source table is free (nothing references it anymore)
  //     and the destination is "blocked" for a separate new bill for free,
  //     because this app already only ever allows one running order per
  //     table — exactly the existing single-row-per-table architecture
  //     `refreshRunningOrder`/`get_running_table_orders_v1` already enforce.
  //  2. scope 'item' — moves a SINGLE line item that's still sitting in the
  //     unsent draft cart (caught before "Send to Kitchen" was pressed) to a
  //     different table's draft. Purely client-side (tableDrafts), no DB
  //     write needed. Items already sent to the kitchen are intentionally
  //     NOT splittable one-by-one here — carving up a ticket the kitchen
  //     already has would let the KOT and the bill disagree about what was
  //     made. Use the whole-table move for those instead.
  const [movingTable, setMovingTable] = useState(false);
  const [moveTarget, setMoveTarget] = useState<
    | { scope: 'table' }
    | { scope: 'item'; itemKind: 'menu' | 'custom'; itemId: string }
    | { scope: 'draft' }
    | null
  >(null);
  const [moveSection, setMoveSection] = useState<'G' | 'A' | null>(null);

  const closeMovePicker = () => { setMoveTarget(null); setMoveSection(null); };

  const handleMoveTable = async (destTable: number) => {
    if (!runningOrder || !tableNumber || !currentUser || destTable === tableNumber) return;
    // BUG FIX (audit 2026-08-10): a destination table that already has its
    // own RUNNING order (tableBoard[destTable] set) must never be allowed
    // through here — this only ever repoints table_number on the existing
    // rows, it never merges/removes the destination's own running order
    // first. Doing so would leave TWO rows with status='running' for the
    // same table_number, which silently breaks every future lookup of that
    // table (refreshRunningOrder/get_running_table_orders_v1 both expect at
    // most one running row per table and would start erroring or picking
    // one arbitrarily) — worse than the original wrong-table mistake this
    // feature exists to fix. A destination that only has non-running
    // Order Pad/QR orders waiting (incomingByTable) is still safe to move
    // into and keeps the existing merge-confirm behavior, since this app's
    // architecture already supports multiple non-running order rows sharing
    // one table_number (that's exactly how "Bill This Table" combines them).
    if (tableBoard[destTable] !== undefined) {
      window.alert(`Table ${tableLabel(destTable)} already has its own running order. Bill or cancel that table first, then move this one — two running orders can't share one table.`);
      return;
    }
    const destOccupied = Boolean(incomingByTable[destTable]);
    if (destOccupied) {
      if (!window.confirm(`Table ${tableLabel(destTable)} already has items on it. Move this table's order there anyway and combine the bills?`)) return;
    }
    setMovingTable(true);
    try {
      const idsToMove = [runningOrder.id, ...incomingTableOrders.map((o) => o.id)];
      const { error } = await supabase
        .from('orders')
        .update({ table_number: destTable })
        .in('id', idsToMove);
      if (error) throw new Error(error.message);

      // Carry along any unsent draft items too, so nothing typed for this
      // table gets silently left behind by the move.
      const leftoverDraft = captureDraft();
      if (leftoverDraft.cart.length || leftoverDraft.customItems.length) {
        setTableDrafts((prev) => {
          const existing = prev[destTable] ?? { cart: [], customItems: [] };
          const mergedCart = [...existing.cart];
          for (const item of leftoverDraft.cart) {
            const idx = mergedCart.findIndex((c) => c.menuItem.id === item.menuItem.id && c.notes === item.notes);
            if (idx >= 0) mergedCart[idx] = { ...mergedCart[idx], quantity: mergedCart[idx].quantity + item.quantity };
            else mergedCart.push(item);
          }
          return { ...prev, [destTable]: { cart: mergedCart, customItems: [...existing.customItems, ...leftoverDraft.customItems] } };
        });
      }

      clearTableDraft(tableNumber);
      setRunningOrder(null);
      clearCart();
      setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
      setParcelCount(0);
      setTableNumber(null);
      closeMovePicker();
      void loadTableBoard();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to move this table.');
    } finally {
      setMovingTable(false);
    }
  };

  const handleMoveItem = (destTable: number) => {
    if (!moveTarget || moveTarget.scope !== 'item' || !tableNumber || destTable === tableNumber) return;
    const { itemKind, itemId } = moveTarget;
    if (itemKind === 'menu') {
      const item = cart.find((c) => c.menuItem.id === itemId);
      if (!item) { closeMovePicker(); return; }
      setTableDrafts((prev) => {
        const existing = prev[destTable] ?? { cart: [], customItems: [] };
        const mergedCart = [...existing.cart];
        const idx = mergedCart.findIndex((c) => c.menuItem.id === item.menuItem.id && c.notes === item.notes);
        if (idx >= 0) mergedCart[idx] = { ...mergedCart[idx], quantity: mergedCart[idx].quantity + item.quantity };
        else mergedCart.push(item);
        return { ...prev, [destTable]: { ...existing, cart: mergedCart } };
      });
      setCart(cart.filter((c) => c.menuItem.id !== itemId));
    } else {
      const item = customItems.find((c) => c.id === itemId);
      if (!item) { closeMovePicker(); return; }
      setTableDrafts((prev) => {
        const existing = prev[destTable] ?? { cart: [], customItems: [] };
        return { ...prev, [destTable]: { ...existing, customItems: [...existing.customItems, item] } };
      });
      setCustomItems(customItems.filter((c) => c.id !== itemId));
    }
    closeMovePicker();
  };

  // BUG FIX ("i am only able to move only one item"): the whole-table Move
  // button above only ever existed for a table that already has a
  // `runningOrder` (i.e. items already sent to the kitchen) — see the
  // `{runningOrder && (...)}` guard on that button. A biller who picks the
  // wrong table and notices BEFORE pressing "Send to Kitchen" (items still
  // sitting in the local draft cart) had no whole-table option at all, only
  // the per-item "Move" link next to each individual line — so moving a
  // multi-item order meant repeating that one-by-one for every item. This
  // moves the entire draft cart + custom items in one action, same as
  // handleMoveItem but for everything at once instead of a single id.
  const handleMoveDraftAll = (destTable: number) => {
    if (!tableNumber || destTable === tableNumber) return;
    if (cart.length === 0 && customItems.length === 0) { closeMovePicker(); return; }
    setTableDrafts((prev) => {
      const existing = prev[destTable] ?? { cart: [], customItems: [] };
      const mergedCart = [...existing.cart];
      for (const item of cart) {
        const idx = mergedCart.findIndex((c) => c.menuItem.id === item.menuItem.id && c.notes === item.notes);
        if (idx >= 0) mergedCart[idx] = { ...mergedCart[idx], quantity: mergedCart[idx].quantity + item.quantity };
        else mergedCart.push(item);
      }
      return { ...prev, [destTable]: { cart: mergedCart, customItems: [...existing.customItems, ...customItems] } };
    });
    clearTableDraft(tableNumber);
    clearCart();
    setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
    setParcelCount(0);
    setTableNumber(null);
    closeMovePicker();
  };

  const handleSendToKitchen = async () => {
    if (!currentUser) return;
    if (!tableNumber) { setTableError(true); setSubmitError('Select a table first.'); return; }
    if (allEmpty) { setSubmitError('Add at least one item before sending to the kitchen.'); return; }
    setSubmitError('');
    setSendingKot(true);
    try {
      const newItems = [
        ...cart.map((c) => ({ menuItem: c.menuItem, quantity: c.quantity, notes: c.notes })),
        ...customItems.map((ci) => ({
          menuItem: { id: ci.id, name: ci.name, price: ci.price, category: 'custom', timing: 'all', enabled: true },
          quantity: ci.qty,
        })),
      ];
      const billedBy = currentUser.displayName || currentUser.username;
      let kotNumber: number;
      let orderId: string;
      let allItems: Order['items'];
      let resolvedOrderNumber: number;

      if (runningOrder) {
        const { data, error } = await supabase.rpc('add_items_to_table_order_v1', {
          p_order_id: runningOrder.id,
          p_items: newItems,
          p_created_by: billedBy,
        });
        if (error) throw new Error(error.message);
        kotNumber = data.kotNumber;
        orderId = runningOrder.id;
        allItems = data.items as Order['items'];
        // BUG FIX (2026-08-19): kotNumber here is add_items_to_table_order_v1's
        // own internal "which ticket is this for this table" counter (1, 2, 3...
        // per order) — correct for that purpose, but not what should be printed
        // as the customer/kitchen-facing "KOT - N" number, which needs to match
        // the same globally-unique, ever-incrementing number the printed bill
        // uses. runningOrder.orderNumber is already the real one, known
        // client-side without any extra round trip.
        resolvedOrderNumber = runningOrder.orderNumber;
      } else {
        const { data, error } = await supabase.rpc('start_table_order_v1', {
          p_table_number: tableNumber,
          p_items: newItems,
          p_created_by: billedBy,
          p_notes: notes || null,
        });
        if (error) throw new Error(error.message);
        kotNumber = data.kotNumber;
        orderId = data.orderId;
        allItems = newItems as Order['items'];
        resolvedOrderNumber = data.orderNumber;
      }

      printKotSlip({
        id: orderId,
        orderNumber: resolvedOrderNumber,
        tableNumber,
        orderType: 'dine_in',
        items: newItems as Order['items'],
        subtotal: 0, discount: 0, discountType: 'flat', discountValue: 0, total: 0,
        status: 'running',
        paymentType: 'unpaid',
        createdBy: billedBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      clearCart();
      setParcelCount(0);
      setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
      if (tableNumber != null) clearTableDraft(tableNumber);
      await refreshRunningOrder(tableNumber);
      void loadTableBoard();
      setKotSuccess(kotNumber);
      setTimeout(() => setKotSuccess(null), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // BUG FIX: this local `runningOrder` snapshot can go stale — e.g. another
      // biller already billed/closed this exact table a moment earlier, or this
      // screen just hadn't refreshed yet. In that case `add_items_to_table_order_v1`
      // throws ORDER_NOT_RUNNING, which used to fall straight into the generic
      // "Failed to send order to kitchen" error with no recovery — the button
      // looked broken ("I click it and get an error") even though the fix is
      // just to resync and let staff press it again. Now handled the same way
      // TABLE_ALREADY_RUNNING already was: silently resync and give a clear
      // explanation instead of a raw error.
      if (msg.includes('TABLE_ALREADY_RUNNING') || msg.includes('duplicate key') || msg.includes('23505')) {
        setSubmitError('Another biller just opened this table. Refreshing its current order…');
        await refreshRunningOrder(tableNumber);
        void loadTableBoard();
      } else if (msg.includes('ORDER_NOT_RUNNING')) {
        setSubmitError('This table was already billed or closed elsewhere. Refreshed — please try again.');
        await refreshRunningOrder(tableNumber);
        void loadTableBoard();
      } else {
        setSubmitError(msg || 'Failed to send order to kitchen. Please try again.');
      }
    } finally {
      setSendingKot(false);
    }
  };

  // -- Combined "Bill This Table" flow -----------------------------------------
  // A table's tab can be spread across several separate records: the running
  // POS tab built via Send to Kitchen above, PLUS any orders placed
  // independently through the Order Pad or QR ordering (see
  // incomingTableOrders — computed above, after orders/orderType/tableNumber
  // are declared). Previously each of those needed its own separate payment
  // action and the biller could only bill once kitchen had "readied" an
  // order. This settles everything for the table in one pass, regardless of
  // kitchen status: any unsent draft cart is KOT'd first (nothing is ever
  // billed without a KOT — same rule as the rest of this screen), then every
  // order source is charged with the same chosen payment method and printed
  // as ONE receipt.
  const [showCombineBillModal, setShowCombineBillModal] = useState(false);
  const [combineBillMethod, setCombineBillMethod] = useState<'cash' | 'upi' | 'card' | 'credit'>('cash');
  const [combineCreditPhone, setCombineCreditPhone] = useState('');
  const [combineCreditDueDate, setCombineCreditDueDate] = useState('');
  const [combineSubmitting, setCombineSubmitting] = useState(false);
  const [combineError, setCombineError] = useState('');

  const combineBillableCount = (runningOrder ? 1 : 0) + incomingTableOrders.length;

  const handleConfirmCombinedBill = async () => {
    if (combineSubmitting) return; // DOUBLE-BILL FIX: same re-entrant-tap guard used everywhere else in this file.
    if (!tableNumber || !currentUser) return;
    if (!counterOpenedToday) { setCombineError('Counter is not opened. Open Cashier Counter, then Counter Open before collecting payment.'); return; }
    if (combineBillMethod === 'credit') {
      const phoneDigits = combineCreditPhone.replace(/\D/g, '');
      if (!customerName.trim()) { setCombineError('Customer name is required for credit sale.'); return; }
      if (phoneDigits.length < 10) { setCombineError('Enter a valid phone number for credit sale.'); return; }
      if (!combineCreditDueDate) { setCombineError('Due date is required for credit sale.'); return; }
    }
    setCombineError('');
    setCombineSubmitting(true);
    const billedBy = currentUser.displayName || currentUser.username;
    try {
      if (!allEmpty) {
        await handleSendToKitchen();
      }

      // Pull a fresh snapshot rather than trusting closures that may be
      // stale immediately after the KOT above.
      const { data: runningRow, error: runningErr } = await supabase
        .from('orders')
        .select('id, order_number, table_number, order_type, items, subtotal, discount, discount_type, discount_value, total, status, created_by, created_at, updated_at, notes, customer_name, payment_type, payment_breakdown, billed_by, order_source, parcel_charges')
        .eq('table_number', tableNumber)
        .eq('order_type', 'dine_in')
        .eq('status', 'running')
        .maybeSingle();
      if (runningErr) throw new Error(runningErr.message);
      const freshRunning = runningRow ? dbRowToOrder(runningRow as Record<string, unknown>) : null;

      const freshIncoming = useOrderStore.getState().orders.filter(o =>
        o.orderType === 'dine_in' &&
        o.tableNumber === tableNumber &&
        (o.orderSource === 'staff' || o.orderSource === 'qr') &&
        (o.status === 'pending' || o.status === 'preparing' || o.status === 'ready') &&
        o.paymentType === 'unpaid'
      );

      const allSources = [...(freshRunning ? [freshRunning] : []), ...freshIncoming];
      if (allSources.length === 0) {
        setCombineError('Nothing to bill for this table.');
        setCombineSubmitting(false);
        return;
      }

      const combinedItems = allSources.flatMap(o => o.items);
      const combinedSubtotal = combinedItems.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0);
      const combinedParcel = allSources.reduce((s, o) => s + (o.parcelCharges || 0), 0);
      const combinedTotal = combinedSubtotal + combinedParcel;

      // BUG FIX (audit 2026-08-10): recordCreditSale used to run AFTER the
      // orders below were already marked paid/served. Every field this
      // needs (combinedItems/combinedSubtotal, and the order numbers used
      // in the bill number) is already known at this point — none of it
      // depends on the finalize call below — so there's no reason to risk
      // it running second. If this insert into branch_credit_sales ever
      // fails (it has before: a check-constraint bug on this exact table
      // was fixed earlier this session), doing it first means the table is
      // untouched and the biller can just retry, instead of the order
      // silently sitting in `orders` marked "paid by credit" forever with
      // no matching row in the Credit tab to actually collect it from.
      if (combineBillMethod === 'credit') {
        const { recordCreditSale } = useBranchStore.getState();
        const creditItems = combinedItems.map(ci => ({
          itemName: ci.menuItem.name, quantity: ci.quantity, sellUnit: 'pcs' as const,
          price: ci.menuItem.price, lineTotal: ci.menuItem.price * ci.quantity,
        }));
        const primaryNumber = (freshRunning ?? freshIncoming[0]).orderNumber;
        const creditErr = await recordCreditSale('Cafe', {
          billNo: `CREDIT-Cafe-${primaryNumber}`,
          branch: 'Cafe',
          customerName: customerName.trim(),
          customerPhone: combineCreditPhone.trim(),
          items: creditItems,
          subtotal: combinedSubtotal,
          amountPaid: 0,
          creditAmount: combinedSubtotal,
          dueDate: combineCreditDueDate,
          soldBy: billedBy,
          notes: `Combined Table ${tableNumber} bill (orders ${allSources.map(o => o.orderNumber).join(', ')})`,
        });
        if (creditErr) throw new Error(`Credit ledger: ${creditErr} — table was NOT billed, nothing was charged. Fix the issue and try again.`);
      }

      // Settle every source with the same already-tested primitives used
      // elsewhere in this file — not a new payment code path. Each call is
      // independently safe/atomic; if one fails partway we stop and surface
      // it rather than printing a receipt for a partially-settled table.
      if (freshRunning) {
        const { error } = await supabase.rpc('finalize_table_bill_v1', {
          p_order_id: freshRunning.id,
          p_payment_type: combineBillMethod,
          p_payment_breakdown: null,
          p_billed_by: billedBy,
          p_customer_name: customerName.trim() || null,
        });
        if (error) throw new Error(`Running tab: ${error.message}`);
      }
      for (const o of freshIncoming) {
        await setPaymentType(o.id, combineBillMethod, billedBy);
        // BUG FIX: setPaymentType only stamps payment_type - it deliberately
        // never touches status (see OrderCard.tsx's single-order payment flow,
        // which only advances to 'served' once the kitchen has separately
        // marked the order 'ready'). But a combine-bill IS the table's final
        // checkout - the comment above ("settles everything for the table in
        // one pass") says so - so these legacy order-pad/QR rows must be
        // explicitly closed out here too. Without this, a paid order stays
        // stuck at pending/preparing/ready forever (payment_type no longer
        // 'unpaid', so it can never be billed again, but status never left
        // the kitchen-queue bucket) - a permanent "ghost" that keeps showing
        // as waiting items on this table. Two real orders were found stuck
        // exactly this way on Table 1 and were cleaned up in the database.
        if (o.status !== 'served') {
          await updateOrderStatus(o.id, 'served');
        }
      }

      // Synthetic combined order purely for printing — reuses the exact same
      // receipt renderer as every other bill on this screen.
      const primary = freshRunning ?? freshIncoming[0];
      const combinedOrderForPrint: Order = {
        ...primary,
        items: combinedItems,
        subtotal: combinedSubtotal,
        discount: 0, discountType: 'flat', discountValue: 0,
        total: combinedTotal,
        parcelCharges: combinedParcel,
        paymentType: combineBillMethod,
        billedBy,
        status: 'served',
        customerName: customerName.trim() || primary.customerName,
        notes: `Combined bill — orders ${allSources.map(o => o.orderNumber).join(', ')}`,
      };
      if (combineBillMethod === 'credit') printCreditBill(combinedOrderForPrint, combineCreditPhone.trim(), combineCreditDueDate);
      else printPaidBill(combinedOrderForPrint, 'original');

      await loadOrders(60);
      setRunningOrder(null);
      clearTableDraft(tableNumber);
      void loadTableBoard();
      clearCart();
      setParcelCount(0);
      setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
      setShowCombineBillModal(false);
      setCombineCreditPhone(''); setCombineCreditDueDate(''); setCombineBillMethod('cash');
      setShowSuccess(true);
      setCustomerName(''); setTableNumber(null);
      setTimeout(() => setShowSuccess(false), 2200);
    } catch (err) {
      setCombineError(err instanceof Error ? err.message : 'Failed to bill this table. Please check each order and try again.');
    } finally {
      setCombineSubmitting(false);
    }
  };

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  const enabledItems = useMemo(() => items.filter(i => i.enabled), [items]);
  const filteredItems = useMemo(() => {
    let filtered = enabledItems;
    if (search.trim()) return filtered.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    if (selectedCategory !== 'all') filtered = filtered.filter(i => i.category === selectedCategory);
    return filtered;
  }, [enabledItems, selectedCategory, search]);

  const promotionLines = useMemo<PromotionCartLine[]>(() => {
    const runningItems = (orderType === 'dine_in' && runningOrder) ? runningOrder.items : [];
    const menuQty = new Map<string, { name: string; category: string; unitPrice: number; quantity: number }>();
    const customFromRunning: PromotionCartLine[] = [];
    for (const line of [...cart, ...runningItems]) {
      if (line.menuItem.id.startsWith('custom-')) {
        // Custom items already sent to the kitchen (not currently in the
        // editable customItems list) still count toward promotion eligibility.
        if (!cart.some((c) => c.menuItem.id === line.menuItem.id)) {
          customFromRunning.push({
            id: line.menuItem.id, name: line.menuItem.name, category: 'custom',
            quantity: line.quantity, unitPrice: line.menuItem.price, inStock: true, isCustom: true,
          });
        }
        continue;
      }
      const existing = menuQty.get(line.menuItem.id);
      if (existing) existing.quantity += line.quantity;
      else menuQty.set(line.menuItem.id, { name: line.menuItem.name, category: line.menuItem.category, unitPrice: line.menuItem.price, quantity: line.quantity });
    }
    const selected = new Set(menuQty.keys());
    const cartLines = Array.from(menuQty.entries()).map(([id, v]) => ({
      id, name: v.name, category: v.category, quantity: v.quantity, unitPrice: v.unitPrice, inStock: true,
    }));
    const customLines = customItems.map((line) => ({
      id: line.id,
      name: line.name,
      category: 'custom',
      quantity: line.qty,
      unitPrice: line.price,
      inStock: true,
      isCustom: true,
    }));
    const suggestions = enabledItems.filter((item) => !selected.has(item.id)).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      quantity: 0,
      unitPrice: item.price,
      inStock: true,
    }));
    return [...cartLines, ...customFromRunning, ...customLines, ...suggestions];
  }, [cart, customItems, enabledItems, orderType, runningOrder]);
  const handlePromotionChange = useCallback((evaluation: PromotionEvaluation) => setPromotionEvaluation(evaluation), []);
  const handleCouponChange = useCallback((value: string) => setCouponCode(value), []);

  const menuTotal     = getCartTotal();
  const customTotal   = customItems.reduce((s, c) => s + c.price * c.qty, 0);
  const runningSubtotal = (orderType === 'dine_in' && runningOrder)
    ? runningOrder.items.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0) : 0;
  const itemsSubtotal = menuTotal + customTotal + runningSubtotal;
  // Parcel charges: manual +/- count, Rs 10 each, takeaway only (see parcelCount above)
  const PARCEL_CHARGE_PER_PARCEL = 10;
  const totalItemQty  = cart.reduce((s, c) => s + c.quantity, 0)
                      + customItems.reduce((s, c) => s + c.qty, 0);
  const parcelCharges = orderType === 'takeaway' ? parcelCount * PARCEL_CHARGE_PER_PARCEL : 0;
  // FEATURE (2026-08-30): manual biller discount, % or flat ₹. Applied
  // before the promotion discount, which is then capped to whatever's left
  // — same order and formula every checkout RPC now recomputes server-side
  // (see complete_cafe_promotional_checkout_v1), so this preview can never
  // disagree with what actually gets billed/collected.
  const manualDiscountInput = Math.max(0, Number(manualDiscountValue || 0));
  const manualDiscountAmount = Math.min(
    itemsSubtotal,
    manualDiscountType === 'percentage'
      ? Math.round(itemsSubtotal * Math.min(100, manualDiscountInput)) / 100
      : Math.round(manualDiscountInput * 100) / 100,
  );
  const promotionDiscount = paymentMode === 'credit'
    ? 0
    : Math.min(Math.max(0, itemsSubtotal - manualDiscountAmount), Number(promotionEvaluation.discount || 0));
  const combinedDiscount = Math.min(itemsSubtotal, manualDiscountAmount + promotionDiscount);
  const grossTotal = itemsSubtotal + parcelCharges;
  const amountBeforeRoundOff = Math.max(0, grossTotal - combinedDiscount);
  // FEATURE: round the final payable amount to the nearest whole rupee once
  // the discount is applied.
  const total = Math.round(amountBeforeRoundOff);
  const roundOff = Math.round((total - amountBeforeRoundOff) * 100) / 100;
  const walletRemainder = Math.max(0, total - walletAmount);
  const cartCount     = getCartCount();
  const allEmpty      = cartCount === 0 && customItems.length === 0;
  // BUG FIX: a dine-in table with a running order (items already "Sent to
  // Kitchen" across one or more KOTs) has an EMPTY draft cart by design —
  // clearCart() runs right after each send. `allEmpty` alone can't tell that
  // apart from a genuinely untouched table, so callers that need to know
  // "is there actually a bill to create" must also check runningOrder.
  const hasRunningItems = orderType === 'dine_in' && Boolean(runningOrder) && runningOrder!.items.length > 0;
  const showBillFooter  = !allEmpty || hasRunningItems;
  const getQty = (id: string) => cart.find(c => c.menuItem.id === id)?.quantity ?? 0;
  const splitBreakdown: PaymentBreakdown = {
    cash: Number(splitPayment.cash || 0),
    upi: Number(splitPayment.upi || 0),
    card: Number(splitPayment.card || 0),
  };
  const splitTotal = splitBreakdown.cash + splitBreakdown.upi + splitBreakdown.card;
  const splitRemaining = total - splitTotal;

  // BUG FIX: dine-in items could previously be added to the cart before a
  // table was selected — the table gate only existed at Send to Kitchen and
  // billing time, so an unassigned pile of items could build up with nowhere
  // for it to actually go. Table must now be picked first.
  const requireTableForDineIn = () => {
    if (orderType === 'dine_in' && !tableNumber) {
      setTableError(true);
      setSubmitError('Select a table first before adding items.');
      return false;
    }
    return true;
  };

  const handleAddMenuItem = (item: MenuItem) => {
    if (!requireTableForDineIn()) return;
    addToCart(item);
  };

  const handleAddCustomItem = () => {
    if (!requireTableForDineIn()) return;
    const n = customName.trim();
    const p = parseFloat(customPrice);
    const q = parseInt(customQty) || 1;
    if (!n) { setCustomError('Enter item name'); return; }
    if (isNaN(p) || p <= 0) { setCustomError('Enter a valid price'); return; }
    // BUG FIX (audit): the qty field is `<input type="number" min="1">`, but
    // `min` is only a browser hint — this runs from a plain button onClick,
    // not a form submit, so nothing ever enforced it. Typing a negative
    // quantity directly (e.g. -5) created a custom line that subtracted from
    // the bill total instead of adding to it.
    if (isNaN(q) || q <= 0) { setCustomError('Enter a valid quantity'); return; }
    setCustomError('');
    setCustomItems(prev => {
      const existing = prev.find(c => c.name.toLowerCase() === n.toLowerCase());
      if (existing) return prev.map(c => c.name.toLowerCase() === n.toLowerCase() ? { ...c, qty: c.qty + q } : c);
      return [...prev, { id: `custom-${Date.now()}-${Math.random()}`, name: n, price: p, qty: q }];
    });
    setCustomName(''); setCustomPrice(''); setCustomQty('1');
  };

  const updateCustomQty = (id: string, qty: number) => {
    if (qty <= 0) setCustomItems(prev => prev.filter(c => c.id !== id));
    else setCustomItems(prev => prev.map(c => c.id === id ? { ...c, qty } : c));
  };

  const openBillModal = () => {
    if (!counterOpenedToday) {
      setSubmitError('Counter is not opened. Open Cashier Counter, then Counter Open before billing.');
      return;
    }
    if (orderType === 'dine_in' && !tableNumber) {
      setTableError(true);
      setSubmitError('Select table before billing.');
      return;
    }
    if (orderType === 'dine_in' && !runningOrder && allEmpty) {
      setSubmitError('Send items to the kitchen first, then bill the table.');
      return;
    }
    setTableError(false);
    setSubmitError('');
    setBillMethod(paymentMode === 'wallet' ? 'wallet' : billMethod === 'wallet' ? 'cash' : billMethod);
    setShowBillModal(true);
  };

  const handleSubmit = async () => {
    if (allEmpty && !(orderType === 'dine_in' && runningOrder)) return;
    if (!currentUser) return;
    if (!counterOpenedToday) { setSubmitError('Counter is not opened. Open Cashier Counter, then Counter Open before billing.'); return; }
    if (orderType === 'dine_in' && !tableNumber) { setTableError(true); return; }
    setTableError(false);

    // -- Table order finalize path (dine-in with a running/KOT'd order) --------
    // Wallet payments aren't supported for running tables yet — use Takeaway
    // billing (or a table with no KOTs sent yet) for wallet transactions.
    if (orderType === 'dine_in' && runningOrder) {
      if (paymentMode === 'wallet') {
        if (!selectedWallet) { setSubmitError('Select a wallet customer.'); return; }
        if (selectedWallet.status !== 'active') { setSubmitError('The selected wallet is not active.'); return; }
        if (walletAmount <= 0) { setSubmitError('Enter the wallet amount to use.'); return; }
        if (walletAmount > selectedWallet.totalBalance) { setSubmitError(`Wallet has only ${formatCurrency(selectedWallet.totalBalance)} available.`); return; }
        if (walletAmount > total) { setSubmitError('Wallet amount cannot exceed the bill total.'); return; }
        if (walletRemainder > 0 && !walletOtherMode) { setSubmitError('Select a payment mode for the remaining amount.'); return; }
        if (walletRemainder > 0 && walletOtherMode === 'credit' && !creditDueDate) { setSubmitError('Due date is required for Wallet + Credit.'); return; }
        if (selectedWallet.highValueAuthorizationLimit != null && selectedWallet.highValueAuthorizationLimit > 0 && walletAmount >= selectedWallet.highValueAuthorizationLimit && !walletAuthorizationSecret.trim()) { setSubmitError('Admin or Owner authorization is required for this high-value wallet payment.'); return; }
      }
      if (paymentMode === 'credit') {
        const phoneDigits = creditCustomerPhone.replace(/\D/g, '');
        if (!customerName.trim()) { setCreditError('Customer name is required for credit sale'); return; }
        if (!creditCustomerPhone.trim()) { setCreditError('Phone number is required for credit sale'); return; }
        if (phoneDigits.length < 10) { setCreditError('Enter a valid phone number for credit sale'); return; }
        if (!creditDueDate) { setCreditError('Due date is required for credit sale'); return; }
        setCreditError('');
      } else if (billMethod === 'part_payment') {
        // BUG FIX (audit 2026-08-10): this running-table finalize path only
        // checked that the split fields were non-negative and summed to
        // something greater than zero — unlike the sibling non-running-order
        // checkout below (~line 2940), it never checked the split actually
        // matched the bill total. A biller could type e.g. cash: ₹1 as the
        // only split value on a ₹500 table and the whole table would be
        // marked fully paid/served. Matching the same `splitRemaining`
        // tolerance check used everywhere else in this file closes that gap.
        const values = Object.values(splitBreakdown);
        if (values.some((value) => Number.isNaN(value) || value < 0)) { setSubmitError('Enter valid split payment amounts.'); return; }
        if (splitTotal <= 0) { setSubmitError('Enter at least one split payment amount.'); return; }
        if (Math.abs(splitRemaining) > 0.01) {
          setSubmitError(`Split payment must match bill total. Remaining: ${formatCurrency(splitRemaining)}`);
          return;
        }
      }

      setSubmitting(true);
      setSubmitError('');
      try {
        const billedBy = currentUser.displayName || currentUser.username;
        const orderId = runningOrder.id;

        // Anything still sitting in the cart gets sent to the kitchen as one
        // last KOT automatically, so nothing is ever billed without a KOT.
        if (!allEmpty) {
          const pendingItems = [
            ...cart.map((c) => ({ menuItem: c.menuItem, quantity: c.quantity, notes: c.notes })),
            ...customItems.map((ci) => ({
              menuItem: { id: ci.id, name: ci.name, price: ci.price, category: 'custom', timing: 'all', enabled: true },
              quantity: ci.qty,
            })),
          ];
          const { error: kotError } = await supabase.rpc('add_items_to_table_order_v1', {
            p_order_id: orderId,
            p_items: pendingItems,
            p_created_by: billedBy,
          });
          if (kotError) throw new Error(kotError.message);
          await printKotSlip({
            id: orderId, orderNumber: runningOrder.orderNumber, tableNumber, orderType: 'dine_in',
            items: pendingItems as Order['items'], subtotal: 0, discount: 0, discountType: 'flat', discountValue: 0,
            total: 0, status: 'running', paymentType: 'unpaid', createdBy: billedBy,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          });
        }

        if (paymentMode === 'wallet') {
          if (!selectedWallet) throw new Error('Select a wallet customer.');
          const idempotencyKey = checkoutIdempotencyRef.current
            ?? `cafe-table-wallet:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
          checkoutIdempotencyRef.current = idempotencyKey;
          const { data, error } = await supabase.rpc('finalize_table_bill_wallet_v1', {
            p_order_id: orderId,
            p_wallet_id: selectedWallet.id,
            p_wallet_amount: walletAmount,
            p_other_mode: walletOtherMode,
            p_billed_by: billedBy,
            p_customer_name: selectedWallet.customerName,
            p_coupon_code: couponCode || null,
            p_selected_campaign_ids: promotionEvaluation.applied.map((item) => item.campaignId),
            p_wallet_authorization_secret: walletAuthorizationSecret || null,
            p_idempotency_key: idempotencyKey,
            p_discount_type: manualDiscountAmount > 0 ? manualDiscountType : null,
            p_discount_value: manualDiscountAmount > 0 ? manualDiscountInput : 0,
          });
          if (error) throw new Error(error.message);
          const result = data as { orderNumber: number; total: number; walletBalanceRemaining?: number | string; cashback?: number; items: Order['items'] };
          if (walletOtherMode === 'credit' && walletRemainder > 0) {
            const { recordCreditSale } = useBranchStore.getState();
            const creditItems = result.items.map((c) => ({ itemName: c.menuItem.name, quantity: c.quantity, sellUnit: 'pcs' as const, price: c.menuItem.price, lineTotal: c.menuItem.price * c.quantity }));
            const creditErr = await recordCreditSale('Cafe', {
              billNo: `WALLET-Cafe-${result.orderNumber}`, branch: 'Cafe', customerName: selectedWallet.customerName,
              customerPhone: selectedWallet.mobile, items: creditItems, subtotal: Number(result.total),
              amountPaid: walletAmount, creditAmount: walletRemainder, dueDate: creditDueDate, soldBy: billedBy, notes: notes || undefined,
            });
            // BUG FIX (audit 2026-08-10): finalize_table_bill_wallet_v1 above
            // already committed this order as paid — its wallet+cashback
            // fields only exist once it returns, so recordCreditSale can't
            // run before it here the way the combine-bill path was reordered
            // to. If this insert fails, the order is still correctly paid,
            // but nothing exists yet in the Credit tab to actually collect
            // the ₹{walletRemainder} balance from — make that unmissable
            // rather than a generic dismissible error.
            if (creditErr) {
              const msg = `Bill #${result.orderNumber} was already closed and paid, but saving the ₹${walletRemainder} credit balance failed: ${creditErr}. Add it to Credit manually right now so it isn't lost.`;
              window.alert(msg);
              throw new Error(msg);
            }
          }
          await loadOrders(60);
          const loaded = useOrderStore.getState().orders.find((o) => o.orderNumber === result.orderNumber);
          // BUG FIX: this is the wallet-payment branch of the TABLE FINALIZE
          // path (runningOrder already exists - items were already sent to
          // the kitchen via Send to Kitchen). Its cash/UPI/card sibling below
          // correctly prints only the bill (printPaidBill); this branch was
          // wrongly using printKotThenBill, silently re-printing a duplicate
          // KOT for items the kitchen already has. Dine-in should only ever
          // get a KOT from the explicit Send to Kitchen button.
          if (loaded) printPaidBill({ ...loaded, walletBalanceRemaining: Number(result.walletBalanceRemaining || 0) }, 'original');
          checkoutIdempotencyRef.current = null;
          setSelectedWallet(null); setWalletAmount(0); setWalletOtherMode(null); setWalletAuthorizationSecret(''); setCouponCode('');
          await loadOrders(60);
          setRunningOrder(null);
          if (tableNumber != null) clearTableDraft(tableNumber);
          void loadTableBoard();
          clearCart();
          setParcelCount(0);
          setShowBillModal(false);
          setShowSuccess(true);
          setNotes(''); setCustomerName(''); setTableNumber(null);
          setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
          setBillMethod('cash'); setSplitPayment({ cash: '', upi: '', card: '' }); setCashTendered(''); setManualDiscountValue('');
          setCreditCustomerPhone(''); setCreditDueDate(''); setPaymentMode('regular');
          setTimeout(() => setShowSuccess(false), 2200);
          setSubmitting(false);
          return;
        }

        const finalPaymentType: PaymentType = paymentMode === 'credit' ? 'credit' : billMethod;
        const finalBreakdown = billMethod === 'part_payment' && paymentMode !== 'credit' ? splitBreakdown : null;
        const { data, error } = await supabase.rpc('finalize_table_bill_v1', {
          p_order_id: orderId,
          p_payment_type: finalPaymentType,
          p_payment_breakdown: finalBreakdown,
          p_billed_by: billedBy,
          p_customer_name: customerName.trim() || null,
          p_discount_type: manualDiscountAmount > 0 ? manualDiscountType : null,
          p_discount_value: manualDiscountAmount > 0 ? manualDiscountInput : 0,
        });
        if (error) throw new Error(error.message);
        const finalized = dbRowToOrder(data as Record<string, unknown>);

        if (paymentMode === 'credit') {
          const { recordCreditSale } = useBranchStore.getState();
          const creditItems = finalized.items.map((c) => ({
            itemName: c.menuItem.name, quantity: c.quantity, sellUnit: 'pcs' as const,
            price: c.menuItem.price, lineTotal: c.menuItem.price * c.quantity,
          }));
          const err = await recordCreditSale('Cafe', {
            billNo: `CREDIT-Cafe-${finalized.orderNumber}`,
            branch: 'Cafe',
            customerName: customerName.trim(),
            customerPhone: creditCustomerPhone.trim(),
            items: creditItems,
            subtotal: finalized.total,
            amountPaid: 0,
            creditAmount: finalized.total,
            dueDate: creditDueDate,
            soldBy: billedBy,
            notes: notes || undefined,
          });
          // BUG FIX (audit 2026-08-10): same class as the wallet branch
          // above — finalize_table_bill_v1 already marked this order paid
          // by the time we know its final total, so a failure here can't be
          // avoided by reordering. Name the bill and amount explicitly so
          // it's never silently lost from the Credit tab.
          if (err) {
            const msg = `Bill #${finalized.orderNumber} was already closed and paid, but saving the ₹${finalized.total} credit record failed: ${err}. Add it to Credit manually right now so it isn't lost.`;
            window.alert(msg);
            throw new Error(msg);
          }
          printCreditBill(finalized, creditCustomerPhone.trim(), creditDueDate);
        } else {
          printPaidBill(finalized, 'original', billMethod === 'cash' ? Number(cashTendered || 0) || undefined : undefined);
        }

        await loadOrders(60);
        setRunningOrder(null);
        if (tableNumber != null) clearTableDraft(tableNumber);
        void loadTableBoard();
        clearCart();
        setParcelCount(0);
        setShowBillModal(false);
        setShowSuccess(true);
        setNotes(''); setCustomerName(''); setTableNumber(null);
        setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
        setBillMethod('cash'); setSplitPayment({ cash: '', upi: '', card: '' }); setCashTendered(''); setManualDiscountValue('');
        setCreditCustomerPhone(''); setCreditDueDate(''); setPaymentMode('regular');
        setTimeout(() => setShowSuccess(false), 2200);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to bill this table. Refresh and try again.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // -- Credit sale path ------------------------------------------------------
    if (paymentMode === 'credit') {
      const phoneDigits = creditCustomerPhone.replace(/\D/g, '');
      if (!customerName.trim()) { setCreditError('Customer name is required for credit sale'); return; }
      if (!creditCustomerPhone.trim()) { setCreditError('Phone number is required for credit sale'); return; }
      if (phoneDigits.length < 10) { setCreditError('Enter a valid phone number for credit sale'); return; }
      if (!creditDueDate) { setCreditError('Due date is required for credit sale'); return; }
      setCreditError('');
      setSubmitting(true);

      try {
        for (const ci of customItems) {
          const syntheticItem = { id: ci.id, name: ci.name, price: ci.price, category: 'custom', timing: 'all', enabled: true };
          for (let i = 0; i < ci.qty; i++) addToCart(syntheticItem);
        }
        await new Promise(r => setTimeout(r, 0));
        const { recordCreditSale } = useBranchStore.getState();
        const branchFromRole: Record<string, Branch> = {
          billing:      'Cafe',
          admin_vrsnb:  'VRSNB', branch_vrsnb: 'VRSNB',
          admin_snb:    'SNB',   branch_snb:   'SNB',
          branch_hosur: 'Hosur',
        };
        const branch = branchFromRole[currentUser.role];
        if (!branch) throw new Error(`Billing role ${currentUser.role || 'unknown'} is not mapped to a branch.`);
        const orderId = await submitOrder({
          tableNumber: orderType === 'dine_in' ? (tableNumber ?? undefined) : undefined,
          orderType,
          notes: notes || undefined,
          customerName: customerName.trim(),
          createdBy: currentUser.username,
          orderSource: 'staff',
          parcelCharges: parcelCharges > 0 ? parcelCharges : undefined,
          paymentType: 'credit',
          billedBy: currentUser.displayName || currentUser.username,
          status: 'served',
          discount: manualDiscountAmount,
          discountType: manualDiscountType,
          discountValue: manualDiscountInput,
        });
        const savedOrder = useOrderStore.getState().orders.find(o => o.id === orderId);
        const allCartItems = savedOrder?.items ?? [];
        const billNo = savedOrder ? `CREDIT-${branch}-${savedOrder.orderNumber}` : `CREDIT-${branch}-${Date.now()}`;
        const creditItems = allCartItems.map(c => ({
          itemName: c.menuItem.name,
          quantity: c.quantity,
          sellUnit: 'pcs' as const,
          price: c.menuItem.price,
          lineTotal: c.menuItem.price * c.quantity,
        }));
        const err = await recordCreditSale(branch, {
          billNo,
          branch,
          customerName: customerName.trim(),
          customerPhone: creditCustomerPhone.trim(),
          items: creditItems,
          subtotal: total,
          amountPaid: 0,
          creditAmount: total,
          dueDate: creditDueDate,
          soldBy: currentUser.displayName || currentUser.username,
          notes: notes || undefined,
        });

        // BUG FIX (audit 2026-08-10): submitOrder above already committed
        // this order as status:'served', paymentType:'credit' — its
        // generated order number/items are exactly what billNo/creditItems
        // needed, so this can't safely run before that write either. Name
        // the bill and amount explicitly on failure so it's never silently
        // lost from the Credit tab.
        if (err) {
          const msg = `Bill ${billNo} was already closed and paid, but saving the ${formatCurrency(total)} credit record failed: ${err}. Add it to Credit manually right now so it isn't lost.`;
          window.alert(msg);
          setSubmitError(msg); setSubmitting(false); return;
        }

        // Notify VRSNB Admin + Admin
        await notifyCreditSale({
          customerName: customerName.trim(),
          amount: total,
          billNo,
          branch,
          soldBy: currentUser.displayName || currentUser.username,
          dueDate: creditDueDate,
        });

        // BUG FIX (2026-08-06): this is the credit-sale sibling of the
        // wallet/regular "no prior running order" checkout paths above
        // (both of which correctly call printKotThenBill) — but this path
        // only ever printed the credit bill, never a KOT. The kitchen never
        // learned a credit-sale dine-in/takeaway order existed unless staff
        // separately used "Send to Kitchen" first. Print the KOT here too,
        // same "kitchen first, then the customer's slip" sequencing.
        if (savedOrder) {
          await printKotSlip(savedOrder);
          printCreditBill(savedOrder, creditCustomerPhone.trim(), creditDueDate);
        }
        clearCart();
        setParcelCount(0);
        closeActiveTakeawayTicket();
        // BUG FIX: this credit-sale path (billing a table that never had a
        // KOT sent, so there's no `runningOrder`) never purged the table's
        // saved draft. The wallet and running-order finalize paths a few
        // hundred lines up both already call clearTableDraft() — this path
        // was missed, so a table billed via credit would still have its old,
        // already-paid items reappear the next time that table number was
        // picked again (switchTable() restores whatever's left in
        // tableDrafts). Matches "Table 1 items not clearing after billing."
        if (orderType === 'dine_in' && tableNumber != null) clearTableDraft(tableNumber);
        void loadTableBoard();
        setShowSuccess(true);
        setNotes(''); setCustomerName(''); setTableNumber(null);
        setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
        setCreditCustomerPhone(''); setCreditDueDate('');
        setPaymentMode('regular');
        // BUG FIX (audit): every other successful-checkout path resets these
        // three so the next bill's modal doesn't reopen pre-filled with a
        // stale value from a prior transaction — this credit-sale-with-no-
        // running-order path was the one place that got missed, so a "Cash
        // Tendered 500" left over from an earlier cash bill could silently
        // carry into the very next cash bill after a credit sale in between.
        setCashTendered(''); setBillMethod('cash'); setSplitPayment({ cash: '', upi: '', card: '' }); setManualDiscountValue('');
        setTimeout(() => setShowSuccess(false), 2200);
      } catch (err) {
        // BUG FIX (audit): unlike this, the wallet and regular/promotion
        // checkout catch blocks deliberately do NOT clear the cart on
        // failure — orderStore's submitOrder/submitAdvanceOrder already
        // restore the cart from a snapshot when the insert fails, precisely
        // so a transient error doesn't discard everything the biller typed.
        // This path was overriding that safety net and wiping the cart
        // anyway, forcing a full manual re-entry (e.g. a whole dine-in
        // table) after a simple network blip.
        setSubmitError(err instanceof Error ? err.message : 'Failed to record credit sale.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // -- Wallet / regular promotion-aware order path ---------------------------
    const checkoutItems = [
      ...cart,
      ...customItems.map((ci) => ({
        menuItem: { id: ci.id, name: ci.name, price: ci.price, category: 'custom', timing: 'all', enabled: true },
        quantity: ci.qty,
      })),
    ];

    if (paymentMode === 'wallet') {
      if (!selectedWallet) { setSubmitError('Select a wallet customer.'); return; }
      if (selectedWallet.status !== 'active') { setSubmitError('The selected wallet is not active.'); return; }
      if (walletAmount <= 0) { setSubmitError('Enter the wallet amount to use.'); return; }
      if (walletAmount > selectedWallet.totalBalance) { setSubmitError(`Wallet has only ${formatCurrency(selectedWallet.totalBalance)} available.`); return; }
      if (walletAmount > total) { setSubmitError('Wallet amount cannot exceed the bill total.'); return; }
      if (walletRemainder > 0 && !walletOtherMode) { setSubmitError('Select a payment mode for the remaining amount.'); return; }
      if (walletRemainder > 0 && walletOtherMode === 'credit' && !creditDueDate) { setSubmitError('Due date is required for Wallet + Credit.'); return; }
      if (selectedWallet.highValueAuthorizationLimit != null && selectedWallet.highValueAuthorizationLimit > 0 && walletAmount >= selectedWallet.highValueAuthorizationLimit && !walletAuthorizationSecret.trim()) { setSubmitError('Admin or Owner authorization is required for this high-value wallet payment.'); return; }
      setSubmitting(true);
      setSubmitError('');
      const idempotencyKey = checkoutIdempotencyRef.current
        ?? `cafe-wallet:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
      checkoutIdempotencyRef.current = idempotencyKey;
      try {
        const billedBy = currentUser.displayName || currentUser.username;
        const { data, error } = await supabase.rpc('complete_cafe_wallet_checkout_v1', {
          p_items: checkoutItems,
          p_table_number: orderType === 'dine_in' ? tableNumber : null,
          p_order_type: orderType,
          p_notes: notes || null,
          p_customer_name: selectedWallet.customerName,
          p_biller: billedBy,
          p_parcel_charges: parcelCharges,
          p_wallet_id: selectedWallet.id,
          p_wallet_amount: walletAmount,
          p_other_mode: walletOtherMode,
          p_idempotency_key: idempotencyKey,
          p_coupon_code: couponCode || null,
          p_selected_campaign_ids: promotionEvaluation.applied.map((item) => item.campaignId),
          p_wallet_authorization_secret: walletAuthorizationSecret || null,
          p_discount_type: manualDiscountAmount > 0 ? manualDiscountType : null,
          p_discount_value: manualDiscountAmount > 0 ? manualDiscountInput : 0,
        });
        if (error) throw new Error(error.message);
        const result = data as {
          orderId: string; orderNumber: number; subtotal: number; discount: number; promotionDiscount?: number; total: number;
          walletTransactionId?: string; walletBalanceRemaining?: number | string; cashback?: number;
          promotionIds?: string[]; items: Order['items']; otherAmount?: number;
        };
        if (!result?.orderId || !result.orderNumber) throw new Error('Wallet checkout completed without an order number.');

        if (walletOtherMode === 'credit' && walletRemainder > 0) {
          const { recordCreditSale } = useBranchStore.getState();
          const creditItems = result.items.map((line) => ({
            itemName: line.menuItem.name,
            quantity: line.quantity,
            sellUnit: 'pcs' as const,
            price: line.menuItem.price,
            lineTotal: line.menuItem.price * line.quantity,
          }));
          const creditErrorMessage = await recordCreditSale('Cafe', {
            billNo: `WALLET-Cafe-${result.orderNumber}`,
            branch: 'Cafe',
            customerName: selectedWallet.customerName,
            customerPhone: selectedWallet.mobile,
            items: creditItems,
            subtotal: Number(result.total),
            amountPaid: walletAmount,
            creditAmount: walletRemainder,
            dueDate: creditDueDate,
            soldBy: billedBy,
            notes: notes || undefined,
          });
          // BUG FIX (audit 2026-08-10): same class as the other wallet+
          // credit-remainder branch above — complete_cafe_wallet_checkout_v1
          // already committed this order paid by the time we know its final
          // number/total, so this can't run before it. Name the bill and
          // amount explicitly on failure so it's never silently lost.
          if (creditErrorMessage) {
            const msg = `Bill #${result.orderNumber} was already closed and paid, but saving the ₹${walletRemainder} credit balance failed: ${creditErrorMessage}. Add it to Credit manually right now so it isn't lost.`;
            window.alert(msg);
            throw new Error(msg);
          }
        }

        await loadOrders(60);
        const loaded = useOrderStore.getState().orders.find((order) => order.id === result.orderId);
        const printable: Order = loaded ?? {
          id: result.orderId,
          orderNumber: result.orderNumber,
          tableNumber: orderType === 'dine_in' ? tableNumber ?? undefined : undefined,
          orderType,
          items: result.items,
          subtotal: Number(result.subtotal),
          discount: Number(result.discount || 0),
          discountType: manualDiscountAmount > 0 ? manualDiscountType : 'flat',
          discountValue: manualDiscountAmount > 0 ? manualDiscountInput : 0,
          total: Number(result.total),
          status: 'served',
          createdBy: currentUser.username,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notes: notes || undefined,
          customerName: selectedWallet.customerName,
          paymentType: walletRemainder <= 0 ? 'wallet' : 'part_payment',
          paymentBreakdown: { cash: walletOtherMode === 'cash' ? walletRemainder : 0, upi: walletOtherMode === 'upi' ? walletRemainder : 0, card: walletOtherMode === 'card' ? walletRemainder : 0, wallet: walletAmount, credit: walletOtherMode === 'credit' ? walletRemainder : 0 },
          billedBy,
          orderSource: 'staff',
          parcelCharges: parcelCharges || undefined,
          walletId: selectedWallet.id,
          walletAmount,
          walletTransactionId: result.walletTransactionId,
          walletBalanceRemaining: Number(result.walletBalanceRemaining || 0),
          promotionDiscount: Number(result.promotionDiscount ?? 0),
          promotionIds: result.promotionIds || [],
          walletCashback: Number(result.cashback || 0),
        };
        printKotThenBill({ ...printable, walletBalanceRemaining: Number(result.walletBalanceRemaining || printable.walletBalanceRemaining || 0) }, 'original');
        checkoutIdempotencyRef.current = null;
        clearCart();
        setParcelCount(0);
        closeActiveTakeawayTicket();
        // BUG FIX: same missing clearTableDraft() as the credit-sale path above —
        // without it, a table paid via wallet here would still show its old
        // (already-paid) items the next time that table number was reselected.
        if (orderType === 'dine_in' && tableNumber != null) clearTableDraft(tableNumber);
        void loadTableBoard();
        setShowBillModal(false);
        setShowSuccess(true);
        setNotes(''); setCustomerName(''); setTableNumber(null);
        setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
        setSelectedWallet(null); setWalletAmount(0); setWalletOtherMode(null); setWalletAuthorizationSecret(''); setCouponCode('');
        setBillMethod('cash'); setSplitPayment({ cash: '', upi: '', card: '' }); setCashTendered(''); setManualDiscountValue('');
        setCreditDueDate(''); setPaymentMode('regular');
        setTimeout(() => setShowSuccess(false), 2200);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Wallet checkout failed.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const paymentBreakdown = billMethod === 'part_payment' ? splitBreakdown : undefined;
    if (paymentBreakdown) {
      const values = Object.values(paymentBreakdown);
      if (values.some(value => Number.isNaN(value) || value < 0)) {
        setSubmitError('Enter valid split payment amounts.');
        return;
      }
      if (splitTotal <= 0) {
        setSubmitError('Enter at least one split payment amount.');
        return;
      }
      if (Math.abs(splitRemaining) > 0.01) {
        setSubmitError(`Split payment must match bill total. Remaining: ${formatCurrency(splitRemaining)}`);
        return;
      }
    }
    setSubmitting(true);
    setSubmitError('');
    const idempotencyKey = checkoutIdempotencyRef.current
      ?? `cafe-promotion:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
    checkoutIdempotencyRef.current = idempotencyKey;
    try {
      const billedBy = currentUser.displayName || currentUser.username;
      const { data, error } = await supabase.rpc('complete_cafe_promotional_checkout_v1', {
        p_items: checkoutItems,
        p_table_number: orderType === 'dine_in' ? tableNumber : null,
        p_order_type: orderType,
        p_notes: notes || null,
        p_customer_name: customerName || null,
        p_biller: billedBy,
        p_parcel_charges: parcelCharges,
        p_payment_type: billMethod,
        p_payment_breakdown: paymentBreakdown || null,
        p_coupon_code: couponCode || null,
        p_idempotency_key: idempotencyKey,
        p_selected_campaign_ids: promotionEvaluation.applied.map((item) => item.campaignId),
        p_discount_type: manualDiscountAmount > 0 ? manualDiscountType : null,
        p_discount_value: manualDiscountAmount > 0 ? manualDiscountInput : 0,
      });
      if (error) throw new Error(error.message);
      const result = data as { orderId: string; orderNumber: number; subtotal: number; discount: number; promotionDiscount?: number; total: number; cashback?: number; promotionIds?: string[]; items: Order['items'] };
      if (!result?.orderId || !result.orderNumber) throw new Error('Checkout completed without an order number.');
      await loadOrders(60);
      const loaded = useOrderStore.getState().orders.find((order) => order.id === result.orderId);
      const printable: Order = loaded ?? {
        id: result.orderId,
        orderNumber: result.orderNumber,
        tableNumber: orderType === 'dine_in' ? tableNumber ?? undefined : undefined,
        orderType,
        items: result.items,
        subtotal: Number(result.subtotal),
        discount: Number(result.discount || 0),
        discountType: manualDiscountAmount > 0 ? manualDiscountType : 'flat',
        discountValue: manualDiscountAmount > 0 ? manualDiscountInput : 0,
        total: Number(result.total),
        status: 'served',
        createdBy: currentUser.username,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: notes || undefined,
        customerName: customerName || undefined,
        paymentType: billMethod,
        paymentBreakdown,
        billedBy,
        orderSource: 'staff',
        parcelCharges: parcelCharges || undefined,
        promotionDiscount: Number(result.promotionDiscount ?? 0),
        promotionIds: result.promotionIds || [],
        walletCashback: Number(result.cashback || 0),
      };
      printKotThenBill(printable, 'original', billMethod === 'cash' ? Number(cashTendered || 0) || undefined : undefined);
      checkoutIdempotencyRef.current = null;
      clearCart();
      setParcelCount(0);
      closeActiveTakeawayTicket();
      // BUG FIX: this is the most common checkout path (regular cash/UPI/card/
      // split bill for a table with no prior KOT) and it had the same missing
      // clearTableDraft() as the credit and wallet paths above — the single
      // biggest source of "Table 1 items not clearing after billing", since
      // it's the default path most dine-in bills go through.
      if (orderType === 'dine_in' && tableNumber != null) clearTableDraft(tableNumber);
      void loadTableBoard();
      setShowBillModal(false);
      setShowSuccess(true);
      setNotes(''); setCustomerName(''); setTableNumber(null);
      setCustomItems([]); setCustomName(''); setCustomPrice(''); setCustomQty('1');
      setBillMethod('cash'); setSplitPayment({ cash: '', upi: '', card: '' }); setCouponCode(''); setCashTendered(''); setManualDiscountValue('');
      setTimeout(() => setShowSuccess(false), 2200);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit order - please try again.');
    } finally {
      setSubmitting(false);
    }

  };

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-4">
        <div className="size-20 rounded-3xl flex items-center justify-center animate-scale-in"
          style={{
            background: paymentMode === 'credit'
              ? 'linear-gradient(135deg,rgba(220,38,38,0.12),rgba(220,38,38,0.06))'
              : 'linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.06))',
            border: paymentMode === 'credit'
              ? '2px solid rgba(220,38,38,0.25)'
              : '2px solid rgba(16,185,129,0.25)',
          }}>
          {paymentMode === 'credit'
            ? <CreditCard className="size-10 text-red-600" />
            : <Receipt className="size-10 text-emerald-600" />
          }
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">
            {paymentMode === 'credit' ? 'Credit Sale Recorded!' : 'Bill Created!'}
          </h2>
          <p className="text-muted-foreground font-body mt-1 text-sm">
            {paymentMode === 'credit'
              ? 'VRSNB Admin & Admin have been notified.'
              : 'Bill saved and print command opened.'
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
    {!counterOpenedToday && (
      <div className="m-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
        Counter is not opened today. Open Cashier Counter, then Counter Open before billing.
      </div>
    )}
    {showBillModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4" onClick={() => !submitting && setShowBillModal(false)}>
        <div className="w-full max-w-md rounded-3xl bg-background border border-border shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-border bg-emerald-50">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Final billing</p>
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                {orderType === 'dine_in' ? <><UtensilsCrossed className="size-3" />Table {tableNumber ? tableLabel(tableNumber) : ''}</> : <><ShoppingBag className="size-3" />Takeaway</>}
              </span>
            </div>
            <h2 className="font-display text-2xl font-black text-foreground">Bill & Print</h2>
            <p className="text-sm text-muted-foreground">Confirm payment mode. This saves the bill as paid and opens the print slip.</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground"><span>Items ({totalItemQty})</span><span className="tabular-nums">{formatCurrency(itemsSubtotal)}</span></div>
              {parcelCharges > 0 && <div className="flex justify-between text-sm text-amber-700"><span>Parcel charges</span><span className="font-black tabular-nums">+{formatCurrency(parcelCharges)}</span></div>}
              {manualDiscountAmount > 0 && <div className="flex justify-between text-sm text-rose-700"><span>Discount</span><span className="font-black tabular-nums">-{formatCurrency(manualDiscountAmount)}</span></div>}
              {promotionDiscount > 0 && <div className="flex justify-between text-sm text-emerald-700"><span>Promotion</span><span className="font-black tabular-nums">-{formatCurrency(promotionDiscount)}</span></div>}
              {roundOff !== 0 && <div className="flex justify-between text-sm text-muted-foreground"><span>Round off</span><span className="font-black tabular-nums">{roundOff > 0 ? '+' : ''}{formatCurrency(roundOff)}</span></div>}
              <div className="flex justify-between items-center pt-2 border-t border-border"><span className="font-bold">Payable</span><span className="font-display text-3xl font-black tabular-nums">{formatCurrency(total)}</span></div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 block">Discount</label>
              <div className="flex gap-2">
                <div className="flex gap-1 p-0.5 rounded-xl bg-muted shrink-0">
                  {([{ key: 'percentage' as const, label: '%' }, { key: 'flat' as const, label: '₹' }]).map(opt => (
                    <button key={opt.key} type="button"
                      onClick={() => setManualDiscountType(opt.key)}
                      className={cn('w-10 py-2.5 rounded-lg text-sm font-black transition-all',
                        manualDiscountType === opt.key ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0"
                  max={manualDiscountType === 'percentage' ? 100 : undefined}
                  value={manualDiscountValue}
                  onChange={e => setManualDiscountValue(e.target.value)}
                  placeholder={manualDiscountType === 'percentage' ? 'e.g. 10' : 'e.g. 50'}
                  className="flex-1 min-w-0 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 block">Payment mode</label>
              {paymentMode === 'wallet' ? (
                <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4 text-emerald-800">
                  <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 font-black"><Wallet className="size-5" />Customer Wallet</span><span className="font-black">{formatCurrency(walletAmount)}</span></div>
                  <div className="mt-2 flex justify-between text-xs font-bold"><span>{selectedWallet?.customerName || 'No wallet selected'}</span><span>Other {formatCurrency(walletRemainder)}</span></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    { key: 'cash' as const, label: 'Cash', icon: <Banknote className="size-5" /> },
                    { key: 'upi' as const, label: 'UPI', icon: <Smartphone className="size-5" /> },
                    { key: 'card' as const, label: 'Card', icon: <CreditCard className="size-5" /> },
                    { key: 'part_payment' as const, label: 'Part', icon: <Wallet className="size-5" /> },
                  ]).map(m => (
                    <button key={m.key} type="button" onClick={() => { setBillMethod(m.key); setSubmitError(''); }}
                      className={cn('rounded-2xl border-2 py-4 text-sm font-black flex flex-col items-center gap-1.5 active:scale-95 transition-all',
                        billMethod === m.key ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-border bg-card text-muted-foreground')}>
                      {m.icon}
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {paymentMode !== 'wallet' && billMethod === 'cash' && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cash tendered</span>
                  <input
                    type="number"
                    min="0"
                    value={cashTendered}
                    onChange={e => setCashTendered(e.target.value)}
                    placeholder={formatCurrency(total)}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                  />
                </label>
                {Number(cashTendered || 0) > total && (
                  <div className="flex items-center justify-between rounded-xl bg-card/80 px-3 py-2 text-xs font-black text-emerald-700">
                    <span>Change to return</span>
                    <span className="tabular-nums">{formatCurrency(Number(cashTendered) - total)}</span>
                  </div>
                )}
              </div>
            )}
            {billMethod === 'part_payment' && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Part Payment</p>
                  <p className={cn('text-xs font-black tabular-nums', Math.abs(splitRemaining) <= 0.01 ? 'text-emerald-700' : splitRemaining > 0 ? 'text-amber-700' : 'text-red-600')}>
                    {Math.abs(splitRemaining) <= 0.01 ? 'Matched' : splitRemaining > 0 ? `Remaining ${formatCurrency(splitRemaining)}` : `Extra ${formatCurrency(Math.abs(splitRemaining))}`}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'upi', 'card'] as const).map(method => (
                    <label key={method} className="block">
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">{method.toUpperCase()}</span>
                      <input
                        type="number"
                        min="0"
                        value={splitPayment[method]}
                        onChange={e => { setSplitPayment(prev => ({ ...prev, [method]: e.target.value })); setSubmitError(''); }}
                        placeholder="0"
                        className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-xl bg-card/80 px-3 py-2 text-xs font-black">
                  <span>Split total</span>
                  <span className="tabular-nums">{formatCurrency(splitTotal)} / {formatCurrency(total)}</span>
                </div>
              </div>
            )}
            {submitError && <p className="text-xs text-destructive font-semibold">{submitError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowBillModal(false)} disabled={submitting}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-bold active:scale-95 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleSubmit} disabled={submitting}
                className="flex-[1.4] py-3 rounded-xl bg-emerald-600 text-white text-sm font-black active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                <Printer className="size-4" />{submitting ? 'Billing...' : 'Bill & Print'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    <div className="biller-workspace flex flex-1 min-h-0 overflow-hidden">

      {/* -- COL 1: Category sidebar ---------------------- */}
      {itemMode === 'menu' && (
        <div className="biller-category-sidebar shrink-0 flex flex-col border-r border-border bg-muted/40 overflow-y-auto" style={{ width: "clamp(130px, 13vw, 180px)" }}>
          <div className="biller-category-mode px-2 py-2 border-b border-border bg-background shrink-0">
            <div className="flex gap-1 p-0.5 rounded-lg bg-muted">
              <button onClick={() => setItemMode('menu')}
                className="flex-1 py-2.5 rounded-md text-sm font-body font-bold transition-all bg-card shadow text-foreground flex items-center justify-center gap-1.5">
                <UtensilsCrossed className="size-4" />Menu
              </button>
              <button onClick={() => setItemMode('custom')}
                className="flex-1 py-2.5 rounded-md text-sm font-body font-bold transition-all text-muted-foreground active:scale-95 flex items-center justify-center gap-1.5">
                <Edit3 className="size-4" />Custom
              </button>
            </div>
          </div>
          {[{ id: 'all', name: 'All Items' }, ...menuCategories].map((cat) => {
            const isActive = selectedCategory === cat.id && !search.trim();
            const catCount = cat.id === 'all'
              ? enabledItems.length
              : enabledItems.filter(i => i.category === cat.id).length;
            return (
              <button key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setSearch(''); }}
                className={cn('biller-category-button w-full text-left px-3 py-3 border-b border-border/50 transition-all',
                  isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground')}>
                <p className="text-sm font-bold leading-tight">{cat.name}</p>
                <p className={cn('text-xs mt-0.5 tabular-nums', isActive ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {catCount} items
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* -- COL 2: Search + Item picker -------------------- */}
      <div className="biller-menu-panel flex-1 min-w-0 flex flex-col overflow-hidden">
        {itemMode === 'menu' ? (
          <>
            <div className="biller-search-shell px-3 py-2.5 border-b border-border bg-background shrink-0">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input type="text" placeholder={`Search all ${enabledItems.length} items...`} value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-muted/50 border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-card transition-all" />
                {search && <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="size-4" /></button>}
              </div>
              {search.trim() ? (
                <p className="text-[11px] text-primary font-semibold mt-1.5 px-1">
                  {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} across all categories
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
                  {selectedCategory === 'all' ? `${enabledItems.length} items` : `${filteredItems.length} in ${menuCategories.find(c => c.id === selectedCategory)?.name ?? selectedCategory}`}
                </p>
              )}
            </div>
            <div className="biller-item-scroll flex-1 overflow-y-auto px-2 py-2">
              {filteredItems.length === 0 ? (
                <EmptyState icon="" message="No items found" sub="Try a different category or clear your search" cta="Clear filters" onCta={() => { setSearch(''); setSelectedCategory('all'); }} />
              ) : (
                <div className="biller-menu-grid grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(116px, 1fr))' }}>
                  {filteredItems.map(item => (
                    <MenuItemCard key={item.id} item={item} quantity={getQty(item.id)}
                      onAdd={() => handleAddMenuItem(item)} onRemove={() => updateCartQuantity(item.id, getQty(item.id) - 1)} compact hideImage />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            <div className="flex gap-1 p-1 rounded-xl bg-muted">
              <button onClick={() => setItemMode('menu')}
                className="flex-1 py-2 rounded-lg text-sm font-body font-semibold transition-all text-muted-foreground active:scale-95 flex items-center justify-center gap-1.5">
                <UtensilsCrossed className="size-3.5" />Menu Items
              </button>
              <button onClick={() => setItemMode('custom')}
                className="flex-1 py-2 rounded-lg text-sm font-body font-semibold transition-all bg-card shadow text-foreground flex items-center justify-center gap-1.5">
                <Edit3 className="size-3.5" />Custom Items
              </button>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-soft">
              <div className="flex items-center gap-2 mb-1">
                <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Edit3 className="size-3.5 text-primary" />
                </div>
                <p className="text-sm font-body font-bold text-foreground">Add Custom Item</p>
              </div>
              <div>
                <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                  Item Name <span className="text-destructive">*</span>
                </label>
                <input type="text" placeholder="e.g. Special Thali, Custom Parcel..."
                  value={customName} onChange={e => { setCustomName(e.target.value); setCustomError(''); }}
                  className="w-full px-4 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-card transition-all"
                  onKeyDown={e => e.key === 'Enter' && handleAddCustomItem()} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">
                    Price (Rs ) <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <input type="number" min="0" step="0.5" placeholder="0.00"
                      value={customPrice} onChange={e => { setCustomPrice(e.target.value); setCustomError(''); }}
                      className="w-full pl-8 pr-3 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-card transition-all"
                      onKeyDown={e => e.key === 'Enter' && handleAddCustomItem()} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Qty</label>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCustomQty(q => String(Math.max(1, parseInt(q || '1') - 1)))}
                      aria-label="Decrease quantity"
                      className="size-10 shrink-0 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90 transition-all">
                      <Minus className="size-3.5" />
                    </button>
                    <input type="number" min="1" value={customQty} onChange={e => setCustomQty(e.target.value)}
                      className="flex-1 py-3 rounded-xl bg-muted/50 border border-border text-sm font-body tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-card transition-all" />
                    <button onClick={() => setCustomQty(q => String((parseInt(q || '1')) + 1))}
                aria-label="Increase quantity"
                      className="size-10 shrink-0 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90 transition-all">
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              {customError && (
                <p className="text-xs font-body text-destructive flex items-center gap-1.5">
                  <AlertCircle className="size-3 shrink-0" />{customError}
                </p>
              )}
              <button onClick={handleAddCustomItem}
                className="w-full py-3 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all text-primary-foreground shadow-teal"
                style={{ background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' }}>
                <Plus className="size-4" />Add to Bill
              </button>
            </div>
            {customItems.length > 0 ? (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-soft">
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-body font-bold text-foreground">Custom Items</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full cafe-gradient text-primary-foreground">{customItems.length}</span>
                  </div>
                  <button onClick={() => setCustomItems([])} className="text-xs font-body font-semibold text-destructive active:opacity-70">Clear all</button>
                </div>
                <div className="divide-y divide-border/50">
                  {customItems.map(ci => (
                    <div key={ci.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-body font-semibold text-foreground truncate">{ci.name}</p>
                        <p className="text-xs font-body text-muted-foreground tabular-nums">
                          {formatCurrency(ci.price)} x {ci.qty} = <span className="font-bold text-primary">{formatCurrency(ci.price * ci.qty)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => updateCustomQty(ci.id, ci.qty - 1)} className="size-7 rounded-lg bg-muted border border-border flex items-center justify-center active:scale-90"><Minus className="size-3" /></button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">{ci.qty}</span>
                        <button onClick={() => updateCustomQty(ci.id, ci.qty + 1)} className="size-7 rounded-lg text-primary-foreground flex items-center justify-center active:scale-90"
                          style={{ background: 'linear-gradient(135deg,hsl(164 52% 32%),hsl(164 52% 22%))' }}><Plus className="size-3" /></button>
                        <button onClick={() => updateCustomQty(ci.id, 0)} className="size-7 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 flex items-center justify-center active:scale-90 ml-0.5"><Trash2 className="size-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                  <Edit3 className="size-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-body text-muted-foreground">No custom items yet.</p>
                <p className="text-xs font-body text-muted-foreground/70">Add items not listed in the menu.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* -- COL 3: Bill summary ------------------------ */}
      <div className="biller-cart-panel shrink-0 flex flex-col border-l border-border bg-card overflow-hidden" style={{ width: "clamp(320px, 26vw, 420px)" }}>
        {/* SPACE FIX (2026-08-08): the "New Bill" title bar (icon + heading +
            item-count badge) sat above this context row saying nothing the
            context row itself doesn't already show, and ate vertical space
            from the cart on cramped touch terminals. Removed; its one real
            function (Clear) now lives as a compact icon button at the right
            of the context row so nothing is lost. */}
        <div className="biller-cart-context flex items-center gap-1.5 px-4 py-2 border-b border-border bg-background/60 shrink-0 text-[11px] font-body font-semibold overflow-x-auto">
          <span className={cn('flex items-center gap-1 px-2 py-1 rounded-full shrink-0',
            orderType === 'dine_in' ? 'bg-primary/10 text-primary' : 'bg-blue-100 text-blue-700')}>
            {orderType === 'dine_in' ? <UtensilsCrossed className="size-3" /> : <ShoppingBag className="size-3" />}
            {orderType === 'dine_in' ? 'Dine In' : 'Takeaway'}
          </span>
          {orderType === 'dine_in' && (
            tableNumber ? (
              <span className={cn('flex items-center gap-1 px-2 py-1 rounded-full shrink-0',
                runningOrder ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground')}>
                <MapPin className="size-3" />Table {tableLabel(tableNumber)}
                {runningOrder ? ` · Running (${runningItemCount})` : ' · New'}
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-destructive/10 text-destructive shrink-0">
                <AlertCircle className="size-3" />No table selected
              </span>
            )
          )}
          {!allEmpty && (
            <button onClick={() => { clearCart(); setParcelCount(0); setCustomItems([]); }}
              className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-body font-semibold text-destructive bg-destructive/10 px-2 py-1 rounded-lg active:scale-95 border border-destructive/15">
              Clear ({cartCount + customItems.length})
            </button>
          )}
        </div>

        {/* -- Order type + Table Board / Takeaway tickets: ALWAYS visible --
             SIZE FIX: on a cramped touch terminal these controls (toggle +
             table picker + legend) were eating too much vertical space above
             the cart, which is the part staff actually need to see/scroll.
             Shrunk padding/text/legend here so more of the panel below is
             cart. */}
        <div className="border-b border-border px-3 py-2 space-y-1.5 shrink-0 bg-background/40">
          <div className="flex gap-1.5">
            <button onClick={() => switchOrderType('dine_in')}
              className={cn('flex-1 py-1.5 rounded-lg text-xs font-body font-semibold transition-all active:scale-95',
                orderType === 'dine_in' ? 'text-primary-foreground shadow-teal' : 'bg-card border border-border text-foreground')}
              style={orderType === 'dine_in' ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}>
              Dine In
            </button>
            <button onClick={() => switchOrderType('takeaway')}
              className={cn('flex-1 py-1.5 rounded-lg text-xs font-body font-semibold transition-all active:scale-95',
                orderType === 'takeaway' ? 'text-primary-foreground shadow-teal' : 'bg-card border border-border text-foreground')}
              style={orderType === 'takeaway' ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}>
              Takeaway
            </button>
          </div>

          {orderType === 'dine_in' ? (
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[9px] font-body font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <MapPin className="size-2.5" />Table
                </label>
                <div className="flex items-center gap-1.5 text-[9px] font-body text-muted-foreground">
                  <span className="flex items-center gap-0.5"><span className="size-1.5 rounded-full bg-muted-foreground/30" />Free</span>
                  <span className="flex items-center gap-0.5"><span className="size-1.5 rounded-full bg-amber-500" />Running</span>
                  <span className="flex items-center gap-0.5"><span className="size-1.5 rounded-full bg-blue-400" />Draft</span>
                  <span className="flex items-center gap-0.5"><span className="size-1.5 rounded-full bg-fuchsia-500" />New</span>
                </div>
              </div>

              {/* Collapsed picker button — the cart below is always visible now;
                  the full table board only opens as a dropdown on demand. */}
              <button
                type="button"
                onClick={() => {
                  // Reopening jumps straight back into whichever section the
                  // current table belongs to; nothing selected yet always
                  // starts at the G/A chooser.
                  setTableSection(tableNumber ? tableSectionOf(tableNumber) : null);
                  setTablePickerOpen((open) => !open);
                }}
                className={cn('w-full flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-body font-bold transition-all active:scale-[0.98]',
                  tableError ? 'border-destructive/50 ring-1 ring-destructive/40' : 'border-border bg-muted/60')}>
                <span className="flex items-center gap-1.5 truncate">
                  {tableNumber ? (
                    <>
                      <span className={cn('size-2 rounded-full shrink-0',
                        tableBoard[tableNumber] !== undefined ? 'bg-amber-500'
                          : (tableDrafts[tableNumber]?.cart.length || tableDrafts[tableNumber]?.customItems.length) ? 'bg-blue-400'
                          : 'bg-muted-foreground/30')} />
                      Table {tableLabel(tableNumber)}
                      {tableBoard[tableNumber] !== undefined && ` · Running (${tableBoard[tableNumber]} item${tableBoard[tableNumber] === 1 ? '' : 's'})`}
                      {incomingByTable[tableNumber] ? ` · ${incomingByTable[tableNumber]} new item${incomingByTable[tableNumber] === 1 ? '' : 's'} waiting` : ''}
                    </>
                  ) : 'Tap to select a table'}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {tableNumber && incomingByTable[tableNumber] ? (
                    <span className="flex items-center justify-center rounded-full bg-fuchsia-500 text-white text-[10px] font-black size-5 animate-pulse">!</span>
                  ) : null}
                  <ChevronDown className={cn('size-4 transition-transform', tablePickerOpen && 'rotate-180')} />
                </div>
              </button>

              {tablePickerOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close table selector"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setTablePickerOpen(false)}
                  />
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border border-border bg-card p-2 shadow-2xl">
                    {tableSection === null ? (
                      // FEATURE (2026-08-08): "small box to select G or A" —
                      // the very first thing tapping the table field shows.
                      <div className="grid grid-cols-2 gap-2 p-1.5">
                        {(['G', 'A'] as const).map(section => (
                          <button
                            key={section}
                            type="button"
                            onClick={() => setTableSection(section)}
                            className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted/60 py-4 text-foreground hover:bg-muted active:scale-95"
                          >
                            <span className="text-2xl font-display font-black">{section}</span>
                            <span className="text-[10px] font-body font-bold text-muted-foreground">
                              {section}1 – {section}15
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div>
                        <button
                          type="button"
                          onClick={() => setTableSection(null)}
                          className="mb-1.5 flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-body font-bold text-muted-foreground hover:text-foreground"
                        >
                          ← Section {tableSection}
                        </button>
                        <div className="grid grid-cols-5 gap-1.5 p-1 rounded-2xl max-h-56 overflow-y-auto">
                          {(tableSection === 'G' ? TABLES_G : TABLES_A).map(num => {
                            const isSelected = tableNumber === num;
                            const isRunning = tableBoard[num] !== undefined;
                            const hasDraft = !isSelected && !isRunning && Boolean(tableDrafts[num]?.cart.length || tableDrafts[num]?.customItems.length);
                            return (
                              <button key={num}
                                onClick={() => { switchTable(num); setTablePickerOpen(false); }}
                                className={cn('relative py-2.5 rounded-xl text-xs font-body font-bold transition-all active:scale-90 flex flex-col items-center gap-0.5',
                                  isSelected ? 'text-primary-foreground shadow-teal ring-2 ring-offset-1 ring-emerald-500'
                                    : isRunning ? 'bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200'
                                    : hasDraft ? 'bg-blue-50 border border-blue-300 text-blue-700 hover:bg-blue-100'
                                    : 'bg-muted/60 border border-border text-foreground hover:bg-muted')}
                                style={isSelected ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}>
                                {incomingByTable[num] ? (
                                  <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-fuchsia-500 text-white text-[8px] font-black ring-2 ring-white">
                                    {incomingByTable[num]}
                                  </span>
                                ) : null}
                                {tableLabel(num)}
                                {isRunning && <span className="text-[9px] font-semibold opacity-80">{tableBoard[num]} item{tableBoard[num] === 1 ? '' : 's'}</span>}
                                {hasDraft && <span className="text-[9px] font-semibold opacity-80">draft</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {tableError && (
                <div className="flex items-center gap-1 mt-1.5 text-destructive">
                  <AlertCircle className="size-3" /><span className="text-[11px] font-body">Table required for Dine In</span>
                </div>
              )}

              {/* TABLE-SYNC FIX: orders placed for this table by the Order Pad
                  (order-taker) or by a customer via QR code — shown right here,
                  automatically, the moment the biller opens this table. Payment
                  can be collected directly on each card without re-entering
                  anything into the POS cart below. */}
              {incomingTableOrders.length > 0 && (
                <div className="mt-2">
                  <p className="flex items-center gap-1 text-[10px] font-body font-black text-fuchsia-700 uppercase tracking-widest mb-1.5">
                    <Bell className="size-3" />
                    {incomingTableOrders.length === 1 ? 'Order received for this table' : `${incomingTableOrders.length} orders received for this table`}
                  </p>
                  {/* Height-capped + independently scrollable — must never push
                      the draft cart below out of view, which was the exact bug
                      just fixed for the table picker itself. */}
                  <div className="max-h-72 overflow-y-auto space-y-2 rounded-2xl ring-1 ring-fuchsia-200/60 p-1.5 bg-fuchsia-50/30">
                    {incomingTableOrders.map(o => (
                      <OrderCard key={o.id} order={o} showActions counterOpenedToday={counterOpenedToday} />
                    ))}
                  </div>
                </div>
              )}

              {/* ONE-BILL FIX: a table that ordered more than once (running tab
                  + Order Pad/QR orders) previously needed a separate payment
                  action per order. This settles the whole table — draft cart,
                  running tab, and every incoming order — in a single payment
                  and a single printed receipt, without waiting on kitchen
                  status. */}
              {combineBillableCount >= 1 && (
                <button
                  type="button"
                  onClick={() => { setCombineError(''); setShowCombineBillModal(true); }}
                  className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-body font-black text-white active:scale-[0.98] transition-all shadow-teal"
                  style={{ background: 'linear-gradient(135deg,hsl(164 52% 30%),hsl(164 52% 20%))' }}
                >
                  <IndianRupee className="size-4" />
                  Bill This Table{combineBillableCount > 1 ? ` (${combineBillableCount} orders combined)` : ''}
                </button>
              )}

              {tableNumber && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs font-body">
                    {runningOrderLoading ? (
                      <span className="text-muted-foreground flex items-center gap-1"><Loader2 className="size-3 animate-spin" />Checking table…</span>
                    ) : runningOrder ? (
                      <span className="font-bold text-amber-600 flex items-center gap-1">
                        <UtensilsCrossed className="size-3.5" />Running · {runningItemCount} item{runningItemCount === 1 ? '' : 's'} sent
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Table is free — first KOT opens it</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {runningOrder && (
                      <button
                        onClick={() => { setMoveSection(tableSectionOf(tableNumber)); setMoveTarget({ scope: 'table' }); }}
                        disabled={movingTable}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 transition-all active:scale-95">
                        {movingTable ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
                        Move
                      </button>
                    )}
                    {runningOrder && (
                      <button
                        onClick={handleCancelTable}
                        disabled={cancellingTable}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-destructive bg-destructive/10 border border-destructive/20 transition-all active:scale-95">
                        {cancellingTable ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                        Cancel
                      </button>
                    )}
                    {/* BUG FIX ("i am only able to move only one item"): wrong
                        table picked BEFORE sending to kitchen — nothing here
                        let a biller move the whole draft cart at once, only
                        one item at a time via the per-item Move links below.
                        Mirrors the whole-table Move button above, just for
                        the not-yet-sent case. */}
                    {!runningOrder && (cart.length > 0 || customItems.length > 0) && (
                      <button
                        onClick={() => { setMoveSection(tableSectionOf(tableNumber)); setMoveTarget({ scope: 'draft' }); }}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 transition-all active:scale-95">
                        <ArrowRightLeft className="size-3.5" />
                        Move All
                      </button>
                    )}
                    <button
                      onClick={handleSendToKitchen}
                      disabled={sendingKot || allEmpty}
                      className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all active:scale-95',
                        allEmpty ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600')}>
                      {sendingKot ? <Loader2 className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
                      {sendingKot ? 'Sending…' : 'Send to Kitchen'}
                    </button>
                  </div>
                </div>
              )}
              {kotSuccess !== null && (
                <div className="mt-1.5 flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="size-3" /><span className="text-[11px] font-body font-semibold">KOT #{kotSuccess} printed &amp; sent to kitchen</span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest">Takeaway Orders</label>
                <button onClick={newTakeawayTicket} className="flex items-center gap-1 text-[11px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-lg active:scale-95">
                  <Plus className="size-3" />New
                </button>
              </div>
              {takeawayTickets.length === 0 ? (
                <p className="text-[11px] font-body text-muted-foreground">No open takeaway orders — add items below to start one, or tap New.</p>
              ) : (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {takeawayTickets.map((t) => (
                    <button key={t.id} onClick={() => switchTakeawayTicket(t.id)}
                      className={cn('shrink-0 px-3 py-2 rounded-xl text-xs font-body font-bold transition-all active:scale-95 whitespace-nowrap',
                        activeTakeawayId === t.id ? 'text-primary-foreground shadow-teal' : 'bg-muted border border-border text-foreground')}
                      style={activeTakeawayId === t.id ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* TABLE-SYNC FIX: takeaway orders placed by the Order Pad
                  (order-taker) or QR ordering land here automatically as soon
                  as they're submitted — no separate tab to hunt through. */}
              {incomingTakeawayOrders.length > 0 && (
                <div className="mt-3">
                  <p className="flex items-center gap-1 text-[10px] font-body font-black text-fuchsia-700 uppercase tracking-widest mb-1.5">
                    <Bell className="size-3" />
                    {incomingTakeawayOrders.length === 1 ? 'New takeaway order' : `${incomingTakeawayOrders.length} new takeaway orders`}
                  </p>
                  {/* Height-capped + independently scrollable — can't be
                      allowed to push the draft cart below out of view. */}
                  <div className="max-h-72 overflow-y-auto space-y-2 rounded-2xl ring-1 ring-fuchsia-200/60 p-1.5 bg-fuchsia-50/30">
                    {incomingTakeawayOrders.map(o => (
                      <OrderCard key={o.id} order={o} showActions counterOpenedToday={counterOpenedToday} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="biller-cart-items flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2">
          {allEmpty && !hasRunningItems ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground gap-2 text-center">
              <ShoppingBag className="size-8 opacity-25" />
              <p className="text-sm font-body font-bold">Cart is empty</p>
              <p className="text-xs font-body text-muted-foreground/70">Tap any item to add it here.</p>
            </div>
          ) : (
            <>
              {/* Already-confirmed items for this table's running order. These were
                  sent to the kitchen on a previous KOT and can no longer be edited
                  here — they're shown read-only so staff can see the full running
                  tally before hitting Create Bill, even when the draft cart below
                  is currently empty. */}
              {hasRunningItems && runningOrder!.items.map((ci, idx) => (
                <div key={`running-${idx}-${ci.menuItem.id}`} className="biller-cart-line rounded-2xl border border-amber-200 bg-amber-50/60 p-2.5 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-body font-black truncate leading-tight text-foreground">{ci.menuItem.name}</p>
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 shrink-0">SENT</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground tabular-nums">{ci.quantity} x {formatCurrency(ci.menuItem.price)}</p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <p className="text-sm text-amber-700 font-black tabular-nums">{formatCurrency(ci.menuItem.price * ci.quantity)}</p>
                    <button
                      type="button"
                      onClick={() => void handleCancelRunningItem(ci.menuItem.name)}
                      disabled={cancellingItemName === ci.menuItem.name}
                      title={`Cancel ${ci.menuItem.name}`}
                      className="rounded-full p-1 text-amber-700 hover:bg-amber-200/70 hover:text-amber-900 disabled:opacity-40"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {cart.map(ci => (
                <div key={ci.menuItem.id} className="biller-cart-line rounded-2xl border border-border bg-background p-2.5 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-body font-black truncate leading-tight text-foreground">{ci.menuItem.name}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">{formatCurrency(ci.menuItem.price)} each</p>
                  </div>
                  <div className="biller-cart-qty flex items-center gap-1.5 shrink-0">
                    <button onClick={() => updateCartQuantity(ci.menuItem.id, ci.quantity - 1)} className="size-8 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90" aria-label={`Decrease ${ci.menuItem.name}`}><Minus className="size-3.5" /></button>
                    <span className="min-w-8 text-center rounded-xl bg-muted/60 px-2 py-1.5 text-sm font-black tabular-nums">{ci.quantity}</span>
                    <button onClick={() => addToCart(ci.menuItem)} className="size-8 rounded-xl text-primary-foreground flex items-center justify-center active:scale-90" aria-label={`Increase ${ci.menuItem.name}`}
                      style={{ background: 'linear-gradient(135deg,hsl(164 52% 32%),hsl(164 52% 22%))' }}><Plus className="size-3.5" /></button>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-primary font-black tabular-nums">{formatCurrency(ci.menuItem.price * ci.quantity)}</p>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      {orderType === 'dine_in' && tableNumber != null && (
                        <button onClick={() => { setMoveSection(tableSectionOf(tableNumber)); setMoveTarget({ scope: 'item', itemKind: 'menu', itemId: ci.menuItem.id }); }} className="text-[10px] font-black text-blue-700 inline-flex items-center gap-1" aria-label={`Move ${ci.menuItem.name} to another table`}><ArrowRightLeft className="size-3" />Move</button>
                      )}
                      <button onClick={() => updateCartQuantity(ci.menuItem.id, 0)} className="text-[10px] font-black text-destructive inline-flex items-center gap-1" aria-label={`Remove ${ci.menuItem.name}`}><Trash2 className="size-3" />Remove</button>
                    </div>
                  </div>
                </div>
              ))}
              {customItems.map(ci => (
                <div key={ci.id} className="biller-cart-line rounded-2xl border border-amber-200 bg-amber-50/45 p-2.5 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-body font-black truncate leading-tight text-foreground">{ci.name}</p>
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">CUSTOM</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground tabular-nums">{formatCurrency(ci.price)} each</p>
                  </div>
                  <div className="biller-cart-qty flex items-center gap-1.5 shrink-0">
                    <button onClick={() => updateCustomQty(ci.id, ci.qty - 1)} className="size-8 rounded-xl bg-muted border border-border flex items-center justify-center active:scale-90" aria-label={`Decrease ${ci.name}`}><Minus className="size-3.5" /></button>
                    <span className="min-w-8 text-center rounded-xl bg-muted/60 px-2 py-1.5 text-sm font-black tabular-nums">{ci.qty}</span>
                    <button onClick={() => updateCustomQty(ci.id, ci.qty + 1)} className="size-8 rounded-xl text-primary-foreground flex items-center justify-center active:scale-90" aria-label={`Increase ${ci.name}`}
                      style={{ background: 'linear-gradient(135deg,hsl(164 52% 32%),hsl(164 52% 22%))' }}><Plus className="size-3.5" /></button>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-amber-700 font-black tabular-nums">{formatCurrency(ci.price * ci.qty)}</p>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      {orderType === 'dine_in' && tableNumber != null && (
                        <button onClick={() => { setMoveSection(tableSectionOf(tableNumber)); setMoveTarget({ scope: 'item', itemKind: 'custom', itemId: ci.id }); }} className="text-[10px] font-black text-blue-700 inline-flex items-center gap-1" aria-label={`Move ${ci.name} to another table`}><ArrowRightLeft className="size-3" />Move</button>
                      )}
                      <button onClick={() => updateCustomQty(ci.id, 0)} className="text-[10px] font-black text-destructive inline-flex items-center gap-1" aria-label={`Remove ${ci.name}`}><Trash2 className="size-3" />Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {showBillFooter && (
          <div className="biller-cart-footer border-t border-border px-4 py-3 space-y-3 bg-muted/20 shrink-0">
            {/* -- Payment Mode -- */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => { setPaymentMode('regular'); setBillMethod('cash'); setCreditError(''); }}
                className={cn('py-2.5 rounded-xl text-sm font-body font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5',
                  paymentMode === 'regular' ? 'text-primary-foreground shadow-teal' : 'bg-card border border-border text-foreground')}
                style={paymentMode === 'regular' ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}>
                <Banknote className="size-3.5" />Regular
              </button>
              <button onClick={() => { setPaymentMode('wallet'); setBillMethod('wallet'); setCreditError(''); }}
                className={cn('py-2.5 rounded-xl text-sm font-body font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5',
                  paymentMode === 'wallet' ? 'bg-emerald-700 text-white shadow-md' : 'bg-emerald-50 border border-emerald-200 text-emerald-800')}>
                <Wallet className="size-3.5" />Wallet
              </button>
              <button onClick={() => { setPaymentMode('credit'); setBillMethod('cash'); setCreditError(''); }}
                className={cn('py-2.5 rounded-xl text-sm font-body font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5',
                  paymentMode === 'credit' ? 'bg-red-600 text-white shadow-md' : 'bg-red-50 border border-red-200 text-red-700')}>
                <CreditCard className="size-3.5" />Credit
              </button>
            </div>

            <WalletOffersPanel
              branch="Cafe"
              lines={promotionLines}
              packagingCharges={parcelCharges}
              walletEnabled={paymentMode === 'wallet'}
              walletAmount={walletAmount}
              otherMode={walletOtherMode}
              selectedWallet={selectedWallet}
              authorizationSecret={walletAuthorizationSecret}
              onAuthorizationSecretChange={setWalletAuthorizationSecret}
              onWalletChange={setSelectedWallet}
              onWalletAmountChange={setWalletAmount}
              onOtherModeChange={setWalletOtherMode}
              onPromotionChange={handlePromotionChange}
              onCouponChange={handleCouponChange}
              compact
              showOffers={false}
            />
            {paymentMode === 'wallet' && walletOtherMode === 'credit' && walletRemainder > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-amber-800">Wallet + Credit due date</label>
                <input type="date" min={businessDate()} value={creditDueDate} onChange={(event) => setCreditDueDate(event.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm" />
              </div>
            )}

            {/* -- Credit sale form (shown only when Credit mode is active) -- */}
            {paymentMode === 'credit' && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3 space-y-2.5">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <CreditCard className="size-3.5 text-red-600" />
                  <p className="text-xs font-body font-bold text-red-700 uppercase tracking-widest">Credit Sale Details</p>
                </div>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input type="text" placeholder="Customer name *"
                    value={customerName}
                    onChange={e => { setCustomerName(e.target.value); setCreditError(''); }}
                    className="w-full pl-8 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-400/40 transition-all" />
                </div>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input type="tel" placeholder="Phone number *"
                    value={creditCustomerPhone}
                    onChange={e => { setCreditCustomerPhone(e.target.value); setCreditError(''); }}
                    className="w-full pl-8 pr-3 py-2.5 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-400/40 transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-body font-bold text-red-700 uppercase tracking-widest mb-1 block flex items-center gap-1">
                    <Calendar className="size-3" />Due Date *
                  </label>
                  <input type="date" value={creditDueDate}
                    min={businessDate()}
                    onChange={e => { setCreditDueDate(e.target.value); setCreditError(''); }}
                    className="w-full px-3 py-2.5 bg-card border border-border rounded-xl text-sm font-body focus:outline-none focus:ring-2 focus:ring-red-400/40 transition-all" />
                </div>
                <div className="flex items-center gap-2 bg-red-100/60 rounded-xl px-3 py-2">
                  <Bell className="size-3.5 text-red-600 shrink-0" />
                  <p className="text-[10px] font-body text-red-700">VRSNB Admin &amp; Admin will be notified automatically.</p>
                </div>
                {creditError && (
                  <p className="text-xs font-body text-destructive flex items-center gap-1.5">
                    <AlertCircle className="size-3 shrink-0" />{creditError}
                  </p>
                )}
              </div>
            )}
            {/* FEATURE (2026-08-22): "remove customer name field and order
                notes and less spicy for takeaway, and order notes/less
                spicy for dine in too — cart is too small, cashier can't
                see the create bill button." These three inputs (customer
                name, order notes, quick-notes) were adding real vertical
                height to an already width-constrained panel, directly
                contributing to the checkout button being pushed out of
                view — removed per explicit request, not just to save
                space. customerName/notes state variables are left
                completely alone; they're still referenced safely
                elsewhere (receipt printing, order submission) as empty
                strings, matching how an absent value is already handled
                everywhere else in this file. */}
            <div className="pt-1 border-t border-border space-y-2">
              {menuTotal > 0 && customTotal > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-body text-muted-foreground">
                    <span>Menu</span><span className="tabular-nums">{formatCurrency(menuTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-body text-primary">
                    <span>Custom</span><span className="tabular-nums">{formatCurrency(customTotal)}</span>
                  </div>
                </div>
              )}
              {promotionDiscount > 0 && (
                <div className="flex justify-between text-xs font-body text-emerald-700 bg-emerald-50 px-2 py-1.5 rounded-lg border border-emerald-200">
                  <span>Promotion discount</span><span className="tabular-nums font-bold">-{formatCurrency(promotionDiscount)}</span>
                </div>
              )}
              {orderType === 'takeaway' && (
                <div className="flex items-center justify-between text-xs font-body bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-200">
                  <span className="text-amber-700 font-semibold">Parcel (Rs {PARCEL_CHARGE_PER_PARCEL} each)</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setParcelCount(c => Math.max(0, c - 1))}
                      className="size-6 rounded-full bg-white border border-amber-300 text-amber-700 font-bold leading-none flex items-center justify-center active:scale-90">−</button>
                    <span className="w-4 text-center font-bold text-amber-800 tabular-nums">{parcelCount}</span>
                    <button type="button" onClick={() => setParcelCount(c => c + 1)}
                      className="size-6 rounded-full bg-white border border-amber-300 text-amber-700 font-bold leading-none flex items-center justify-center active:scale-90">+</button>
                    {parcelCharges > 0 && <span className="tabular-nums font-bold text-amber-700">+{formatCurrency(parcelCharges)}</span>}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-body text-base font-bold text-foreground">Total</span>
                <span className="font-display text-3xl font-bold text-foreground tabular-nums">{formatCurrency(total)}</span>
              </div>
              {submitError && <p className="text-xs font-body text-destructive text-center">{submitError}</p>}
              <button onClick={() => paymentMode === 'credit' ? handleSubmit() : openBillModal()}
                disabled={submitting || (orderType === 'dine_in' && !runningOrder && allEmpty)}
                className={cn(
                  'w-full py-3.5 rounded-xl font-body font-bold text-sm active:scale-[0.97] transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-white',
                  paymentMode === 'credit' ? 'shadow-md' : 'shadow-teal'
                )}
                style={{
                  background: paymentMode === 'credit'
                    ? 'linear-gradient(135deg,#dc2626,#b91c1c)'
                    : paymentMode === 'wallet'
                      ? 'linear-gradient(135deg,#047857,#065f46)'
                      : 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))',
                  boxShadow: paymentMode === 'credit'
                    ? '0 4px 16px rgba(220,38,38,0.35)'
                    : undefined,
                }}>
                {paymentMode === 'credit'
                  ? <><CreditCard className="size-4" />{submitting ? 'Recording...' : 'Record Credit Sale'}</>
                  : paymentMode === 'wallet'
                    ? <><Wallet className="size-4" />{submitting ? 'Processing...' : 'Pay with Wallet'}</>
                    : <><Receipt className="size-4" />{submitting ? 'Creating...' : 'Create Bill'}</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* ONE-BILL FIX: combined settlement modal for a table that ordered more
        than once (running tab + Order Pad/QR orders). */}
    {showCombineBillModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4" onClick={() => !combineSubmitting && setShowCombineBillModal(false)}>
        <div className="w-full max-w-md rounded-3xl bg-background border border-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="px-5 py-4 border-b border-border bg-fuchsia-50 shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-fuchsia-700">Combined billing</p>
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-fuchsia-700 bg-fuchsia-100 px-2 py-0.5 rounded-full">
                <UtensilsCrossed className="size-3" />Table {tableNumber ? tableLabel(tableNumber) : ''}
              </span>
            </div>
            <h2 className="font-display text-2xl font-black text-foreground">Bill This Table</h2>
            <p className="text-sm text-muted-foreground">
              {combineBillableCount > 1
                ? `Settles all ${combineBillableCount} orders for this table as one payment and one receipt.`
                : 'Settles this table’s order — no need to wait for the kitchen.'}
            </p>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-1.5">
              {runningOrder && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Running tab (sent via Send to Kitchen)</span>
                  <span className="tabular-nums">{runningOrder.items.reduce((s, i) => s + i.quantity, 0)} items</span>
                </div>
              )}
              {incomingTableOrders.map(o => (
                <div key={o.id} className="flex justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    {o.orderSource === 'qr' ? <QrCode className="size-3" /> : <UserCheck className="size-3" />}
                    Order #{o.orderNumber}
                  </span>
                  <span className="tabular-nums">{o.items.reduce((s, i) => s + i.quantity, 0)} items</span>
                </div>
              ))}
              {!allEmpty && (
                <div className="flex justify-between text-sm text-amber-700">
                  <span>Items still in this cart (will be sent to kitchen first)</span>
                  <span className="tabular-nums">{cartCount + customItems.length} items</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Payment method</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['cash', 'upi', 'card', 'credit'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCombineBillMethod(m)}
                    disabled={combineSubmitting}
                    className={cn('py-2.5 rounded-xl text-xs font-body font-bold uppercase transition-all active:scale-95',
                      combineBillMethod === m ? 'text-white shadow-teal' : 'bg-card border border-border text-foreground')}
                    style={combineBillMethod === m ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {combineBillMethod === 'credit' && (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Customer name"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  disabled={combineSubmitting}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-body"
                />
                <input
                  type="tel"
                  placeholder="Customer phone"
                  value={combineCreditPhone}
                  onChange={e => setCombineCreditPhone(e.target.value)}
                  disabled={combineSubmitting}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-body"
                />
                <input
                  type="date"
                  value={combineCreditDueDate}
                  onChange={e => setCombineCreditDueDate(e.target.value)}
                  disabled={combineSubmitting}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm font-body"
                />
              </div>
            )}

            {combineError && (
              <p className="text-sm font-body text-destructive bg-destructive/10 rounded-xl px-3 py-2">{combineError}</p>
            )}
          </div>

          <div className="p-5 pt-0 flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowCombineBillModal(false)}
              disabled={combineSubmitting}
              className="px-4 py-3 rounded-xl bg-muted text-foreground text-sm font-body font-semibold active:scale-95 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmCombinedBill}
              disabled={combineSubmitting}
              className="flex-1 py-3 rounded-xl text-white text-sm font-body font-black active:scale-[0.97] transition-all shadow-teal flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' }}
            >
              {combineSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}
              {combineSubmitting ? 'Billing…' : 'Confirm & Print One Bill'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* BUG FIX (production error ERR-20260810-C63EE19E, "moveTarget is not
        defined"): this Move Table / Move Item destination picker reads
        moveTarget/moveSection/movingTable/tableNumber/tableBoard/etc., which
        are all state that lives in THIS component (NewBillPanel). It was
        originally (wrongly) rendered from the outer BillingDashboard wrapper
        component instead, which has no such state at all — a plain
        ReferenceError the instant a biller opened this screen. Moved here,
        next to the state it actually reads. Same G/A-section-then-grid
        pattern as the main table selector above, so staff already know how
        to use it. Occupied tables are visually flagged the same way; picking
        one is allowed (Petpooja-style merge) but the whole-table move path
        asks for a confirm first (see handleMoveTable). */}
    {moveTarget && tableNumber != null && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4" onClick={closeMovePicker}>
        <div className="w-full max-w-sm rounded-3xl border border-border bg-background p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="font-display text-base font-black flex items-center gap-1.5"><ArrowRightLeft className="size-4 text-blue-700" />
                {moveTarget.scope === 'table' ? `Move Table ${tableLabel(tableNumber)}`
                  : moveTarget.scope === 'draft' ? `Move all items from Table ${tableLabel(tableNumber)}`
                  : 'Move item to table'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {moveTarget.scope === 'table'
                  ? 'Moves this table\'s whole running order to the table you pick.'
                  : moveTarget.scope === 'draft'
                  ? 'Moves every item in this table\'s unsent draft to the picked table\'s draft.'
                  : 'Moves just this item into the picked table\'s draft.'}
              </p>
            </div>
            <button onClick={closeMovePicker} className="p-1.5 rounded-lg bg-muted shrink-0"><X className="size-4" /></button>
          </div>

          {moveSection === null ? (
            <div className="grid grid-cols-2 gap-2 p-1">
              {(['G', 'A'] as const).map((section) => (
                <button key={section} type="button" onClick={() => setMoveSection(section)}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted/60 py-4 text-foreground hover:bg-muted active:scale-95">
                  <span className="text-2xl font-display font-black">{section}</span>
                  <span className="text-[10px] font-body font-bold text-muted-foreground">{section}1 – {section}15</span>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <button type="button" onClick={() => setMoveSection(null)} className="mb-1.5 flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-body font-bold text-muted-foreground hover:text-foreground">
                ← Section {moveSection}
              </button>
              <div className="grid grid-cols-5 gap-1.5 p-1 rounded-2xl max-h-64 overflow-y-auto">
                {(moveSection === 'G' ? TABLES_G : TABLES_A).filter((num) => num !== tableNumber).map((num) => {
                  const isRunning = tableBoard[num] !== undefined;
                  const hasDraft = !isRunning && Boolean(tableDrafts[num]?.cart.length || tableDrafts[num]?.customItems.length);
                  // A whole-table move can't land on a table that already
                  // has its own running order (see handleMoveTable) — grey
                  // it out here instead of letting the tap end in an alert.
                  // Moving a single unsent item has no such conflict.
                  const blocked = moveTarget.scope === 'table' && isRunning;
                  return (
                    <button key={num} disabled={movingTable || blocked}
                      onClick={() => moveTarget.scope === 'table' ? handleMoveTable(num) : moveTarget.scope === 'draft' ? handleMoveDraftAll(num) : handleMoveItem(num)}
                      className={cn('relative py-2.5 rounded-xl text-xs font-body font-bold transition-all active:scale-90 flex flex-col items-center gap-0.5',
                        blocked ? 'bg-muted/30 border border-border text-muted-foreground/50 cursor-not-allowed'
                          : isRunning ? 'bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200'
                          : hasDraft ? 'bg-blue-50 border border-blue-300 text-blue-700 hover:bg-blue-100'
                          : 'bg-muted/60 border border-border text-foreground hover:bg-muted')}>
                      {incomingByTable[num] ? (
                        <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-fuchsia-500 text-white text-[8px] font-black ring-2 ring-white">{incomingByTable[num]}</span>
                      ) : null}
                      {tableLabel(num)}
                      {isRunning && <span className="text-[9px] font-semibold opacity-80">{tableBoard[num]} item{tableBoard[num] === 1 ? '' : 's'}</span>}
                      {hasDraft && <span className="text-[9px] font-semibold opacity-80">draft</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}

// -- Main BillingDashboard -----------------------------------------------------

type CafeEditablePaymentMode = 'cash' | 'upi' | 'card';

interface CafePaymentEditAudit {
  order_id: string;
  old_mode: string;
  new_mode: string;
  changed_by: string;
  reason: string;
  changed_at: string;
}

function CafePaymentModeEditTab({ orders }: { orders: Order[] }) {
  const { currentUser } = useAuthStore();
  const loadOrders = useOrderStore((state) => state.loadOrders);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nextMode, setNextMode] = useState<CafeEditablePaymentMode>('cash');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [auditRows, setAuditRows] = useState<CafePaymentEditAudit[]>([]);

  const loadAuditRows = useCallback(async () => {
    const { data, error } = await supabase
      .from('cafe_payment_mode_edits')
      .select('order_id, old_mode, new_mode, changed_by, reason, changed_at')
      .order('changed_at', { ascending: false })
      .limit(500);
    if (!error && data) setAuditRows(data as CafePaymentEditAudit[]);
  }, []);

  useEffect(() => {
    // EGRESS FIX: was 3650 (10 years). This tab is for correcting the payment
    // mode on a recent bill, opened on demand — 365 days is a generous window
    // for that without re-downloading the store's entire order history.
    void loadOrders(365);
    void loadAuditRows();
  }, [loadAuditRows, loadOrders]);

  const auditsByOrder = useMemo(() => {
    const map = new Map<string, CafePaymentEditAudit>();
    auditRows.forEach((row) => { if (!map.has(row.order_id)) map.set(row.order_id, row); });
    return map;
  }, [auditRows]);

  const editableOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders
      .filter((order) => order.status === 'served' && ['cash', 'upi', 'card'].includes(order.paymentType))
      .filter((order) => {
        if (!normalized) return true;
        return [
          String(order.orderNumber),
          order.customerName || '',
          order.billedBy || '',
          order.createdBy || '',
          order.paymentType,
        ].some((value) => String(value).toLowerCase().includes(normalized));
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, query]);

  const beginEdit = (order: Order) => {
    setEditingId(order.id);
    setNextMode(order.paymentType as CafeEditablePaymentMode);
    setReason('');
    setMessage('');
  };

  const saveEdit = async (order: Order) => {
    if (nextMode === order.paymentType) {
      setMessage('Choose a different payment mode.');
      return;
    }
    setSaving(true);
    setMessage('');
    const changedBy = currentUser?.displayName || currentUser?.username || 'Cafe Biller';
    const { error } = await supabase.rpc('edit_cafe_order_payment_mode', {
      p_order_id: order.id,
      p_new_mode: nextMode,
      p_changed_by: changedBy,
      p_reason: reason.trim() || null,
    });
    if (error) {
      setMessage(error.message.includes('edit_cafe_order_payment_mode')
        ? 'Cafe payment-mode migration is not installed. Apply the included Supabase migration first.'
        : error.message);
      setSaving(false);
      return;
    }
    await Promise.all([loadOrders(365), loadAuditRows()]);
    setEditingId(null);
    setReason('');
    setSaving(false);
    setMessage(`Bill #${String(order.orderNumber).padStart(4, '0')} payment mode updated to ${nextMode.toUpperCase()}.`);
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-slate-50 p-2 sm:p-3">
      <section className="mx-auto max-w-7xl overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-lg shadow-slate-200/50">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-600">Cafe Biller</p>
            <h2 className="text-2xl font-black text-slate-950">Payment Mode Edit</h2>
            <p className="text-sm font-semibold text-slate-500">Only Cash, UPI and Card can be corrected. Items, quantities and bill totals remain locked.</p>
          </div>
          <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search bill, customer or cashier" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-bold outline-none focus:border-rose-500 focus:bg-white" /></div>
        </div>

        {message && <div className={cn('mx-4 mt-3 rounded-xl px-3 py-2 text-sm font-bold', message.includes('updated') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{message}</div>}

        <div className="overflow-x-auto p-3">
          <table className="w-full min-w-[900px] border-separate border-spacing-y-1 text-left">
            <thead><tr className="text-[10px] font-black uppercase tracking-wider text-slate-500"><th className="px-3 py-2">Bill</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Cashier</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Payment Mode</th><th className="px-3 py-2">Last Correction</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
            <tbody>
              {editableOrders.map((order) => {
                const audit = auditsByOrder.get(order.id);
                const editing = editingId === order.id;
                return (
                  <tr key={order.id} className="bg-slate-50 text-sm font-semibold text-slate-700">
                    <td className="rounded-l-xl px-3 py-3 font-black text-slate-950">#{String(order.orderNumber).padStart(4, '0')}</td>
                    <td className="px-3 py-3 text-xs">{new Date(order.createdAt).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-3">{order.customerName || '-'}</td>
                    <td className="px-3 py-3">{order.billedBy || order.createdBy}</td>
                    <td className="px-3 py-3 font-black tabular-nums text-slate-950">{formatCurrency(order.total)}</td>
                    <td className="px-3 py-3">
                      {editing ? (
                        <select value={nextMode} onChange={(event) => setNextMode(event.target.value as CafeEditablePaymentMode)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black uppercase outline-none focus:border-rose-500"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select>
                      ) : <span className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase text-white">{order.paymentType}</span>}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-slate-500">{audit ? `${audit.old_mode.toUpperCase()} → ${audit.new_mode.toUpperCase()} · ${new Date(audit.changed_at).toLocaleString('en-IN')}` : 'No correction'}</td>
                    <td className="rounded-r-xl px-3 py-3 text-right">
                      {editing ? (
                        <div className="flex items-center justify-end gap-2"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (optional)" className="h-9 w-40 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold outline-none focus:border-rose-500" /><button onClick={() => void saveEdit(order)} disabled={saving} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Save</button><button onClick={() => setEditingId(null)} className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-black text-slate-700">Cancel</button></div>
                      ) : (
                        <div className="flex items-center justify-end gap-2"><button onClick={() => printPaidBill(order, 'duplicate')} className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-black text-slate-700">Duplicate</button><button onClick={() => beginEdit(order)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Edit Mode</button></div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {editableOrders.length === 0 && <div className="rounded-2xl bg-slate-50 p-10 text-center font-bold text-slate-500">No eligible Cash, UPI or Card bills found.</div>}
        </div>
      </section>
    </div>
  );
}

// -- Printer Setup modal -------------------------------------------------------
// Lets the biller assign which installed Windows printer is the Bill
// Printer vs the Kitchen KOT Printer, so QZ Tray (see src/lib/qzPrint.ts)
// can route each print job silently to the correct machine. If QZ Tray
// isn't installed/running on this PC yet, this just shows install
// instructions — nothing here is required for the app to keep working the
// old way (manual print dialog / single default printer).
function PrinterSetupModal({ onClose }: { onClose: () => void }) {
  const [qzOnline, setQzOnline] = useState<boolean | null>(null);
  const [printers, setPrinters] = useState<string[]>([]);
  const [billPrinter, setBillPrinterState] = useState(() => getPrinterPref('bill'));
  const [kotPrinter, setKotPrinterState] = useState(() => getPrinterPref('kot'));
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    const online = await isQzAvailable();
    setQzOnline(online);
    setPrinters(online ? await listQzPrinters() : []);
    setChecking(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = (role: 'bill' | 'kot', value: string) => {
    setPrinterPref(role, value);
    if (role === 'bill') setBillPrinterState(value);
    else setKotPrinterState(value);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="size-11 shrink-0 rounded-2xl bg-slate-100 flex items-center justify-center"><Printer className="size-5 text-slate-700" /></div>
            <div>
              <h2 className="font-display text-lg font-black">Printer Setup</h2>
              <p className="text-sm text-muted-foreground">Send KOTs to the kitchen printer and bills to the counter printer automatically.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-muted"><X className="size-4" /></button>
        </div>

        <div className="mt-4 rounded-xl border border-border p-3">
          <div className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', qzOnline ? 'bg-emerald-500' : 'bg-red-500')} />
            <span className="text-sm font-bold">{checking ? 'Checking QZ Tray…' : qzOnline ? 'QZ Tray connected' : 'QZ Tray not detected'}</span>
            <button onClick={() => void refresh()} className="ml-auto text-xs font-bold text-muted-foreground underline">Recheck</button>
          </div>
          {!checking && !qzOnline && (
            <div className="mt-2 space-y-2 text-xs text-muted-foreground">
              <p>
                Install QZ Tray (free, one-time) from <span className="font-bold">qz.io</span> on this billing computer, then click Recheck.
                Until it's installed, KOT and Bill will keep printing the old way (whatever printer is set as Windows default).
              </p>
              <p className="rounded-lg bg-amber-50 p-2 text-amber-800">
                <span className="font-bold">Already installed and running, but still shows "not detected"?</span> This is normal the first time — this website talks to QZ Tray over a secure connection your browser doesn't trust yet. Fix it once: open a <span className="font-bold">new browser tab</span>, go to <span className="font-bold">https://localhost:8181</span>, click "Advanced" then "Proceed" on the warning page, then come back here and click Recheck.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-black uppercase text-muted-foreground">Kitchen KOT Printer</label>
            {qzOnline ? (
              <select value={kotPrinter} onChange={(e) => save('kot', e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold">
                <option value="">Not set — use Windows default</option>
                {printers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input value={kotPrinter} onChange={(e) => save('kot', e.target.value)} placeholder="Exact printer name from Windows" className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold" />
            )}
          </div>
          <div>
            <label className="text-xs font-black uppercase text-muted-foreground">Bill / Receipt Printer</label>
            {qzOnline ? (
              <select value={billPrinter} onChange={(e) => save('bill', e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold">
                <option value="">Not set — use Windows default</option>
                {printers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input value={billPrinter} onChange={(e) => save('bill', e.target.value)} placeholder="Exact printer name from Windows" className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold" />
            )}
          </div>
        </div>

        <button onClick={onClose} className="mt-5 w-full rounded-xl bg-slate-950 py-3 text-sm font-black text-white">Done</button>
      </div>
    </div>
  );
}

// -- Main BillingDashboard -----------------------------------------------------
export default function BillingDashboard() {
  // STORE-01 FIX: granular selector with shallow equality - avoids full re-render on cart/loading changes
  const { orders, startPolling, stopPolling, polling, loadOrders } = useOrderStore(
    useShallow(s => ({
      orders: s.orders,
      startPolling: s.startPolling,
      stopPolling: s.stopPolling,
      polling: s.polling,
      loadOrders: s.loadOrders,
    }))
  );
  const { currentUser } = useAuthStore();
  const counterOpenedToday = useCafeCounterOpened();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<OrderStatus | 'new_bill' | 'advance' | 'alerts' | 'payment_edit'>('new_bill');

  useEffect(() => {
    const requested = searchParams.get('tab');
    if (requested === 'advance') setActiveTab('advance');
    else if (requested === 'alerts') setActiveTab('alerts');
    else if (requested === 'payment-edit') setActiveTab('payment_edit');
    else if (requested === 'history') setActiveTab('served');
    else setActiveTab('new_bill');
  }, [searchParams]);

  // STATE-LOSS FIX: this used to clear the cart (and pop a "you'll lose your
  // items" confirmation) whenever staff switched away from New Bill/Advance,
  // because those panels used to fully unmount on tab switch and the cart
  // would've been orphaned anyway. Now that NewBillPanel/AdvanceOrderPanel
  // stay permanently mounted (just hidden) below, nothing is lost by
  // switching tabs, so this can just be a plain tab switch — no clearing,
  // no confirmation dialog needed.
  const switchTab = (tab: OrderStatus | 'new_bill' | 'advance' | 'alerts' | 'payment_edit') => {
    setActiveTab(tab);
    if (tab === 'new_bill') setSearchParams({});
    else if (tab === 'advance') setSearchParams({ tab: 'advance' });
    else if (tab === 'alerts') setSearchParams({ tab: 'alerts' });
    else if (tab === 'payment_edit') setSearchParams({ tab: 'payment-edit' });
    else setSearchParams({ tab: 'history' });
  };

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const refreshOrders = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // EGRESS FIX: matches the 90-day background poll window above (was 3650).
      await loadOrders(90);
    } finally {
      setRefreshing(false);
    }
  }, [loadOrders, refreshing]);

  useEffect(() => {
    // EGRESS FIX: this was polling the ENTIRE 10-year order history (including
    // the items/payment_breakdown JSONB per row) every 15 minutes, for as long
    // as the Cafe billing screen stayed open — regardless of which tab
    // (New Bill / Advance / Payment Edit) was actually active. 90 days is more
    // than enough to cover any realistic still-open advance booking while
    // cutting this poll's payload by roughly two orders of magnitude. The
    // Payment Mode Edit tab below does its own on-demand deep-history fetch
    // only when a cashier explicitly opens it.
    startPolling(90);
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const todayOrders = useMemo(() => {
    // BUG FIX: this bucketed "today" using raw browser-local toDateString()
    // instead of the IST-safe businessDate() helper already used elsewhere
    // in this same file (counter-open/closure logic). On a terminal with a
    // wrong OS timezone/clock, orders near midnight could vanish from or
    // wrongly appear in the biller's New/Completed/Cancelled tabs.
    const todayKey = businessDate();
    return orders.filter(o => businessDate(o.createdAt) === todayKey);
  }, [orders]);

  // Advance orders: paymentType=advance AND balance still outstanding (not yet fully paid)
  const advanceOrders = useMemo(() =>
    orders
      .filter(o =>
        o.status !== 'cancelled' &&
        o.paymentType === 'advance' &&
        !o.fullyPaidAt &&
        Number(o.balanceDue ?? 0) > 0
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders]
  );

  // Alerts are operational reminders for TODAY only. Historical completed payments
  // and future delivery commitments must not clutter this tab.
  const todayDeliveryAlerts = useMemo(() => orders
    .filter(o =>
      o.status !== 'cancelled' &&
      o.paymentType === 'advance' &&
      Boolean(o.deliveryDate) &&
      todayIso(new Date(o.deliveryDate!)) === todayIso()
    )
    .sort((a, b) => new Date(a.deliveryDate!).getTime() - new Date(b.deliveryDate!).getTime()), [orders]);
  const [showDeliveryPopup, setShowDeliveryPopup] = useState(false);
  const [showPrinterSetup, setShowPrinterSetup] = useState(false);
  useEffect(() => {
    if (todayDeliveryAlerts.length === 0 || !currentUser?.username) return;
    const key = `biller-delivery-popup:${currentUser.username}:${todayIso()}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, 'shown');
    setShowDeliveryPopup(true);
  }, [todayDeliveryAlerts.length, currentUser?.username]);

  // Regular orders: exclude OPEN advance orders (pending balance) only.
  // Closed advance orders (balanceDue=0) ARE included so they appear in All/status tabs.
  // QR-FIX: QR orders that are still pending/preparing belong to the kitchen, NOT the biller.
  // Billing only needs to see QR orders once the kitchen marks them ready (or they're served/cancelled).
  const regularOrders = useMemo(() =>
    todayOrders.filter(o => {
      if (o.paymentType === 'advance' && (o.balanceDue ?? 0) > 0) return false; // open advance
      if (o.orderSource === 'qr' && (o.status === 'pending' || o.status === 'preparing')) return false; // kitchen queue
      return true;
    }),
    [todayOrders]
  );

  const isUnpaidOpenOrder = useCallback((order: Order) =>
    order.paymentType === 'unpaid' && order.status !== 'cancelled',
    []
  );

  const matchesStatusTab = useCallback((order: Order, status: OrderStatus) => {
    if (status === 'pending') return isUnpaidOpenOrder(order);
    if (status === 'cancelled') return order.status === 'cancelled';
    // BUG FIX: 'served' ("Completed") used to require order.status ===
    // 'served' exactly — but paid orders only advance to 'served' when a
    // staff member manually clicks through the kitchen-status buttons (or
    // via the auto-promote safeguard when status reaches 'ready'). An order
    // that's fully paid but whose kitchen status was never advanced past
    // pending/preparing (e.g. a quick item nobody bothered clicking through)
    // matched neither 'pending' (payment isn't unpaid) nor 'served' (status
    // isn't there) — it vanished from every tab. A paid, non-cancelled order
    // now always shows under Completed regardless of its exact kitchen status.
    return !isUnpaidOpenOrder(order) && order.status !== 'cancelled';
  }, [isUnpaidOpenOrder]);

  const filtered = useMemo(() => {
    if (activeTab === 'new_bill' || activeTab === 'advance' || activeTab === 'alerts' || activeTab === 'payment_edit') return [];
    let result = regularOrders.filter(o => matchesStatusTab(o, activeTab));
    if (sourceFilter !== 'all') result = result.filter(o => o.orderSource === sourceFilter);
    return result;
  }, [regularOrders, activeTab, sourceFilter, matchesStatusTab]);

  // Counts use regularOrders so advance (pending balance) never pollutes them
  const qrCount = regularOrders.filter(o => o.orderSource === 'qr').length;
  const staffCount = regularOrders.filter(o => o.orderSource === 'staff').length;

  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden bg-background"
      style={{
        height: '100%',
        paddingTop: '.2rem',
      }}
      data-billing-dashboard
    >

      {showDeliveryPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-5">
          <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-background p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3"><div className="size-11 rounded-2xl bg-amber-100 flex items-center justify-center"><Bell className="size-5 text-amber-700" /></div><div><h2 className="font-display text-lg font-black">Delivery due today</h2><p className="text-sm text-muted-foreground">{todayDeliveryAlerts.length} advance order{todayDeliveryAlerts.length === 1 ? '' : 's'} require delivery today.</p></div></div>
              <button onClick={() => setShowDeliveryPopup(false)} className="p-2 rounded-xl bg-muted"><X className="size-4" /></button>
            </div>
            <div className="mt-4 max-h-64 overflow-y-auto space-y-2">{todayDeliveryAlerts.map(o => <div key={o.id} className="rounded-2xl border border-border p-3"><div className="flex justify-between gap-3"><span className="font-bold">#{String(o.orderNumber).padStart(4,'0')} · {o.customerName || 'Customer'}</span><span className="text-xs font-bold text-amber-700">{new Date(o.deliveryDate!).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span></div><p className="text-xs text-muted-foreground mt-1">Balance: {formatCurrency(o.balanceDue ?? 0)}</p></div>)}</div>
            <button onClick={() => { setShowDeliveryPopup(false); switchTab('alerts'); }} className="mt-4 w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-white">Open Alerts</button>
          </div>
        </div>
      )}

      {showPrinterSetup && <PrinterSetupModal onClose={() => setShowPrinterSetup(false)} />}

      {/* Compact live/order filter rail. Main Cafe navigation now lives above this page. */}
      <div className="biller-status-bar shrink-0 border-b border-border bg-background px-3 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <div className="mr-1 flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', polling ? 'bg-emerald-400 animate-pulse' : 'bg-gray-400')} />
            <span className="text-[11px] font-bold text-muted-foreground">{polling ? 'Live' : 'Offline'}</span>
          </div>
          <button
            type="button"
            onClick={() => void refreshOrders()}
            disabled={refreshing}
            title="Refresh orders"
            aria-label="Refresh orders"
            className="mr-1 inline-flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={() => setShowPrinterSetup(true)}
            title="Printer setup (route KOT vs Bill to specific printers)"
            aria-label="Printer setup"
            className="mr-1 inline-flex size-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
          >
            <Printer className="size-3.5" />
          </button>

          {([
            { key: 'all' as SourceFilter, label: `Total: ${regularOrders.length}`, icon: null },
            { key: 'staff' as SourceFilter, label: `Staff: ${staffCount}`, icon: <UserCheck className="size-3" /> },
            { key: 'qr' as SourceFilter, label: `QR: ${qrCount}`, icon: <QrCode className="size-3" /> },
          ] as {key:SourceFilter;label:string;icon:React.ReactNode}[]).map(s => (
            <button key={s.key} onClick={() => setSourceFilter(s.key)}
              className={cn('flex min-h-7 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black transition-all',
                sourceFilter === s.key ? 'bg-foreground text-background' : 'border border-border bg-muted/60 text-muted-foreground active:scale-95')}>
              {s.icon}{s.label}
            </button>
          ))}

          <span className="mx-0.5 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

          {STATUS_TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const count = sourceFilter === 'all'
              ? regularOrders.filter(o => matchesStatusTab(o, tab.key)).length
              : regularOrders.filter(o => matchesStatusTab(o, tab.key) && o.orderSource === sourceFilter).length;
            return (
              <button key={tab.key} onClick={() => switchTab(tab.key)}
                className={cn('flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black whitespace-nowrap transition-all active:scale-95',
                  isActive ? 'border-emerald-700 bg-emerald-700 text-white shadow-sm' : 'border-border bg-card text-foreground')}>
                <span className={cn('size-1.5 rounded-full shrink-0', isActive ? 'bg-white/85' : tab.dotColor)} />
                {tab.label}
                {count > 0 && <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] leading-none', isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {/* STATE-LOSS FIX: New Bill and Advance used to be conditionally
          rendered ({activeTab === 'new_bill' ? <NewBillPanel/> : ...}), which
          fully unmounted them the instant staff switched to any other tab
          (History, Alerts, Payment Edit) — destroying every piece of local
          state that lives inside those panels (draft carts per table, draft
          takeaway tickets, custom items, selected table/order type). The
          existing "unsaved cart" confirmation only guarded the Zustand
          `cart.length` (menu items in the *currently active* table/ticket)
          and even then still wiped it on confirm — it never protected custom
          items or the other tables'/tickets' saved drafts, which were always
          silently destroyed on every tab switch. Both panels now stay
          mounted permanently and are just hidden with CSS when not active,
          so all of that draft state survives switching tabs and back. */}
      <div className={cn('flex-1 min-h-0 flex-col overflow-hidden', activeTab === 'new_bill' ? 'flex' : 'hidden')}><NewBillPanel /></div>
      <div className={cn('flex-1 min-h-0 flex-col overflow-hidden', activeTab === 'advance' ? 'flex' : 'hidden')}><AdvanceOrderPanel onCreated={() => {}} advanceOrders={advanceOrders} /></div>
      {activeTab === 'new_bill' || activeTab === 'advance' ? null : activeTab === 'payment_edit' ? (
        <div className="flex-1 min-h-0 overflow-hidden"><CafePaymentModeEditTab orders={orders} /></div>
      ) : activeTab === 'alerts' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><h2 className="font-display text-lg font-black text-red-800">Today's Delivery Alerts</h2><p className="text-xs text-red-700 mt-1">Only advance orders scheduled for delivery today are shown.</p></div>
          {todayDeliveryAlerts.length === 0 ? <EmptyState icon={<Bell className="size-8" />} title="No deliveries due today" description="Advance orders scheduled for today will appear here." /> : todayDeliveryAlerts.map(o => <OrderCard key={o.id} order={o} showActions counterOpenedToday={counterOpenedToday} />)}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="size-20 rounded-3xl bg-muted flex items-center justify-center">
                <Inbox className="size-10 text-muted-foreground/40" />
              </div>
              <div className="text-center">
                <p className="font-body font-semibold text-foreground">No orders here</p>
                <p className="text-sm font-body text-muted-foreground mt-1">
                  {sourceFilter !== 'all'
                    ? `No ${activeTab} orders from ${sourceFilter === 'qr' ? 'QR' : 'Staff'} right now`
                    : activeTab === 'pending' ? 'Waiting for new orders...' : `No ${activeTab} orders right now`}
                </p>
                {sourceFilter !== 'all' && (
                  <button
                    onClick={() => setSourceFilter('all')}
                    className="mt-3 text-sm font-body font-semibold text-primary underline underline-offset-2 active:opacity-70"
                  >
                    Clear filter - show all sources
                  </button>
                )}
              </div>
            </div>
          ) : (
            filtered.map(order => <OrderCard key={order.id} order={order} showActions counterOpenedToday={counterOpenedToday} />)
          )}
        </div>
      )}
    </div>
  );

}
