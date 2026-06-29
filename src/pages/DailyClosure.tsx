import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Banknote,
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
import { useBranchStore } from '@/branch/branchStore';
import { useBranchOpsStore } from '@/branch/branchOpsStore';
import { supabase } from '@/lib/supabase';
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

function safeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const { creditSales: branchCreditSales, creditPayments: branchCreditPayments, fetchCreditSales, fetchCreditPayments } = useBranchStore();
  const { counterOpenings, openCounter, closeCounter, addCashierClosure, cashierClosures } = useBranchOpsStore();
  const { currentUser } = useAuthStore();
  const [selectedDate, setSelectedDate] = useState(toDateInput());
  const [closingCash, setClosingCash] = useState('');
  const [openingCash, setOpeningCash] = useState('');
  const [cashExpenses, setCashExpenses] = useState('');
  const [notes, setNotes] = useState('');
  const [openCashier, setOpenCashier] = useState('');
  const [openDenominations, setOpenDenominations] = useState<Record<number, string>>({ 500: '', 200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 2: '', 1: '' });
  const [closeDenominations, setCloseDenominations] = useState<Record<number, string>>({ 500: '', 200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 2: '', 1: '' });
  const [closureSavedMessage, setClosureSavedMessage] = useState('');
  const [savingClosure, setSavingClosure] = useState(false);
  const [openingCounter, setOpeningCounter] = useState(false);
  const [remoteCounterOpenRecord, setRemoteCounterOpenRecord] = useState<null | {
    id: string;
    branch: 'Cafe';
    date: string;
    cashier: string;
    openingCash: number;
    denominations: Record<string, string>;
    openedAt: string;
    openedBy: string;
  }>(null);
  const [remoteClosureFinalized, setRemoteClosureFinalized] = useState(false);

  const cashierName = currentUser?.displayName || currentUser?.username || 'Cafe Cashier';
  const denominations = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  const openingDenomTotal = denominations.reduce((sum, denom) => sum + denom * safeNumber(openDenominations[denom]), 0);
  const closingDenomTotal = denominations.reduce((sum, denom) => sum + denom * safeNumber(closeDenominations[denom]), 0);
  const localCafeCounterOpenRecord = counterOpenings.find((record) => record.branch === 'Cafe' && record.date === selectedDate && record.active !== false);
  const cafeCounterOpenRecord = localCafeCounterOpenRecord ?? remoteCounterOpenRecord;
  const cafeClosureRecord = cashierClosures.find((record) => record.branch === 'Cafe' && sameBusinessDate(record.createdAt, selectedDate));
  const closureAlreadySaved = !cafeCounterOpenRecord && (Boolean(cafeClosureRecord) || remoteClosureFinalized);
  const activeCashierName = cafeCounterOpenRecord?.cashier || openCashier || cashierName;

  useEffect(() => {
    startPolling(60);
    fetchCreditSales('Cafe');
    fetchCreditPayments('Cafe');
    if (!useBranchOpsStore.persist.hasHydrated()) void useBranchOpsStore.persist.rehydrate();
    return () => stopPolling();
  }, [startPolling, stopPolling, fetchCreditSales, fetchCreditPayments]);

  useEffect(() => {
    setOpenCashier(cashierName);
  }, [cashierName]);

  useEffect(() => {
    let alive = true;
    const loadCounterStatus = async () => {
      const { data, error } = await supabase
        .from('branch_daily_closures')
        .select('cashier, opening_cash, status, created_at, updated_at')
        .eq('branch', 'Cafe')
        .eq('closure_date', selectedDate);
      if (!alive) return;
      if (error) {
        setRemoteCounterOpenRecord(null);
        setRemoteClosureFinalized(false);
        return;
      }
      const rows = Array.isArray(data) ? data : [];
      setRemoteClosureFinalized(rows.some((row) => String(row.status || '').toLowerCase() === 'finalized'));
      const openRow = rows.find((row) => String(row.status || '').toLowerCase() === 'draft');
      setRemoteCounterOpenRecord(
        openRow
          ? {
              id: `remote-cafe-counter-${selectedDate}`,
              branch: 'Cafe',
              date: selectedDate,
              cashier: String(openRow.cashier || cashierName),
              openingCash: safeNumber(openRow.opening_cash),
              denominations: {},
              openedAt: String(openRow.updated_at || openRow.created_at || new Date().toISOString()),
              openedBy: String(openRow.cashier || cashierName),
            }
          : null,
      );
    };
    void loadCounterStatus();
    return () => {
      alive = false;
    };
  }, [selectedDate, cashierName]);

  useEffect(() => {
    if (!cafeCounterOpenRecord) return;
    setOpeningCash(String(cafeCounterOpenRecord.openingCash || 0));
    setOpenCashier(cafeCounterOpenRecord.cashier || cashierName);
  }, [cafeCounterOpenRecord, cashierName]);

  const closure = useMemo(() => {
    const sessionStartedAt = cafeCounterOpenRecord?.openedAt ? new Date(cafeCounterOpenRecord.openedAt).getTime() : 0;
    const inCurrentSession = (value?: string) => !sessionStartedAt || (Boolean(value) && new Date(value as string).getTime() >= sessionStartedAt);
    const dayOrders = orders
      .filter(order => sameBusinessDate(order.createdAt, selectedDate) && inCurrentSession(order.createdAt))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paidRefundsThisSession = orders.filter(order =>
      order.status === 'cancelled' &&
      order.paymentType !== 'unpaid' &&
      sameBusinessDate(order.updatedAt, selectedDate) &&
      inCurrentSession(order.updatedAt)
    );
    const cancelled = Array.from(new Map([
      ...dayOrders.filter(order => order.status === 'cancelled'),
      ...paidRefundsThisSession,
    ].map(order => [order.id, order])).values());
    // FIX (MD Bug #23): detect any cancelled orders that had payment already collected —
    // these are orders where the cancel-after-payment guard failed (e.g. direct API call,
    // old app version, or a bypass). Surface the collected amount separately so the owner
    // can see cash that is physically in the drawer but not in any revenue line.
    const cancelledButPaid = paidRefundsThisSession;
    const cancelledButPaidAmount = cancelledButPaid.reduce((s, o) => s + (o.paymentType === 'advance' ? safeNumber(o.fullyPaidAt ? (o.fullAmount || o.total) : (o.advanceAmount || o.total)) : safeNumber(o.total)), 0);
    const refundPayments: PaymentTotals = { cash: 0, upi: 0, card: 0 };
    for (const order of cancelledButPaid) {
      if (order.paymentBreakdown) {
        addPayment(refundPayments, 'cash', safeNumber(order.paymentBreakdown.cash));
        addPayment(refundPayments, 'upi', safeNumber(order.paymentBreakdown.upi));
        addPayment(refundPayments, 'card', safeNumber(order.paymentBreakdown.card));
      } else if (order.paymentType === 'advance') {
        addPayment(refundPayments, order.advancePaidBy, safeNumber(order.fullyPaidAt ? (order.fullAmount || order.total) : (order.advanceAmount || order.total)));
      } else {
        addPayment(refundPayments, order.paymentType, safeNumber(order.total));
      }
    }
    const unpaid = dayOrders.filter(order => order.status !== 'cancelled' && order.paymentType === 'unpaid');
    // CRITICAL FIX: Exclude balance-collection orders (those that have a balanceOrderId set on the
    // *original* advance row).  When balance is collected on the same day, the balance-collection
    // row (paymentType = cash/upi/card) would otherwise be counted in billedValue a second time,
    // effectively doubling the full bill amount.  Balance-collection rows are identified by the
    // fact that the *original* order references them via order.balanceOrderId — but here we need
    // to identify the balance order itself.  We do that by checking whether the order's own id
    // appears as the balanceOrderId on any advance order in the day's orders.
    const balanceOrderIds = new Set(
      dayOrders
        .filter(o => o.paymentType === 'advance' && o.balanceOrderId)
        .map(o => o.balanceOrderId as string)
    );
    const billable = dayOrders.filter(order =>
      order.status !== 'cancelled' &&
      order.paymentType !== 'unpaid' &&
      !balanceOrderIds.has(order.id)
    );

    const payments: PaymentTotals = { cash: 0, upi: 0, card: 0 };
    const creditCollectionPayments: PaymentTotals = { cash: 0, upi: 0, card: 0 };
    let creditSales = 0;
    let creditCollected = 0;
    let creditPending = 0;
    let advanceReceived = 0;
    let advanceBalanceCollected = 0;
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
        const amount = safeNumber(order.advanceAmount ?? order.total);
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

    const balanceCollections = dayOrders.filter(order =>
      order.status !== 'cancelled' &&
      balanceOrderIds.has(order.id)
    );
    for (const order of balanceCollections) {
      const amount = paymentTotalForOrder(order);
      advanceBalanceCollected += amount;
      const person = order.billedBy || order.createdBy || 'Unknown';
      const personStats = billPersonMap.get(person) || { bills: 0, collected: 0, credit: 0 };
      if (order.paymentBreakdown) {
        addPayment(payments, 'cash', safeNumber(order.paymentBreakdown.cash));
        addPayment(payments, 'upi', safeNumber(order.paymentBreakdown.upi));
        addPayment(payments, 'card', safeNumber(order.paymentBreakdown.card));
      } else if (order.paymentType === 'cash' || order.paymentType === 'upi' || order.paymentType === 'card') {
        addPayment(payments, order.paymentType, safeNumber(order.total));
      }
      personStats.collected += amount;
      billPersonMap.set(person, personStats);
      const modeLabel = order.paymentBreakdown ? 'advance-balance-split' : `advance-balance-${order.paymentType || 'unknown'}`;
      paymentModeCount[modeLabel] = (paymentModeCount[modeLabel] || 0) + 1;
    }

    const collectionTotal = payments.cash + payments.upi + payments.card;
    const totalSales = collectionTotal + creditSales;
    const averageBill = billable.length > 0 ? totalSales / billable.length : 0;
    const itemCount = billable.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + safeNumber(item.quantity), 0), 0);

    const advanceOpen = dayOrders.filter(order => order.paymentType === 'advance' && safeNumber(order.balanceDue) > 0);
    const advanceClosedToday = orders.filter(order => sameBusinessDate(order.fullyPaidAt, selectedDate) && inCurrentSession(order.fullyPaidAt));
    const cafeCreditSales = branchCreditSales.Cafe || [];
    const cafeCreditPayments = branchCreditPayments.Cafe || [];
    creditCollected = cafeCreditPayments
      .filter(payment => sameBusinessDate(payment.createdAt, selectedDate) && inCurrentSession(payment.createdAt))
      .reduce((sum, payment) => {
        const amount = safeNumber(payment.amount);
        addPayment(creditCollectionPayments, payment.paymentMode, amount);
        return sum + amount;
      }, 0);
    creditPending = cafeCreditSales
      .filter(sale => sale.status !== 'settled')
      .reduce((sum, sale) => sum + safeNumber(sale.creditAmount), 0);

    const billers = Array.from(billPersonMap.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.collected + b.credit - (a.collected + a.credit));

    return {
      dayOrders,
      billable,
      cancelled,
      cancelledButPaid,
      cancelledButPaidAmount,
      refundPayments,
      unpaid,
      payments,
      creditCollectionPayments,
      collectionTotal: collectionTotal + creditCollected,
      totalSales: totalSales, // FIX: creditCollected is recovery of old bills, not today's revenue
      creditSales,
      creditCollected,
      creditPending,
      advanceReceived,
      advanceBalanceCollected,
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
  }, [orders, selectedDate, branchCreditSales, branchCreditPayments, cafeCounterOpenRecord?.openedAt]);

  const closingCashValue = closingDenomTotal > 0 ? closingDenomTotal : Number(closingCash || 0);
  // FIX (MD Bug #7): cashDifference previously compared physical cash directly against
  // cash sales only — ignoring opening float and any cash expenses/refunds.
  // The correct formula is: expected = openingCash + cashSales - cashExpenses - cashRefunds.
  const cafeOpeningCash = safeNumber(openingCash);
  const cafeCashExpenses = safeNumber(cashExpenses);
  const expectedCash = cafeOpeningCash + closure.payments.cash + closure.creditCollectionPayments.cash - closure.refundPayments.cash - cafeCashExpenses;
  const collectionByMode: PaymentTotals = {
    cash: closure.payments.cash + closure.creditCollectionPayments.cash,
    upi: closure.payments.upi + closure.creditCollectionPayments.upi,
    card: closure.payments.card + closure.creditCollectionPayments.card,
  };
  const cashDifference = Number.isFinite(closingCashValue) ? closingCashValue - expectedCash : 0;
  const printableTitle = `Cashier Counter Open & Closure - ${printableDate(selectedDate)}`;

  const handleOpenCounter = async () => {
    if (cafeCounterOpenRecord) {
      setClosureSavedMessage('Counter is already opened. Close the counter before opening again.');
      setTimeout(() => setClosureSavedMessage(''), 3500);
      return;
    }
    setOpeningCounter(true);
    const openingCashValue = openingDenomTotal;
    const openingCashier = openCashier || cashierName;
    const { error } = await supabase
      .from('branch_daily_closures')
      .insert(
        {
          branch: 'Cafe',
          closure_date: selectedDate,
          cashier: openingCashier,
          opening_cash: openingCashValue,
          cash_total: 0,
          upi_total: 0,
          card_total: 0,
          credit_billed: 0,
          credit_collected: 0,
          advance_collected: 0,
          advance_balance_collected: 0,
          refunds: 0,
          expenses: 0,
          discounts: 0,
          tax_total: 0,
          bill_count: 0,
          duplicate_prints: 0,
          expected_cash: openingCashValue,
          actual_cash: 0,
          difference: 0,
          notes: 'Counter opened',
          status: 'draft',
        },
      );
    if (error) {
      setClosureSavedMessage(error.code === '23505'
        ? 'This cashier counter was already opened or closed for the selected date.'
        : `Counter was not opened because Supabase could not save it: ${error.message}`);
      setOpeningCounter(false);
      setTimeout(() => setClosureSavedMessage(''), 4000);
      return;
    }
    const record = openCounter({
      branch: 'Cafe',
      date: selectedDate,
      cashier: openingCashier,
      openingCash: openingCashValue,
      denominations: Object.fromEntries(
        Object.entries(openDenominations).map(([denom, count]) => [String(denom), String(count || '')]),
      ),
      openedBy: cashierName,
    });
    setOpeningCash(String(record.openingCash));
    setClosureSavedMessage(
      `Cafe counter opened by ${record.cashier}. Opening cash: ${formatCurrency(record.openingCash)}`,
    );
    setOpeningCounter(false);
    setTimeout(() => setClosureSavedMessage(''), 3500);
  };

  const handleSaveClosure = async () => {
    if (!cafeCounterOpenRecord) {
      setClosureSavedMessage('Open the counter before saving closure.');
      setTimeout(() => setClosureSavedMessage(''), 3500);
      return;
    }
    if (closureAlreadySaved) {
      setClosureSavedMessage('Closure is already saved for this counter.');
      setTimeout(() => setClosureSavedMessage(''), 3500);
      return;
    }
    setSavingClosure(true);
    const closurePayload = {
      branch: 'Cafe',
      closure_date: selectedDate,
      cashier: activeCashierName,
      opening_cash: cafeOpeningCash,
      cash_total: closure.payments.cash,
      upi_total: closure.payments.upi,
      card_total: closure.payments.card,
      credit_billed: closure.creditSales,
      credit_collected: closure.creditCollected,
      advance_collected: closure.advanceReceived,
      advance_balance_collected: closure.advanceBalanceCollected,
      refunds: closure.cancelledButPaidAmount,
      expenses: cafeCashExpenses,
      discounts: closure.discountTotal,
      tax_total: 0,
      bill_count: closure.billable.length,
      duplicate_prints: 0,
      expected_cash: expectedCash,
      actual_cash: closingCashValue,
      difference: cashDifference,
      notes: notes || null,
      status: 'finalized',
    };
    const { data: closureRows, error } = await supabase
      .from('branch_daily_closures')
      .update(closurePayload)
      .eq('branch', 'Cafe')
      .eq('closure_date', selectedDate)
      .eq('cashier', activeCashierName)
      .eq('status', 'draft')
      .select('id');
    if (error || !closureRows || closureRows.length !== 1) {
      setClosureSavedMessage(error ? `Closure was not saved: ${error.message}` : 'Closure was not saved because the open counter record was not found or was already finalized.');
      setSavingClosure(false);
      setTimeout(() => setClosureSavedMessage(''), 4000);
      return;
    }
    addCashierClosure({
      branch: 'Cafe',
      cashier: activeCashierName,
      openingCash: cafeOpeningCash,
      closingCash: closingCashValue,
      expectedCash,
      difference: cashDifference,
      cash: closure.payments.cash,
      upi: closure.payments.upi,
      card: closure.payments.card,
      returns: closure.cancelledButPaidAmount,
      discounts: closure.discountTotal,
      billsCount: closure.billable.length,
      duplicateBills: 0,
      creditSales: closure.creditSales,
      creditCollections: closure.creditCollected,
      notes,
    });
    closeCounter('Cafe', selectedDate, activeCashierName);
    setRemoteCounterOpenRecord(null);
    setRemoteClosureFinalized(true);
    await supabase.from('admin_notifications').insert({
      type: 'counter_closure',
      title: 'Cafe counter closed',
      body: `${activeCashierName} closed the Cafe counter for ${selectedDate}. Collection ${formatCurrency(closure.collectionTotal)}, difference ${formatCurrency(cashDifference)}.`,
      ref_label: selectedDate,
      meta: { branch: 'Cafe', closureDate: selectedDate, cashier: activeCashierName, expectedCash, actualCash: closingCashValue, difference: cashDifference },
      is_read: false,
      recipient_role: 'admin_vrsnb',
    }).then(() => undefined, () => undefined);

    setClosureSavedMessage('Cafe cashier closure saved in Supabase. The counter is now closed.');
    setSavingClosure(false);
    setTimeout(() => setClosureSavedMessage(''), 3500);
  };

  const handlePrint = () => {
    const printedAt = new Date().toLocaleString('en-IN');
    const closedBy = currentUser?.displayName || currentUser?.username || 'Biller';
    const paymentRowsHtml = paymentRows.map(key => `
      <tr><td>${paymentLabels[key]}</td><td class="right">${safeHtml(formatCurrency(closure.payments[key]))}</td></tr>
    `).join('');
    const refundRowsHtml = closure.cancelledButPaid.length === 0
      ? '<tr><td colspan="6" class="muted center">No paid refunds in this counter session.</td></tr>'
      : closure.cancelledButPaid.map(order => `
        <tr>
          <td>#${String(order.orderNumber).padStart(4, '0')}</td>
          <td>${safeHtml(timeLabel(order.updatedAt))}</td>
          <td>${safeHtml(order.paymentType.replace('_', ' ').toUpperCase())}</td>
          <td>${safeHtml(order.cancelReason || 'Not specified')}</td>
          <td>${safeHtml(order.billedBy || order.createdBy || '-')}</td>
          <td class="right strong">-${safeHtml(formatCurrency(order.paymentType === 'advance' ? safeNumber(order.fullyPaidAt ? (order.fullAmount || order.total) : (order.advanceAmount || order.total)) : safeNumber(order.total)))}</td>
        </tr>
      `).join('');
    const billerRowsHtml = closure.billers.length === 0
      ? '<tr><td colspan="4" class="muted center">No closed bills for this date.</td></tr>'
      : closure.billers.map(biller => `
        <tr>
          <td>${safeHtml(biller.name)}</td>
          <td class="center">${biller.bills}</td>
          <td class="right">${safeHtml(formatCurrency(biller.collected))}</td>
          <td class="right">${safeHtml(formatCurrency(biller.credit))}</td>
        </tr>
      `).join('');
    const billRowsHtml = closure.billable.length === 0
      ? '<tr><td colspan="7" class="muted center">No bills closed for this date.</td></tr>'
      : closure.billable.map(order => {
        const paymentLabel = order.paymentType === 'advance'
          ? `Advance collected ${order.advancePaidBy || ''}`
          : order.paymentType === 'part_payment'
            ? 'Split Payment'
            : order.paymentType.replace('_', ' ');
        const paidAmount = order.paymentType === 'advance' ? safeNumber(order.total || order.advanceAmount) : safeNumber(order.total);
        return `
          <tr>
            <td>#${String(order.orderNumber).padStart(4, '0')}</td>
            <td>${safeHtml(timeLabel(order.createdAt))}</td>
            <td>${safeHtml(order.customerName || (order.orderType === 'dine_in' ? `Table ${order.tableNumber || '-'}` : 'Walk-in'))}</td>
            <td>${safeHtml(order.orderType.replace('_', ' '))}</td>
            <td>${safeHtml(paymentLabel)}</td>
            <td class="right">${safeHtml(formatCurrency(paidAmount))}</td>
            <td>${safeHtml(order.billedBy || order.createdBy || '-')}</td>
          </tr>
        `;
      }).join('');
    const notesHtml = notes.trim() ? `<div class="notes"><b>Closure Notes</b><p>${safeHtml(notes)}</p></div>` : '';

    const win = window.open('', '_blank', 'width=920,height=900');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>${safeHtml(printableTitle)}</title>
      <style>
        @page { size: A4; margin: 7mm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; }
        body { font-size: 11px; line-height: 1.35; }
        .closure-print { width: 100%; }
        .header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 12px; }
        h1 { margin: 0; font-size: 22px; line-height: 1; }
        h2 { margin: 0 0 7px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #374151; }
        .muted { color: #6b7280; } .right { text-align: right; } .center { text-align: center; } .strong { font-weight: 800; }
        .badge { display: inline-block; margin-top: 5px; padding: 3px 8px; border: 1px solid #111827; border-radius: 999px; font-weight: 800; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
        .card { border: 1px solid #d1d5db; border-radius: 10px; padding: 9px; break-inside: avoid; }
        .label { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; font-weight: 800; }
        .value { margin-top: 4px; font-size: 16px; font-weight: 900; }
        .section { border: 1px solid #d1d5db; border-radius: 12px; padding: 10px; margin-bottom: 10px; break-inside: avoid; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid #e5e7eb; padding: 5px 4px; vertical-align: top; }
        th { background: #f3f4f6; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .07em; }
        tr:last-child td { border-bottom: 0; }
        .totals { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .notes { border: 1px dashed #9ca3af; border-radius: 10px; padding: 8px; margin-bottom: 10px; }
        .notes p { margin: 4px 0 0; white-space: pre-wrap; }
        .footer { margin-top: 14px; display: flex; justify-content: space-between; gap: 20px; }
        .sign { width: 34%; border-top: 1px solid #111827; padding-top: 5px; text-align: center; color: #374151; }
        @media print {
          html, body { width: 210mm; min-height: 297mm; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .section, .card { break-inside: avoid; page-break-inside: avoid; }
        }
      </style></head><body>
      <main class="closure-print">
        <div class="header">
          <div>
            <h1>Café Aadvikam Cashier Counter Open & Closure</h1>
            <div class="badge">${safeHtml(printableDate(selectedDate))}</div>
          </div>
          <div class="right muted">
            <div><b>Closed by:</b> ${safeHtml(closedBy)}</div>
            <div><b>Printed:</b> ${safeHtml(printedAt)}</div>
          </div>
        </div>

        <div class="grid">
          <div class="card"><div class="label">Total Sales</div><div class="value">${safeHtml(formatCurrency(closure.totalSales))}</div></div>
          <div class="card"><div class="label">Collection</div><div class="value">${safeHtml(formatCurrency(closure.collectionTotal))}</div></div>
          <div class="card"><div class="label">Bills Closed</div><div class="value">${closure.billable.length}</div></div>
          <div class="card"><div class="label">Cancelled</div><div class="value">${closure.cancelled.length}</div></div>
        </div>

        <div class="totals">
          <section class="section"><h2>Payment Collection</h2><table><tbody>${paymentRowsHtml}<tr><td>Credit Collected</td><td class="right">${safeHtml(formatCurrency(closure.creditCollected))}</td></tr><tr><td class="strong">Total Collection</td><td class="right strong">${safeHtml(formatCurrency(closure.collectionTotal))}</td></tr></tbody></table></section>
          <section class="section"><h2>Cash Counter</h2><table><tbody>
            <tr><td>Opening Cash</td><td class="right">${safeHtml(formatCurrency(cafeOpeningCash))}</td></tr>
            <tr><td>System Cash Collection</td><td class="right">${safeHtml(formatCurrency(closure.payments.cash))}</td></tr>
            <tr><td>Cash Expenses</td><td class="right">${safeHtml(formatCurrency(cafeCashExpenses))}</td></tr>
            <tr><td>Expected Cash</td><td class="right">${safeHtml(formatCurrency(expectedCash))}</td></tr>
            <tr><td>Physical Cash</td><td class="right">${safeHtml(formatCurrency(closingCashValue || 0))}</td></tr>
            <tr><td class="strong">Difference</td><td class="right strong">${safeHtml(formatCurrency(cashDifference))}</td></tr>
          </tbody></table></section>
        </div>

        <section class="section"><h2>Refund Register</h2><table><thead><tr><th>Bill</th><th>Refund Time</th><th>Mode</th><th>Reason</th><th>Cashier</th><th class="right">Amount</th></tr></thead><tbody>${refundRowsHtml}</tbody></table></section>

        <div class="grid">
          <div class="card"><div class="label">Credit Sales</div><div class="value">${safeHtml(formatCurrency(closure.creditSales))}</div></div>
          <div class="card"><div class="label">Credit Collected</div><div class="value">${safeHtml(formatCurrency(closure.creditCollected))}</div></div>
          <div class="card"><div class="label">Advance Received</div><div class="value">${safeHtml(formatCurrency(closure.advanceReceived))}</div></div>
          <div class="card"><div class="label">Advance Balance Collected</div><div class="value">${safeHtml(formatCurrency(closure.advanceBalanceCollected))}</div></div>
          <div class="card"><div class="label">Advance Balance</div><div class="value">${safeHtml(formatCurrency(closure.advanceBalanceOpen))}</div></div>
          <div class="card"><div class="label">Average Bill</div><div class="value">${safeHtml(formatCurrency(closure.averageBill))}</div></div>
        </div>

        ${notesHtml}
        <section class="section"><h2>Biller Wise Summary</h2><table><thead><tr><th>Biller</th><th class="center">Bills</th><th class="right">Collected</th><th class="right">Credit</th></tr></thead><tbody>${billerRowsHtml}</tbody></table></section>
        <section class="section"><h2>Closed Bills</h2><table><thead><tr><th>Bill</th><th>Time</th><th>Customer</th><th>Type</th><th>Payment</th><th class="right">Paid</th><th>Biller</th></tr></thead><tbody>${billRowsHtml}</tbody></table></section>
        <div class="footer"><div class="sign">Cashier Signature</div><div class="sign">Manager Signature</div></div>
      </main>
    </body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); win.close(); }, 350);
  };

  const refresh = () => {
    loadOrders(60);
  };

  const paymentRows: PaymentKey[] = ['cash', 'upi', 'card'];

  return (
    <div className="daily-closure-page flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="print:hidden shrink-0 border-b border-border bg-background/95 backdrop-blur px-4 py-3 sticky top-0 z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className={cn('size-2 rounded-full', polling ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400')} />
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Cashier counter open & closure</p>
            </div>
            <p className="mt-1 text-sm font-black text-foreground">{printableTitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={refresh} disabled={loading} className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-bold flex items-center gap-2 active:scale-95 disabled:opacity-60">
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />Refresh
            </button>
            <button onClick={handlePrint} className="h-11 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground flex items-center gap-2 active:scale-95">
              <Printer className="size-4" />Print Closure
            </button>
            <button
              onClick={() => void handleSaveClosure()}
              disabled={savingClosure || closureAlreadySaved}
              className="h-11 rounded-xl bg-orange-500 px-4 text-sm font-black text-white shadow-lg shadow-orange-200 flex items-center gap-2 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              <CheckCircle2 className="size-4" />{savingClosure ? 'Saving...' : closureAlreadySaved ? 'Closure Saved' : 'Save Closure'}
            </button>
          </div>
        </div>
      </div>

      <div className="hidden print:block p-4 border-b border-black">
        <h1 className="text-2xl font-black">{printableTitle}</h1>
        <p>Closed by: {currentUser?.displayName || currentUser?.username || 'Biller'} · Printed: {new Date().toLocaleString('en-IN')}</p>
      </div>

      <div className="daily-closure-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4 print:overflow-visible print:p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className={cn('rounded-3xl border p-4 shadow-soft', cafeCounterOpenRecord ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Step 1</p>
                <h3 className="font-display text-lg font-black text-foreground">Open Counter</h3>
              </div>
              {cafeCounterOpenRecord ? <CheckCircle2 className="size-6 text-emerald-600" /> : <AlertCircle className="size-6 text-amber-700" />}
            </div>
              <p className="mt-2 text-sm font-bold text-muted-foreground">
                {cafeCounterOpenRecord
                  ? `${cafeCounterOpenRecord.cashier} opened ${formatCurrency(cafeCounterOpenRecord.openingCash)} at ${timeLabel(cafeCounterOpenRecord.openedAt)}`
                  : 'Count opening cash before billing starts.'}
            </p>
          </div>
          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Step 2</p>
                <h3 className="font-display text-lg font-black text-foreground">Check Collection</h3>
              </div>
              <WalletCards className="size-6 text-blue-700" />
            </div>
            <p className="mt-2 text-sm font-bold text-muted-foreground">
              Cash {formatCurrency(closure.payments.cash)} · UPI {formatCurrency(closure.payments.upi)} · Card {formatCurrency(closure.payments.card)}
            </p>
          </div>
          <div className={cn('rounded-3xl border p-4 shadow-soft', closingCashValue > 0 ? (Math.abs(cashDifference) < 0.01 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50') : 'border-slate-200 bg-slate-50')}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Step 3</p>
                <h3 className="font-display text-lg font-black text-foreground">Close Counter</h3>
              </div>
              {closingCashValue > 0 && Math.abs(cashDifference) < 0.01 ? <CheckCircle2 className="size-6 text-emerald-600" /> : <Banknote className="size-6 text-slate-600" />}
            </div>
              <p className="mt-2 text-sm font-bold text-muted-foreground">
                {closureAlreadySaved && cafeClosureRecord
                  ? `Closed by ${cafeClosureRecord.cashier}. Difference ${formatCurrency(cafeClosureRecord.difference)}`
                  : `Expected ${formatCurrency(expectedCash)} · Counted ${formatCurrency(closingCashValue)} · Difference ${formatCurrency(cashDifference)}`}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Cafe counter open</p>
              <h2 className="font-display text-xl font-black text-foreground">Start Cashier Counter</h2>
              <p className="mt-1 text-xs font-bold text-muted-foreground">
                {cafeCounterOpenRecord ? `Opened by ${cafeCounterOpenRecord.cashier} with ${formatCurrency(cafeCounterOpenRecord.openingCash)}. Close the counter before starting another opening.` : 'Open the counter before Cafe billing or advance collection.'}
              </p>
            </div>
            <span className={cn('rounded-full px-3 py-1 text-xs font-black border', closureAlreadySaved ? 'bg-slate-100 text-slate-700 border-slate-200' : cafeCounterOpenRecord ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200')}>
              {closureAlreadySaved ? 'CLOSED' : cafeCounterOpenRecord ? 'OPENED' : 'NOT OPENED'}
            </span>
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_180px]">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cashier</label>
              <input
                value={openCashier}
                onChange={e => setOpenCashier(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
              {denominations.map((denom) => (
                <label key={denom} className="rounded-2xl border border-border bg-background p-2">
                  <span className="block text-[10px] font-black text-muted-foreground">Rs {denom}</span>
                  <input
                    type="number"
                    min="0"
                    value={openDenominations[denom] || ''}
                    onChange={e => setOpenDenominations((prev) => ({ ...prev, [denom]: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-border bg-card px-2 py-2 text-sm font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-col justify-end gap-2">
              <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
                <p className="text-[10px] font-black uppercase text-white/60">Opening total</p>
                <p className="text-xl font-black tabular-nums">{formatCurrency(openingDenomTotal)}</p>
              </div>
              <button
                onClick={() => void handleOpenCounter()}
                disabled={Boolean(cafeCounterOpenRecord) || openingCounter}
                className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-orange-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {openingCounter ? 'Saving...' : cafeCounterOpenRecord ? 'Counter Already Open' : 'Confirm Counter Open'}
              </button>
            </div>
          </div>
          {closureSavedMessage && (
            <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">{closureSavedMessage}</p>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatCard title="Total sales" value={formatCurrency(closure.totalSales)} icon={<IndianRupee className="size-5" />} helper="Today bills + today credit sales" tone="emerald" />
          <StatCard title="Total collection" value={formatCurrency(closure.collectionTotal)} icon={<WalletCards className="size-5" />} helper="Cash + UPI + card + advance + credit recovery" tone="blue" />
          <StatCard title="Advance collected" value={formatCurrency(closure.advanceReceived)} icon={<WalletCards className="size-5" />} helper={`${formatCurrency(closure.advanceBalanceOpen)} advance balance pending`} tone="amber" />
          <StatCard title="Credit collected" value={formatCurrency(closure.creditCollected)} icon={<UserCheck className="size-5" />} helper={`${formatCurrency(closure.creditPending)} credit pending`} tone="violet" />
          <StatCard title="Bills closed" value={String(closure.billable.length)} icon={<Receipt className="size-5" />} helper={`${closure.itemCount} item qty`} tone="slate" />
          <StatCard title="Cancelled" value={String(closure.cancelled.length)} icon={<XCircle className="size-5" />} helper={formatCurrency(closure.cancelled.reduce((s, o) => s + safeNumber(o.total), 0))} tone="red" />
          {closure.cancelledButPaidAmount > 0 && (
            <StatCard title="Refunded" value={formatCurrency(closure.cancelledButPaidAmount)} icon={<XCircle className="size-5" />} helper={`${closure.cancelledButPaid.length} verified refund${closure.cancelledButPaid.length !== 1 ? "s" : ""}; deducted from collection`} tone="red" />
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Payment details</p>
                <h2 className="font-display text-xl font-black text-foreground">Cash / UPI / Card / Credit Collection</h2>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 border border-emerald-200">
                {formatCurrency(closure.collectionTotal)} collected
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              {paymentRows.map(key => (
                <PaymentRow
                  key={key}
                  label={`${paymentLabels[key]} collected`}
                  value={collectionByMode[key]}
                  percent={closure.collectionTotal > 0 ? (collectionByMode[key] / closure.collectionTotal) * 100 : 0}
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
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Opening cash</label>
                <input
                  type="number"
                  value={openingCash}
                  onChange={e => setOpeningCash(e.target.value)}
                  placeholder="Counter opening amount"
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-3 text-lg font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex justify-between text-sm"><span>Bill cash collection</span><span className="font-black tabular-nums">{formatCurrency(closure.payments.cash)}</span></div>
              <div className="flex justify-between text-sm"><span>Credit collected in cash</span><span className="font-black tabular-nums">{formatCurrency(closure.creditCollectionPayments.cash)}</span></div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cash expenses / paid out</label>
                <input
                  type="number"
                  value={cashExpenses}
                  onChange={e => setCashExpenses(e.target.value)}
                  placeholder="Cash paid out today"
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-3 text-lg font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex justify-between rounded-xl bg-card px-3 py-2 text-sm"><span>Expected cash</span><span className="font-black tabular-nums">{formatCurrency(expectedCash)}</span></div>
              <div className="rounded-2xl border border-border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Closing denomination count</p>
                    <p className="text-xs font-bold text-muted-foreground">Enter note/coin count. Total fills physical closing cash.</p>
                  </div>
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white tabular-nums">{formatCurrency(closingDenomTotal)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {denominations.map((denom) => (
                    <label key={denom} className="rounded-xl border border-border bg-background p-2">
                      <span className="block text-[10px] font-black text-muted-foreground">Rs {denom}</span>
                      <input
                        type="number"
                        min="0"
                        value={closeDenominations[denom] || ''}
                        onChange={e => {
                          const next = { ...closeDenominations, [denom]: e.target.value };
                          setCloseDenominations(next);
                          const total = denominations.reduce((sum, d) => sum + d * safeNumber(next[d]), 0);
                          setClosingCash(String(total));
                        }}
                        className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-2 text-center text-sm font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                  ))}
                </div>
              </div>
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
          <StatCard title="UPI collected" value={formatCurrency(collectionByMode.upi)} icon={<Smartphone className="size-5" />} helper={`${formatCurrency(closure.creditCollectionPayments.upi)} from credit recovery`} tone="blue" />
          <StatCard title="Card collected" value={formatCurrency(collectionByMode.card)} icon={<CreditCard className="size-5" />} helper={`${formatCurrency(closure.creditCollectionPayments.card)} from credit recovery`} tone="amber" />
          <StatCard title="Credit sales" value={formatCurrency(closure.creditSales)} icon={<History className="size-5" />} helper={`${formatCurrency(closure.creditPending)} pending`} tone="red" />
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
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3"><p className="text-[10px] font-black text-emerald-700 uppercase">Balance collected</p><p className="font-display text-xl font-black">{formatCurrency(closure.advanceBalanceCollected)}</p></div>
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
                    <td className="p-3 uppercase font-bold">{order.paymentType === 'advance' ? `ADVANCE COLLECTED ${order.advancePaidBy || ''}` : order.paymentType.replace('_', ' ')}</td>
                    <td className="p-3 text-right font-black tabular-nums">{formatCurrency(order.paymentType === 'advance' ? safeNumber(order.total || order.advanceAmount) : safeNumber(order.total))}</td>
                    <td className="p-3">{order.billedBy || order.createdBy || '-'}</td>
                    <td className="p-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 border border-emerald-200">{order.status.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {closure.cancelledButPaid.length > 0 && (
          <div className="rounded-3xl border border-red-200 bg-card p-4 shadow-soft space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-600">Refund register</p>
              <h2 className="font-display text-xl font-black text-foreground">Paid Bills Refunded During This Counter Session</h2>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-red-50 text-xs uppercase text-red-700">
                  <tr><th className="p-3 text-left">Bill</th><th className="p-3 text-left">Refund time</th><th className="p-3 text-left">Mode</th><th className="p-3 text-left">Reason</th><th className="p-3 text-left">Cashier</th><th className="p-3 text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {closure.cancelledButPaid.map(order => (
                    <tr key={order.id} className="border-t border-border">
                      <td className="p-3 font-black">#{String(order.orderNumber).padStart(4, '0')}</td>
                      <td className="p-3">{timeLabel(order.updatedAt)}</td>
                      <td className="p-3 font-bold uppercase">{order.paymentType.replace('_', ' ')}</td>
                      <td className="p-3">{order.cancelReason || 'Not specified'}</td>
                      <td className="p-3">{order.billedBy || order.createdBy || '-'}</td>
                      <td className="p-3 text-right font-black tabular-nums text-red-700">-{formatCurrency(order.paymentType === 'advance' ? safeNumber(order.fullyPaidAt ? (order.fullAmount || order.total) : (order.advanceAmount || order.total)) : safeNumber(order.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
