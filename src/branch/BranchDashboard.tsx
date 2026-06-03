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
  { id: 'closure' as const, label: 'Cashier Closure', icon: WalletCards, adminOnly: false },
  { id: 'store-orders' as const, label: 'Store Orders', icon: Store, adminOnly: false },
  { id: 'salesperson' as const, label: 'Salesperson Report', icon: UserRound, adminOnly: false },
  { id: 'reports' as const, label: 'Reports', icon: FileText, adminOnly: false },
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
  const { bills, cashMovements, notifications, storeOrders, purchases } = useBranchOpsStore();

  const [tab, setTab] = useState<TabId>('bill');
  const initializedRef = useRef<Branch | null>(null);

  const branchStock      = stock[branch]           || [];
  const branchIncoming   = incoming[branch]        || [];
  const branchAdvance    = advanceOrders?.[branch] || [];
  const branchSales      = sales[branch]           || [];
  const branchThresholds = thresholds[branch]      || {};
  const colors           = BRANCH_COLORS[branch];
  const role = currentUser?.role || '';
  const isAdminUser = ['admin', 'admin_snb', 'admin_vrsnb', 'owner'].includes(role);
  const tabs = BASE_TABS.filter((t) => !t.adminOnly || isAdminUser);

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

  const lowStockCount = useMemo(
    () => branchStock.filter((s) => s.quantity <= (branchThresholds[s.itemName] ?? s.minThreshold ?? 10)).length,
    [branchStock, branchThresholds],
  );
  const pendingIncoming = branchIncoming.filter((i) => !i.confirmed).length;
  const pendingAdvance = branchAdvance.filter((o) => o.status === 'pending').length;
  const unreadNotifications = notifications.filter((n) => n.branch === branch && n.status === 'Unread').length;
  const pendingStoreOrders = storeOrders.filter((o) => o.branch === branch && o.status === 'Pending Store Confirmation').length;
  const pendingPurchases = purchases.filter((p) => p.branch === branch && p.total > p.paidAmount).length;

  const todayString = new Date().toDateString();
  const todaySalesLog = useMemo(
    () => branchSales.filter((s) => new Date(s.soldAt).toDateString() === todayString),
    [branchSales, todayString],
  );
  const totalTodayRevenue = useMemo(
    () => todaySalesLog.reduce((s, r) => s + (r.unitPrice ?? 0) * r.quantitySold, 0) + bills.filter((b) => b.branch === branch && new Date(b.createdAt).toDateString() === todayString).reduce((s, b) => s + b.total, 0),
    [todaySalesLog, bills, branch, todayString],
  );
  const currentCash = cashMovements.filter((m) => m.branch === branch && m.paymentMode === 'cash').reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0);
  const currentUpi = cashMovements.filter((m) => m.branch === branch && m.paymentMode === 'upi').reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0);
  const currentCard = cashMovements.filter((m) => m.branch === branch && m.paymentMode === 'card').reduce((s, m) => s + (m.direction === 'in' ? m.amount : -m.amount), 0);

  return (
    <div className="branch-command-screen min-h-0 bg-transparent flex flex-col pt-0" style={{ minHeight: 'calc(100dvh - var(--header-h, 4rem))', paddingBottom: 'var(--nav-h, 5.25rem)' }}>
      <div className="shrink-0 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="px-4 pt-3 pb-2 md:px-6">
          <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-4 text-white shadow-lg shadow-slate-300/50">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide', colors.badge)}>
                    <Building2 className="size-3" /> {BRANCH_LABELS[branch]}
                  </span>
                  {pendingIncoming > 0 && <Badge tone="green"><Package className="size-3" /> {pendingIncoming} incoming</Badge>}
                  {pendingAdvance > 0 && <Badge tone="amber"><FileClock className="size-3" /> {pendingAdvance} legacy advance</Badge>}
                  {pendingStoreOrders > 0 && <Badge tone="blue"><Store className="size-3" /> {pendingStoreOrders} store confirms</Badge>}
                  {unreadNotifications > 0 && <Badge tone="red"><Bell className="size-3" /> {unreadNotifications} admin alerts</Badge>}
                </div>
                <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">Branch Billing Command Center</h1>
                <p className="mt-1 text-sm font-semibold text-slate-300">Billmaxo-style fast billing, cashier controls, stock governance, purchase, bank, audit and reports.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[620px]">
                <HeroKpi label="Today Sales" value={money(totalTodayRevenue)} icon={<Receipt className="size-4" />} />
                <HeroKpi label="Cash" value={money(currentCash)} icon={<Banknote className="size-4" />} />
                <HeroKpi label="UPI" value={money(currentUpi)} icon={<Smartphone className="size-4" />} />
                <HeroKpi label="Card" value={money(currentCard)} icon={<CreditCard className="size-4" />} />
              </div>
            </div>
            {isAdminUser && <div className="mt-4"><BranchAdminKpiStrip branch={branch} /></div>}
          </div>
        </div>
        <div className="px-4 pb-3 md:px-6">
          <div className="branch-module-tabs overflow-x-auto rounded-[1.5rem] bg-slate-100 p-2 ring-1 ring-slate-200">
            <div className="flex min-w-max gap-2">
              {tabs.map((t) => {
                const count = t.id === 'notifications' ? unreadNotifications : t.id === 'store-orders' ? pendingStoreOrders : t.id === 'purchase-pay' ? pendingPurchases : 0;
                const Icon = t.icon;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)} className={cn('relative flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition active:scale-[0.98]', tab === t.id ? 'bg-slate-950 text-white shadow-lg shadow-slate-200' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}>
                    <Icon className="size-4" /> {t.label}
                    {count > 0 && <span className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className={cn('flex-1 min-h-0 px-4 py-4 md:px-6', tab !== 'bill' && 'overflow-y-auto space-y-5')}>
        {tab === 'bill' && <BranchBillingProTab branch={branch} branchStock={branchStock} onOpenTab={(id) => setTab(id as TabId)} />}
        {tab === 'advance' && <AdvanceCakeOrdersTab branch={branch} branchStock={branchStock} onOpenTab={(id) => setTab(id as TabId)} />}
        {tab === 'quotation' && <QuotationTab branch={branch} branchStock={branchStock} onOpenTab={(id) => setTab(id as TabId)} />}
        {tab === 'returns' && <ReturnsTab branch={branch} branchStock={branchStock} />}
        {tab === 'purchase' && isAdminUser && <PurchaseTab branch={branch} branchStock={branchStock} />}
        {tab === 'purchase-pay' && isAdminUser && <PurchasePayTab branch={branch} branchStock={branchStock} />}
        {tab === 'po' && isAdminUser && <PurchaseOrderTab branch={branch} branchStock={branchStock} />}
        {tab === 'stock' && <StockTab branch={branch} branchStock={branchStock} branchIncoming={branchIncoming} branchThresholds={branchThresholds} loading={loading} stockMismatches={stockMismatches.filter((m) => m.branch === branch)} />}
        {tab === 'history' && <BranchBillHistoryProTab branch={branch} branchStock={branchStock} />}
        {tab === 'closure' && <CashierClosureTab branch={branch} branchStock={branchStock} />}
        {tab === 'salesperson' && <SalespersonReportTab branch={branch} branchStock={branchStock} />}
        {tab === 'notifications' && isAdminUser && <AdminNotificationsBranchTab branch={branch} branchStock={branchStock} />}
        {tab === 'store-orders' && <StoreOrdersTab branch={branch} branchStock={branchStock} />}
        {tab === 'current-cash' && isAdminUser && <CurrentCashTab branch={branch} branchStock={branchStock} />}
        {tab === 'bank' && isAdminUser && <BankTab branch={branch} branchStock={branchStock} />}
        {tab === 'reports' && <ReportsTab branch={branch} branchSales={branchSales} advanceOrders={branchAdvance} />}
        {tab === 'audit' && isAdminUser && <AuditLogsTab branch={branch} branchStock={branchStock} />}
        {tab === 'settings' && isAdminUser && <SettingsTab branch={branch} branchStock={branchStock} />}
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
