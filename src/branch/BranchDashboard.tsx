// src/branch/BranchDashboard.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  AlertTriangle, Banknote, Bell, Building2, ClipboardCheck, CreditCard, FileClock,
  FileText, History, Landmark, Package, Receipt, RotateCcw, Settings, ShieldCheck,
  Smartphone, Store, Truck, UserRound, WalletCards,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useBranchStore } from './branchStore';
import { StockTab } from './tabs/StockTab';
import { SettingsTab } from './tabs/SettingsTab';
import { ReportsTab } from './tabs/ReportsTab';
import BranchBillingProTab from './tabs/BranchBillingProTab';
import {
  AdvanceCakeOrdersTab,
  AdminNotificationsBranchTab,
  AuditLogsTab,
  BankTab,
  BranchAdminKpiStrip,
  BranchBillHistoryProTab,
  CashierClosureTab,
  CreditSalesTab,
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

type TabId =
  | 'bill'
  | 'advance'
  | 'quotation'
  | 'returns'
  | 'purchase'
  | 'purchase-pay'
  | 'po'
  | 'stock'
  | 'history'
  | 'credit-sales'
  | 'closure'
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
  { id: 'stock' as const, label: 'Stock / Incoming', icon: Package, adminOnly: false },
  { id: 'history' as const, label: 'Bill History', icon: History, adminOnly: false },
  { id: 'credit-sales' as const, label: 'Credit', icon: CreditCard, adminOnly: false },
  { id: 'closure' as const, label: 'Cashier Closure', icon: WalletCards, adminOnly: false },
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

interface Props { branch: Branch }

export default function BranchDashboard({ branch }: Props) {
  const { currentUser } = useAuthStore();
  const {
    stock, sales, incoming, advanceOrders, thresholds, loading,
    stockMismatches, fetchBranchData, syncIncomingFromDispatches, cleanOldData, seedBranchItems,
    subscribeToStock, fetchStockMismatches,
  } = useBranchStore();
  const { bills, creditSales, cashMovements, notifications, storeOrders, purchases } = useBranchOpsStore();

  const [tab, setTab] = useState<TabId>('bill');
  const initializedRef = useRef<Branch | null>(null);

  const branchStock      = stock[branch]           || [];
  const branchIncoming   = incoming[branch]        || [];
  const branchAdvance    = advanceOrders?.[branch] || [];
  const branchSales      = sales[branch]           || [];
  const branchThresholds = thresholds[branch]      || {};
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
  const canViewSalespersonReport = branch === 'SNB' ? isSnbAdmin : isAdminUser;
  const tabs = BASE_TABS.filter((t) => {
    if (branch === 'VRSNB' && (t.id === 'quotation' || t.id === 'salesperson')) return false;
    if (t.id === 'reports') return canViewReports;
    if (t.id === 'salesperson') return canViewSalespersonReport;
    return !t.adminOnly || isAdminUser;
  });

  useEffect(() => {
    fetchBranchData(branch);
    fetchStockMismatches();

    if (initializedRef.current !== branch) {
      initializedRef.current = branch;
      syncIncomingFromDispatches(branch, true);
      seedBranchItems(branch);
      cleanOldData();
    }

    const unsubscribe = subscribeToStock(branch);
    const id = setInterval(() => fetchBranchData(branch), 3_000);
    const syncId = setInterval(() => syncIncomingFromDispatches(branch), 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(id);
      clearInterval(syncId);
    };
  }, [branch]);

  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab('bill');
  }, [tab, tabs]);

  const lowStockCount = useMemo(
    () => branchStock.filter((s) => s.quantity <= (branchThresholds[s.itemName] ?? s.minThreshold ?? 10)).length,
    [branchStock, branchThresholds],
  );
  const pendingIncoming = branchIncoming.filter((i) => !i.confirmed).length;
  const pendingAdvance = branchAdvance.filter((o) => o.status === 'pending').length;
  const unreadNotifications = notifications.filter((n) => n.branch === branch && n.status === 'Unread').length;
  const pendingStoreOrders = storeOrders.filter((o) => o.branch === branch && o.status === 'Pending Store Confirmation').length;
  const pendingPurchases = purchases.filter((p) => p.branch === branch && p.total > p.paidAmount).length;
  const pendingCreditSales = creditSales.filter((c) => c.branch === branch && c.status !== 'Paid' && c.status !== 'Written Off').length;
  const creditDue = creditSales.filter((c) => c.branch === branch && c.status !== 'Paid' && c.status !== 'Written Off').reduce((s, c) => s + c.balanceDue, 0);

  const todayString = new Date().toDateString();
  const todayBills = useMemo(
    () => bills.filter((b) => b.branch === branch && new Date(b.createdAt).toDateString() === todayString),
    [bills, branch, todayString],
  );
  const legacyTodaySalesLog = useMemo(
    () => branchSales.filter((s) => new Date(s.soldAt).toDateString() === todayString && !s.billNo),
    [branchSales, todayString],
  );
  const totalTodayRevenue = useMemo(
    () => todayBills.reduce((s, b) => s + b.total, 0) + legacyTodaySalesLog.reduce((s, r) => s + (r.unitPrice ?? 0) * r.quantitySold, 0),
    [todayBills, legacyTodaySalesLog],
  );
  const currentCash = cashMovements.filter((m) => m.branch === branch && m.paymentMode === 'cash').reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0);
  const currentUpi = cashMovements.filter((m) => m.branch === branch && m.paymentMode === 'upi').reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0);
  const currentCard = cashMovements.filter((m) => m.branch === branch && m.paymentMode === 'card').reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0);

  return (
    <div className="branch-command-screen min-h-0 bg-transparent pt-0" style={{ minHeight: 'calc(100dvh - var(--header-h, 4rem))', paddingBottom: 'var(--nav-h, 5.25rem)' }}>
      <div className="grid min-h-0 gap-4 px-3 py-3 md:px-5 lg:grid-cols-[270px_minmax(0,1fr)] lg:gap-5">
        <aside className="min-h-0 rounded-[2rem] border border-slate-200 bg-white/95 p-3 shadow-lg shadow-slate-200/60 lg:sticky lg:top-3 lg:flex lg:max-h-[calc(100dvh-var(--header-h,4rem)-2rem)] lg:flex-col">
          <div className="mb-3 rounded-[1.5rem] bg-slate-950 p-4 text-white">
            <div className="flex items-center gap-2">
              <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide', colors.badge)}>
                <Building2 className="size-3" /> {BRANCH_LABELS[branch]}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-black tracking-tight">Dashboard Menu</h2>
            <p className="mt-1 text-xs font-semibold text-white/55">Cashier-first sidebar navigation</p>
          </div>

          <nav className="flex gap-2 overflow-x-auto pb-1 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0">
            {tabs.map((t) => {
              const count = t.id === 'notifications' ? unreadNotifications : t.id === 'store-orders' ? pendingStoreOrders : t.id === 'purchase-pay' ? pendingPurchases : t.id === 'credit-sales' ? pendingCreditSales : t.id === 'stock' ? pendingIncoming : 0;
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-black transition active:scale-[0.98] lg:w-full lg:shrink',
                    tab === t.id
                      ? 'bg-slate-950 text-white shadow-lg shadow-slate-200'
                      : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-white',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="whitespace-nowrap lg:whitespace-normal">{t.id === 'credit-sales' ? (branch === 'VRSNB' ? 'Credit' : 'Credit Sales') : t.label}</span>
                  {count > 0 && <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">{count}</span>}
                </button>
              );
            })}
          </nav>

          <div className="mt-3 hidden rounded-[1.5rem] bg-slate-50 p-3 ring-1 ring-slate-200 lg:block">
            <div className="grid grid-cols-2 gap-2 text-xs font-black text-slate-600">
              <MiniStat label="Low" value={lowStockCount} />
              <MiniStat label="Incoming" value={pendingIncoming} />
            </div>
          </div>
        </aside>

        <main className="min-w-0 min-h-0 overflow-hidden rounded-[2rem] border border-slate-200 bg-white/70 shadow-lg shadow-slate-200/50">
          <div className="shrink-0 border-b border-slate-200 bg-white/95 p-3 backdrop-blur md:p-4">
            <div className="rounded-[1.75rem] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-4 text-white shadow-lg shadow-slate-300/50">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {pendingIncoming > 0 && <Badge tone="green"><Package className="size-3" /> {pendingIncoming} incoming</Badge>}
                    {pendingAdvance > 0 && <Badge tone="amber"><FileClock className="size-3" /> {pendingAdvance} legacy advance</Badge>}
                    {pendingStoreOrders > 0 && <Badge tone="blue"><Store className="size-3" /> {pendingStoreOrders} store confirms</Badge>}
                    {pendingCreditSales > 0 && <Badge tone="amber"><CreditCard className="size-3" /> {pendingCreditSales} credit due</Badge>}
                    {unreadNotifications > 0 && <Badge tone="red"><Bell className="size-3" /> {unreadNotifications} admin alerts</Badge>}
                  </div>
                  <h1 className="mt-3 text-2xl font-black tracking-tight md:text-4xl">Branch Billing Command Center</h1>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:min-w-[740px]">
                  <HeroKpi label="Today Sales" value={money(totalTodayRevenue)} icon={<Receipt className="size-4" />} />
                  <HeroKpi label="Cash" value={money(currentCash)} icon={<Banknote className="size-4" />} />
                  <HeroKpi label="UPI" value={money(currentUpi)} icon={<Smartphone className="size-4" />} />
                  <HeroKpi label="Card" value={money(currentCard)} icon={<CreditCard className="size-4" />} />
                  <HeroKpi label="Credit Due" value={money(creditDue)} icon={<WalletCards className="size-4" />} />
                </div>
              </div>
              {isAdminUser && <div className="mt-4"><BranchAdminKpiStrip branch={branch} /></div>}
            </div>
          </div>

          <div className={cn('min-h-0 px-3 py-3 md:px-4', tab !== 'bill' && 'max-h-[calc(100dvh-var(--header-h,4rem)-9rem)] overflow-y-auto space-y-5')}>
            {tab === 'bill' && <BranchBillingProTab branch={branch} branchStock={branchStock} onOpenTab={(id) => setTab(id as TabId)} />}
            {tab === 'advance' && <AdvanceCakeOrdersTab branch={branch} branchStock={branchStock} onOpenTab={(id) => setTab(id as TabId)} />}
            {tab === 'quotation' && branch !== 'VRSNB' && <QuotationTab branch={branch} branchStock={branchStock} onOpenTab={(id) => setTab(id as TabId)} />}
            {tab === 'returns' && <ReturnsTab branch={branch} branchStock={branchStock} />}
            {tab === 'purchase' && isAdminUser && <PurchaseTab branch={branch} branchStock={branchStock} />}
            {tab === 'purchase-pay' && isAdminUser && <PurchasePayTab branch={branch} branchStock={branchStock} />}
            {tab === 'po' && isAdminUser && <PurchaseOrderTab branch={branch} branchStock={branchStock} />}
            {tab === 'stock' && <StockTab branch={branch} branchStock={branchStock} branchIncoming={branchIncoming} branchThresholds={branchThresholds} loading={loading} stockMismatches={stockMismatches.filter((m) => m.branch === branch)} />}
            {tab === 'history' && <BranchBillHistoryProTab branch={branch} branchStock={branchStock} />}
            {tab === 'credit-sales' && <CreditSalesTab branch={branch} branchStock={branchStock} />}
            {tab === 'closure' && <CashierClosureTab branch={branch} branchStock={branchStock} />}
            {tab === 'salesperson' && branch !== 'VRSNB' && canViewSalespersonReport && <SalespersonReportTab branch={branch} branchStock={branchStock} />}
            {tab === 'notifications' && isAdminUser && <AdminNotificationsBranchTab branch={branch} branchStock={branchStock} />}
            {tab === 'store-orders' && <StoreOrdersTab branch={branch} branchStock={branchStock} />}
            {tab === 'current-cash' && isAdminUser && <CurrentCashTab branch={branch} branchStock={branchStock} />}
            {tab === 'bank' && isAdminUser && <BankTab branch={branch} branchStock={branchStock} />}
            {tab === 'reports' && canViewReports && <ReportsTab branch={branch} branchSales={branchSales} advanceOrders={branchAdvance} />}
            {tab === 'audit' && isAdminUser && <AuditLogsTab branch={branch} branchStock={branchStock} />}
            {tab === 'settings' && isAdminUser && <SettingsTab branch={branch} branchStock={branchStock} />}
          </div>
        </main>
      </div>
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

function HeroKpi({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10"><div className="flex items-center justify-between text-white/60"><p className="text-[10px] font-black uppercase tracking-wide">{label}</p>{icon}</div><p className="mt-1 text-xl font-black tabular-nums text-white">{value}</p></div>;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-white p-3 text-center ring-1 ring-slate-200"><p className="text-lg font-black text-slate-950">{value}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p></div>;
}
