// src/branch/BranchDashboard.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Banknote, Bell, Building2, CalendarClock, ClipboardCheck, CreditCard, FileClock,
  FileText, History, Landmark, Package, Receipt, RotateCcw, Settings, ShieldCheck,
  Smartphone, Store, Truck, UserRound, WalletCards,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { businessDate } from '@/lib/businessDate';
import { useAuthStore } from '@/stores/authStore';
import { useBranchStore } from './branchStore';
import { SettingsTab } from './tabs/SettingsTab';
import { ReportsTab } from './tabs/ReportsTab';
import BranchBillingProTab from './tabs/BranchBillingProTab';
import { PaymentModeEditTab } from './tabs/PaymentModeEditTab';
import {
  AdvanceCakeOrdersTab,
  AdminNotificationsBranchTab,
  AuditLogsTab,
  BankTab,
  BranchAdminKpiStrip,
  BranchBillHistoryProTab,
  CashierClosureTab,
  CurrentCashTab,
  PurchaseOrderTab,
  PurchasePayTab,
  PurchaseTab,
  QuotationTab,
  ReturnsTab,
  SalespersonReportTab,
  StoreOrdersTab,
} from './tabs/BranchBusinessModules';
import type { Branch } from './types';
import { BRANCH_COLORS, BRANCH_LABELS } from './types';
import { useBranchOpsStore, money } from './branchOpsStore';
import { useSnbTabStripStore } from '@/stores/snbTabStripStore';

type TabId =
  | 'bill'
  | 'advance'
  | 'quotation'
  | 'returns'
  | 'purchase'
  | 'purchase-pay'
  | 'po'
  | 'history'
  | 'payment-edit'
  | 'closure'
  | 'alerts'
  | 'salesperson'
  | 'notifications'
  | 'store-orders'
  | 'current-cash'
  | 'bank'
  | 'reports'
  | 'audit'
  | 'settings';

const BASE_TABS = [
  { id: 'bill' as const, label: 'New Bill', icon: Receipt, adminOnly: false },
  { id: 'advance' as const, label: 'Advance Orders', icon: FileClock, adminOnly: false },
  { id: 'quotation' as const, label: 'Quotation', icon: FileText, adminOnly: false },
  { id: 'returns' as const, label: 'Returns', icon: RotateCcw, adminOnly: false },
  { id: 'history' as const, label: 'Bill History', icon: History, adminOnly: false },
  { id: 'payment-edit' as const, label: 'Payment Mode Edit', icon: CreditCard, adminOnly: false },
  { id: 'closure' as const, label: 'Cashier Closure', icon: WalletCards, adminOnly: false },
  { id: 'alerts' as const, label: 'Alerts', icon: Bell, adminOnly: false },
  { id: 'store-orders' as const, label: 'Store Orders', icon: Store, adminOnly: false },
  { id: 'salesperson' as const, label: 'Salesperson Report', icon: UserRound, adminOnly: true },
  { id: 'reports' as const, label: 'Reports', icon: FileText, adminOnly: true },
  { id: 'purchase' as const, label: 'Purchase', icon: Truck, adminOnly: true },
  { id: 'purchase-pay' as const, label: 'Purchase Pay', icon: Banknote, adminOnly: true },
  { id: 'po' as const, label: 'Purchase Order', icon: ClipboardCheck, adminOnly: true },
  { id: 'current-cash' as const, label: 'Current Cash', icon: CreditCard, adminOnly: true },
  { id: 'bank' as const, label: 'Bank', icon: Landmark, adminOnly: true },
  { id: 'notifications' as const, label: 'Admin Notifications', icon: Bell, adminOnly: true },
  { id: 'audit' as const, label: 'Audit Logs', icon: ShieldCheck, adminOnly: true },
  { id: 'settings' as const, label: 'Thresholds', icon: Settings, adminOnly: true },
];

const VRSNB_HIDDEN_TABS: TabId[] = [
  'store-orders',
  'reports',
  'purchase',
  'purchase-pay',
  'po',
  'current-cash',
  'bank',
  'notifications',
];

interface Props { branch: Branch }

type TodayLedger = {
  sales_total: number | string;
  advance_collected: number | string;
  advance_balance_collected: number | string;
  cash_total: number | string;
  upi_total: number | string;
  card_total: number | string;
};

const n = (value: number | string | null | undefined) => Number(value ?? 0);

export default function BranchDashboard({ branch }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [opsHydrated, setOpsHydrated] = useState(() => useBranchOpsStore.persist.hasHydrated());
  const [todayLedger, setTodayLedger] = useState<TodayLedger | null>(null);
  const { currentUser } = useAuthStore();
  const {
    stock, sales, incoming, advanceOrders, thresholds, loading,
    creditSales: branchCreditSales,
    creditPayments: branchCreditPayments,
    stockMismatches, fetchBranchData, syncIncomingFromDispatches, cleanOldData, seedBranchItems,
    subscribeToStock, fetchStockMismatches, fetchCreditPayments,
  } = useBranchStore();
  const { bills, cashMovements, notifications, storeOrders, purchases, advanceCakeOrders } = useBranchOpsStore();
  const tabStripExpanded = useSnbTabStripStore((s) => s.expanded);

  const initializedRef = useRef<Branch | null>(null);
  const alertedDeliveryIdsRef = useRef<Set<string>>(new Set());
  const [showDeliveryAlert, setShowDeliveryAlert] = useState(false);

  const branchStock = useMemo(() => stock[branch] || [], [stock, branch]);
  const branchIncoming = useMemo(() => incoming[branch] || [], [incoming, branch]);
  const branchAdvance = useMemo(() => advanceOrders?.[branch] || [], [advanceOrders, branch]);
  const branchSales = useMemo(() => sales[branch] || [], [sales, branch]);
  const branchThresholds = useMemo(() => thresholds[branch] || {}, [thresholds, branch]);
  const colors           = BRANCH_COLORS[branch];
  const role = currentUser?.role || '';
  const isAdminUser = role === 'admin' || role === 'owner' || (branch === 'SNB' && role === 'admin_snb') || (branch === 'VRSNB' && role === 'admin_vrsnb');
  const isSnbAdmin = role === 'admin_snb';
  const isVrsnbAdmin = role === 'admin_vrsnb';
  const canViewReports = branch === 'VRSNB'
    ? isVrsnbAdmin
    : branch === 'SNB'
      ? isSnbAdmin
      : isAdminUser;
  const canViewSalespersonReport = branch === 'SNB' ? isSnbAdmin : branch === 'VRSNB' ? isVrsnbAdmin : isAdminUser;
  const tabs = useMemo(() => BASE_TABS.filter((t) => {
    if (branch === 'VRSNB' && VRSNB_HIDDEN_TABS.includes(t.id)) return false;
    if (t.id === 'reports') return canViewReports;
    if (t.id === 'salesperson') return canViewSalespersonReport;
    return !t.adminOnly || isAdminUser;
  }), [branch, canViewReports, canViewSalespersonReport, isAdminUser]);
  const requestedTab = searchParams.get('tab') as TabId | null;  const tab: TabId = requestedTab && tabs.some((t) => t.id === requestedTab) ? requestedTab : 'bill';
  const openTab = useCallback((id: TabId | string) => {
    const next = id as TabId;
    if (next === 'bill') setSearchParams({});
    else setSearchParams({ tab: next });
  }, [setSearchParams]);

  useEffect(() => {
    if (useBranchOpsStore.persist.hasHydrated()) {
      setOpsHydrated(true);
      return;
    }
    const unsubscribe = useBranchOpsStore.persist.onFinishHydration(() => setOpsHydrated(true));
    void useBranchOpsStore.persist.rehydrate();
    return unsubscribe;
  }, []);

  useEffect(() => {
    fetchBranchData(branch);
    fetchStockMismatches();
    fetchCreditPayments(branch);

    if (initializedRef.current !== branch) {
      initializedRef.current = branch;
      syncIncomingFromDispatches(branch, true);
      seedBranchItems(branch);
      cleanOldData();
    }

    const unsubscribe = subscribeToStock(branch);
    const refresh = () => { if (!document.hidden) void fetchBranchData(branch); };
    const id = setInterval(refresh, 45_000);
    const syncId = setInterval(() => syncIncomingFromDispatches(branch), 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(id);
      clearInterval(syncId);
    };
  }, [branch, cleanOldData, fetchBranchData, fetchCreditPayments, fetchStockMismatches, seedBranchItems, subscribeToStock, syncIncomingFromDispatches]);

  useEffect(() => {
    let active = true;
    const loadTodayLedger = async () => {
      const { data, error } = await supabase
        .from('branch_daily_closure_ledger')
        .select('sales_total, advance_collected, advance_balance_collected, cash_total, upi_total, card_total')
        .eq('branch', branch)
        .eq('closure_date', businessDate())
        .maybeSingle();
      if (!active) return;
      setTodayLedger(error ? null : (data as TodayLedger | null));
    };
    void loadTodayLedger();
    const id = setInterval(loadTodayLedger, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [branch]);

  useEffect(() => {
    if (requestedTab && !tabs.some((t) => t.id === requestedTab)) openTab('bill');
  }, [requestedTab, tabs, openTab]);

  const lowStockCount = useMemo(
    () => branchStock.filter((s) => s.quantity <= (branchThresholds[s.itemName] ?? s.minThreshold ?? 10)).length,
    [branchStock, branchThresholds],
  );
  const pendingIncoming = branchIncoming.filter((i) => !i.confirmed).length;
  const pendingAdvance = branchAdvance.filter((o) => o.status === 'pending').length;
  const unreadNotifications = notifications.filter((n) => n.branch === branch && n.status === 'Unread').length;
  const pendingStoreOrders = storeOrders.filter((o) => o.branch === branch && o.status === 'Pending Store Confirmation').length;
  const pendingPurchases = purchases.filter((p) => p.branch === branch && p.total > p.paidAmount).length;
  const visibleCreditSales = branchCreditSales[branch] || [];
  const pendingCreditSales = visibleCreditSales.filter((c) => c.status !== 'settled').length;
  const creditDue = visibleCreditSales.filter((c) => c.status !== 'settled').reduce((s, c) => s + c.creditAmount, 0);
  const todayIso = businessDate();
  const todayLegacyDeliveries = branchAdvance.filter((o) => o.status === 'pending' && o.deliveryDate === todayIso);
  const todayCakeDeliveries = advanceCakeOrders.filter((o) => o.branch === branch && o.status !== 'Paid In Full' && o.deliveryDate === todayIso);
  const todayDeliveryCount = todayLegacyDeliveries.length + todayCakeDeliveries.length;

  useEffect(() => {
    const activeIds = [...todayLegacyDeliveries, ...todayCakeDeliveries]
      .map((delivery: any) => `${branch}:${todayIso}:${String(delivery.id)}`);
    const unseen = activeIds.filter((id) => !alertedDeliveryIdsRef.current.has(id));
    if (unseen.length > 0) {
      activeIds.forEach((id) => alertedDeliveryIdsRef.current.add(id));
      setShowDeliveryAlert(true);
    }
  }, [branch, todayDeliveryCount, todayIso, todayLegacyDeliveries, todayCakeDeliveries]);

  const todayString = new Date().toDateString();
  const todayBills = useMemo(
    () => bills.filter((b) => b.branch === branch && new Date(b.createdAt).toDateString() === todayString),
    [bills, branch, todayString],
  );
  const counterTodayBills = useMemo(
    () => todayBills.filter((b) => b.source !== 'advance-final'),
    [todayBills],
  );
  const legacyTodaySalesLog = useMemo(
    () => branchSales.filter((s) => new Date(s.soldAt).toDateString() === todayString && !s.billNo),
    [branchSales, todayString],
  );
  const todayAdvanceIn = useMemo(
    () => cashMovements
      .filter((m) => m.branch === branch && new Date(m.dateTime).toDateString() === todayString && m.direction === 'in' && (m.purpose === 'Cake advance received' || m.purpose === 'Advance balance collection'))
      .reduce((s, m) => s + m.amount, 0),
    [cashMovements, branch, todayString],
  );
  const todayCreditCollections = useMemo(
    () => (branchCreditPayments[branch] || [])
      .filter((m) => new Date(m.createdAt).toDateString() === todayString)
      .filter((m) => !cashMovements.some((cm) =>
        cm.branch === branch
        && cm.referenceNumber === m.billNo
        && cm.paymentMode === m.paymentMode
        && cm.amount === m.amount
        && cm.purpose === 'Credit upfront collection'
      )),
    [branchCreditPayments, branch, todayString, cashMovements],
  );
  const localTodayRevenue = useMemo(
    () => counterTodayBills.reduce((s, b) => s + b.total, 0) + legacyTodaySalesLog.reduce((s, r) => s + (r.unitPrice ?? 0) * r.quantitySold, 0) + todayAdvanceIn,
    [counterTodayBills, legacyTodaySalesLog, todayAdvanceIn],
  );
  // Sales value and collection value are separate: advances are collections, not new sales.
  const totalTodayRevenue = todayLedger ? n(todayLedger.sales_total) : localTodayRevenue - todayAdvanceIn;
  const todayMovements = cashMovements.filter((m) => m.branch === branch && new Date(m.dateTime).toDateString() === todayString);
  const currentCash = todayLedger ? n(todayLedger.cash_total) : todayMovements.filter((m) => m.paymentMode === 'cash').reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0);
  const currentUpi = todayLedger ? n(todayLedger.upi_total) : todayMovements.filter((m) => m.paymentMode === 'upi').reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0);
  const currentCard = todayLedger ? n(todayLedger.card_total) : todayMovements.filter((m) => m.paymentMode === 'card').reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0);

  if (!opsHydrated) {
    return (
      <div className="branch-command-screen min-h-0 bg-transparent pt-0" style={{ minHeight: 'calc(100dvh - var(--header-h, 4rem))', paddingBottom: 'var(--nav-h, 5.25rem)' }}>
        <div className="grid min-h-0 place-items-center px-3 py-10 md:px-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-lg">
            <Package className="mx-auto size-10 animate-pulse text-amber-500" />
            <h2 className="mt-3 text-xl font-black text-slate-950">Loading saved branch records</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Bills, advance orders and cash movements are being loaded from Supabase.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="branch-command-screen h-full min-h-0 overflow-hidden bg-transparent pt-0">
      <div className="flex h-full min-h-0 flex-col p-1.5 sm:p-2">
        {branch === 'SNB' && tabStripExpanded && (
          <div className="mb-1.5 flex shrink-0 items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/70 px-2 py-1.5 shadow-sm">
            {tabs
              .filter((t) => (['bill', 'advance', 'returns', 'history', 'payment-edit', 'closure', 'alerts'] as TabId[]).includes(t.id))
              .map((t) => {
                const Icon = t.icon;
                const isActive = t.id === tab;
                const badge = t.id === 'alerts' ? notifications.filter((n) => n.branch === branch && n.status === 'Unread').length : 0;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { openTab(t.id); useSnbTabStripStore.getState().collapse(); }}
                    className={cn(
                      'relative inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-colors',
                      isActive ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    <Icon className="size-3" />{t.id === 'payment-edit' ? 'Payment' : t.id === 'bill' ? 'Bill' : t.label}
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-black text-white">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        )}
        <main className={cn('h-full min-h-0 min-w-0 flex-1 overflow-hidden border border-slate-200 bg-white/70 shadow-lg shadow-slate-200/50', tab === 'bill' ? 'rounded-[1.35rem]' : 'rounded-[1.6rem]')}>
          <div className={cn('h-full min-h-0', tab === 'bill' ? 'p-1 sm:p-1.5' : 'branch-compact-tab overflow-hidden p-1.5 sm:p-2')}>
            {tab === 'bill' && <BranchBillingProTab branch={branch} branchStock={branchStock} onOpenTab={openTab} />}
            {tab === 'advance' && <AdvanceCakeOrdersTab branch={branch} branchStock={branchStock} onOpenTab={openTab} />}
            {tab === 'quotation' && <QuotationTab branch={branch} branchStock={branchStock} onOpenTab={openTab} />}
            {tab === 'returns' && <ReturnsTab branch={branch} branchStock={branchStock} />}
            {tab === 'purchase' && isAdminUser && <PurchaseTab branch={branch} branchStock={branchStock} />}
            {tab === 'purchase-pay' && isAdminUser && <PurchasePayTab branch={branch} branchStock={branchStock} />}
            {tab === 'po' && isAdminUser && <PurchaseOrderTab branch={branch} branchStock={branchStock} />}
            {tab === 'history' && <BranchBillHistoryProTab branch={branch} branchStock={branchStock} />}
            {tab === 'payment-edit' && <PaymentModeEditTab branch={branch} />}
            {tab === 'closure' && <CashierClosureTab branch={branch} branchStock={branchStock} />}
            {tab === 'alerts' && <BranchAlertsTab branch={branch} legacyDeliveries={todayLegacyDeliveries} cakeDeliveries={todayCakeDeliveries} />}
            {tab === 'salesperson' && canViewSalespersonReport && <SalespersonReportTab branch={branch} branchStock={branchStock} />}
            {tab === 'notifications' && isAdminUser && <AdminNotificationsBranchTab branch={branch} branchStock={branchStock} />}
            {tab === 'store-orders' && branch !== 'VRSNB' && <StoreOrdersTab branch={branch} branchStock={branchStock} />}
            {tab === 'current-cash' && isAdminUser && <CurrentCashTab branch={branch} branchStock={branchStock} />}
            {tab === 'bank' && isAdminUser && <BankTab branch={branch} branchStock={branchStock} />}
            {tab === 'reports' && canViewReports && <ReportsTab branch={branch} branchSales={branchSales} advanceOrders={branchAdvance} />}
            {tab === 'audit' && isAdminUser && <AuditLogsTab branch={branch} branchStock={branchStock} />}
            {tab === 'settings' && isAdminUser && <SettingsTab branch={branch} branchStock={branchStock} />}
          </div>
        </main>
      </div>
      {showDeliveryAlert && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100">
                <Bell className="size-8 animate-bounce text-red-600" />
              </div>
              <h2 className="mt-4 text-2xl font-black text-slate-950">
                {todayDeliveryCount} Delivery{todayDeliveryCount > 1 ? 's' : ''} Due Today
              </h2>
              <p className="mt-2 text-sm font-bold text-slate-500">
                {BRANCH_LABELS[branch]} has advance orders scheduled for delivery today.
              </p>
              <div className="mt-4 space-y-2">
                {[...todayLegacyDeliveries, ...todayCakeDeliveries].map((o: any) => (
                  <div key={o.id} className="rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm font-bold">
                    {o.customerName} - {o.orderNo || o.id}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => { setShowDeliveryAlert(false); openTab('alerts'); }} className="rounded-2xl bg-slate-950 py-3 font-black text-white">View Alerts</button>
              <button onClick={() => setShowDeliveryAlert(false)} className="rounded-2xl bg-slate-100 py-3 font-black text-slate-700">Dismiss</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'green' | 'amber' | 'blue' | 'red' }) {
  const cls = {
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-700',
    red: 'bg-red-100 text-red-700',
  }[tone];
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide', cls)}>{children}</span>;
}

function BranchAlertsTab({
  branch,
  legacyDeliveries,
  cakeDeliveries,
}: {
  branch: Branch;
  legacyDeliveries: Array<{ id: string; customerName: string; customerPhone?: string | null; deliveryDate: string; balanceDue: number; subtotal: number; items: Array<{ itemName: string; quantity: number }> }>;
  cakeDeliveries: Array<{ id: string; orderNo: string; customerName: string; mobile: string; deliveryDate: string; deliveryTime?: string; cakeKg: string; flavor: string; shape: string; balanceAmount: number; status: string }>;
}) {
  const hasDeliveries = legacyDeliveries.length + cakeDeliveries.length > 0;
  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-red-50 p-3 text-red-600"><Bell className="size-5" /></div>
            <div>
              <h3 className="text-xl font-black text-slate-950">Delivery Alerts</h3>
              <p className="text-sm font-bold text-slate-500">Today deliveries for {BRANCH_LABELS[branch]}.</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          {!hasDeliveries ? (
            <div className="rounded-3xl bg-slate-50 p-8 text-center">
              <Bell className="mx-auto size-10 text-slate-300" />
              <p className="mt-3 font-black text-slate-700">No delivery due today</p>
              <p className="text-sm font-semibold text-slate-400">Advance delivery reminders will appear here automatically.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {legacyDeliveries.map((order) => (
                <div key={order.id} className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-slate-950">{order.customerName}</p>
                      <p className="text-sm font-bold text-slate-600">{order.customerPhone || 'No mobile'} - {order.items.map((i) => `${i.itemName} x ${i.quantity}`).join(', ')}</p>
                    </div>
                    <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-black text-amber-800">Balance {money(order.balanceDue)}</span>
                  </div>
                </div>
              ))}
              {cakeDeliveries.map((order) => (
                <div key={order.id} className="rounded-3xl border border-red-200 bg-red-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-slate-950">{order.orderNo} - {order.customerName}</p>
                      <p className="text-sm font-bold text-slate-600">{order.mobile} - {order.cakeKg}kg {order.flavor} {order.shape}</p>
                      <p className="mt-1 text-xs font-black text-red-700">Delivery today {order.deliveryTime || ''}</p>
                    </div>
                    <span className="rounded-full bg-red-200 px-3 py-1 text-xs font-black text-red-800">Balance {money(order.balanceAmount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
