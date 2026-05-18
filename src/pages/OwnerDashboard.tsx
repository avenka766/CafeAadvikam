// src/pages/OwnerDashboard.tsx
// Owner Dashboard: All sales visualizations + Attendance & Salary breakdown
import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useBranchStore } from '@/branch/branchStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import {
  IndianRupee, ShoppingBag, TrendingUp, Users,
  Building2, BarChart3, CalendarCheck, LogOut,
} from 'lucide-react';

const COLORS = ['#2D7D6F', '#C5973E', '#5BA3C9', '#E07B5B', '#8B5CF6', '#EC4899'];

function KPI({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-soft relative overflow-hidden">
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-5 -translate-y-6 translate-x-6" style={{ background: 'hsl(var(--primary))' }} />
      <div className={cn('size-9 rounded-xl flex items-center justify-center mb-3', color)}>{icon}</div>
      <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-none">{value}</p>
      <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Sales Overview Tab ─────────────────────────────────────────────────────────
function SalesOverviewTab() {
  const { orders, startPolling, stopPolling } = useOrderStore();
  const { sales, fetchBranchData } = useBranchStore();
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('7d');

  useEffect(() => { startPolling(60); return () => stopPolling(); }, [startPolling, stopPolling]);
  useEffect(() => { ['VRSNB', 'SNB', 'Hosur'].forEach(b => fetchBranchData(b as 'VRSNB' | 'SNB' | 'Hosur')); }, [fetchBranchData]);

  const cutoff = useMemo(() => {
    const d = new Date();
    if (dateRange === 'today') { d.setHours(0, 0, 0, 0); return d; }
    if (dateRange === '7d') { d.setDate(d.getDate() - 7); return d; }
    d.setDate(d.getDate() - 30); return d;
  }, [dateRange]);

  // Cafe orders
  const cafeOrders = useMemo(() => orders.filter(o => new Date(o.createdAt) >= cutoff && o.status === 'served'), [orders, cutoff]);
  const cafeRevenue = cafeOrders.reduce((s, o) => s + o.total, 0);
  const cafeCount = cafeOrders.length;

  // Bakery branch sales
  const branchSales = useMemo(() => {
    const branches: Record<string, { qty: number; count: number }> = { VRSNB: { qty: 0, count: 0 }, SNB: { qty: 0, count: 0 }, Hosur: { qty: 0, count: 0 } };
    (['VRSNB', 'SNB', 'Hosur'] as const).forEach(b => {
      (sales[b] || []).filter(s => new Date(s.soldAt) >= cutoff).forEach(s => {
        branches[b].qty += s.quantitySold;
        branches[b].count += 1;
      });
    });
    return branches;
  }, [sales, cutoff]);
  const totalBakeryQty = Object.values(branchSales).reduce((a, v) => a + v.qty, 0);

  // Daily cafe revenue chart (last 7/30 days)
  const dailyRevenueData = useMemo(() => {
    const days = dateRange === 'today' ? 1 : dateRange === '7d' ? 7 : 30;
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const revenue = cafeOrders.filter(o => new Date(o.createdAt).toDateString() === dateStr).reduce((s, o) => s + o.total, 0);
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      result.push({ date: label, revenue });
    }
    return result;
  }, [cafeOrders, dateRange]);

  // Branch comparison
  const branchCompareData = [
    { name: 'Cafe', value: cafeRevenue, color: COLORS[0] },
    { name: 'VRSNB', value: branchSales.VRSNB.qty, color: COLORS[1] },
    { name: 'SNB', value: branchSales.SNB.qty, color: COLORS[2] },
    { name: 'Hosur', value: branchSales.Hosur.qty, color: COLORS[3] },
  ];

  // Cafe payment breakdown
  const payBreakdown = useMemo(() => {
    let cash = 0, upi = 0, card = 0;
    cafeOrders.forEach(o => {
      if (o.paymentType === 'cash') cash += o.total;
      else if (o.paymentType === 'upi') upi += o.total;
      else if (o.paymentType === 'card') card += o.total;
      else if (o.paymentType === 'part_payment' && o.paymentBreakdown) {
        cash += o.paymentBreakdown.cash; upi += o.paymentBreakdown.upi; card += o.paymentBreakdown.card;
      }
    });
    return [
      { name: 'Cash', value: cash },
      { name: 'UPI', value: upi },
      { name: 'Card', value: card },
    ].filter(p => p.value > 0);
  }, [cafeOrders]);

  // Top cafe items
  const topCafeItems = useMemo(() => {
    const map = new Map<string, number>();
    cafeOrders.forEach(o => o.items.forEach(ci => map.set(ci.menuItem.name, (map.get(ci.menuItem.name) || 0) + ci.quantity)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, qty]) => ({ name: name.length > 12 ? name.slice(0, 12) + '…' : name, qty }));
  }, [cafeOrders]);

  return (
    <div className="space-y-5">
      {/* Date Range Toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-muted">
        {(['today', '7d', '30d'] as const).map(r => (
          <button key={r} onClick={() => setDateRange(r)} className={cn('flex-1 py-2 rounded-lg text-sm font-semibold transition-all', dateRange === r ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
            {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<IndianRupee className="size-4" />} label="Cafe Revenue" value={formatCurrency(cafeRevenue)} sub={`${cafeCount} orders`} color="bg-primary/10 text-primary" />
        <KPI icon={<ShoppingBag className="size-4" />} label="Bakery Qty" value={String(totalBakeryQty)} sub="all branches" color="bg-amber-50 text-amber-700" />
        <KPI icon={<Building2 className="size-4" />} label="VRSNB Qty" value={String(branchSales.VRSNB.qty)} color="bg-blue-50 text-blue-700" />
        <KPI icon={<Building2 className="size-4" />} label="SNB Qty" value={String(branchSales.SNB.qty)} color="bg-amber-50 text-amber-700" />
      </div>

      {/* Cafe Revenue Trend */}
      {dateRange !== 'today' && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />Cafe Revenue Trend
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={dailyRevenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Branch Compare */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-4 flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" />Branch Performance
        </h3>
        <div className="space-y-3">
          {[
            { label: 'Cafe', value: cafeRevenue, formatted: formatCurrency(cafeRevenue), color: 'bg-emerald-500', max: cafeRevenue || 1 },
            { label: 'VRSNB (qty)', value: branchSales.VRSNB.qty, formatted: `${branchSales.VRSNB.qty} items`, color: 'bg-blue-500', max: Math.max(branchSales.VRSNB.qty, branchSales.SNB.qty, branchSales.Hosur.qty, 1) },
            { label: 'SNB (qty)', value: branchSales.SNB.qty, formatted: `${branchSales.SNB.qty} items`, color: 'bg-amber-500', max: Math.max(branchSales.VRSNB.qty, branchSales.SNB.qty, branchSales.Hosur.qty, 1) },
            { label: 'Hosur (qty)', value: branchSales.Hosur.qty, formatted: `${branchSales.Hosur.qty} items`, color: 'bg-emerald-500', max: Math.max(branchSales.VRSNB.qty, branchSales.SNB.qty, branchSales.Hosur.qty, 1) },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="text-sm font-body w-24 shrink-0">{row.label}</span>
              <div className="flex-1 bg-muted rounded-full h-3">
                <div className={cn('h-full rounded-full transition-all', row.color)} style={{ width: `${Math.round((row.value / row.max) * 100)}%` }} />
              </div>
              <span className="text-sm font-bold tabular-nums shrink-0 w-24 text-right">{row.formatted}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Breakdown */}
      {payBreakdown.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Cafe Payment Methods</h3>
          <div className="flex gap-4">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={payBreakdown} dataKey="value" cx="50%" cy="50%" outerRadius={65} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {payBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center gap-2">
              {payBreakdown.map((p, i) => (
                <div key={p.name} className="flex items-center gap-2">
                  <div className="size-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <div>
                    <p className="text-xs font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(p.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top Cafe Items */}
      {topCafeItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Top Cafe Items</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topCafeItems} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
              <Tooltip />
              <Bar dataKey="qty" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Attendance & Salary Tab ────────────────────────────────────────────────────
function AttendanceSalaryTab() {
  const [employees, setEmployees] = useState<Array<{
    id: string; name: string; branch: string; department: string;
    grossSalary: number; salaryAdvance: number; uniformDeduction: number; otherDeduction: number;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('employees').select('*').then(({ data }) => {
      if (data) setEmployees(data);
      setLoading(false);
    });
  }, []);

  const branchGroups = useMemo(() => {
    const groups: Record<string, typeof employees> = {};
    employees.forEach(e => {
      if (!groups[e.branch]) groups[e.branch] = [];
      groups[e.branch].push(e);
    });
    return groups;
  }, [employees]);

  const branchChartData = useMemo(() => Object.entries(branchGroups).map(([branch, emps]) => ({
    branch: branch.length > 10 ? branch.slice(0, 10) + '…' : branch,
    count: emps.length,
    totalSalary: emps.reduce((a, e) => a + e.grossSalary, 0),
  })), [branchGroups]);

  const salaryStats = useMemo(() => {
    const total = employees.reduce((a, e) => a + e.grossSalary, 0);
    const advances = employees.reduce((a, e) => a + e.salaryAdvance, 0);
    const deductions = employees.reduce((a, e) => a + e.uniformDeduction + e.otherDeduction, 0);
    const netPayable = total - advances - deductions;
    return { total, advances, deductions, netPayable };
  }, [employees]);

  const deptData = useMemo(() => {
    const map = new Map<string, { count: number; salary: number }>();
    employees.forEach(e => {
      const ex = map.get(e.department);
      if (ex) { ex.count++; ex.salary += e.grossSalary; }
      else map.set(e.department, { count: 1, salary: e.grossSalary });
    });
    return [...map.entries()].map(([dept, v]) => ({ dept: dept.length > 12 ? dept.slice(0, 12) + '…' : dept, ...v })).sort((a, b) => b.salary - a.salary);
  }, [employees]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="size-8 rounded-2xl bg-primary/10 animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Salary KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <KPI icon={<Users className="size-4" />} label="Total Staff" value={String(employees.length)} color="bg-primary/10 text-primary" />
        <KPI icon={<IndianRupee className="size-4" />} label="Gross Payroll" value={formatCurrency(salaryStats.total)} color="bg-blue-50 text-blue-700" />
        <KPI icon={<TrendingUp className="size-4" />} label="Net Payable" value={formatCurrency(salaryStats.netPayable)} color="bg-emerald-50 text-emerald-700" />
        <KPI icon={<IndianRupee className="size-4" />} label="Advances" value={formatCurrency(salaryStats.advances)} color="bg-amber-50 text-amber-700" />
      </div>

      {/* Salary Breakdown Pie */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-4">Salary Breakdown</h3>
        <div className="flex gap-4 items-center">
          <ResponsiveContainer width="55%" height={160}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Net Pay', value: Math.max(salaryStats.netPayable, 0) },
                  { name: 'Advances', value: salaryStats.advances },
                  { name: 'Deductions', value: salaryStats.deductions },
                ].filter(d => d.value > 0)}
                dataKey="value" cx="50%" cy="50%" outerRadius={65}
              >
                {[COLORS[0], COLORS[3], COLORS[1]].map((color, i) => <Cell key={i} fill={color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-2">
            {[
              { label: 'Net Pay', value: salaryStats.netPayable, color: COLORS[0] },
              { label: 'Advances', value: salaryStats.advances, color: COLORS[3] },
              { label: 'Deductions', value: salaryStats.deductions, color: COLORS[1] },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="size-3 rounded-full shrink-0" style={{ background: item.color }} />
                <div>
                  <p className="text-xs font-semibold">{item.label}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(item.value)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Staff by Branch */}
      {branchChartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4 flex items-center gap-2">
            <Building2 className="size-4 text-primary" />Staff by Branch
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={branchChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="branch" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number, name: string) => [name === 'totalSalary' ? formatCurrency(v) : v, name === 'totalSalary' ? 'Salary' : 'Staff']} />
              <Bar dataKey="count" name="Staff Count" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Salary by Branch */}
      {branchChartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Branch Payroll</h3>
          <div className="space-y-3">
            {branchChartData.map((b, i) => (
              <div key={b.branch} className="flex items-center gap-3">
                <span className="text-sm font-body w-20 shrink-0 truncate">{b.branch}</span>
                <div className="flex-1 bg-muted rounded-full h-3">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((b.totalSalary / Math.max(...branchChartData.map(x => x.totalSalary), 1)) * 100)}%`, background: COLORS[i % COLORS.length] }} />
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0 text-right">{formatCurrency(b.totalSalary)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Salary by Department */}
      {deptData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Department Salary</h3>
          <ResponsiveContainer width="100%" height={Math.min(deptData.length * 32, 200)}>
            <BarChart data={deptData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="dept" tick={{ fontSize: 10 }} width={80} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Total Salary']} />
              <Bar dataKey="salary" fill={COLORS[2]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Employee List by Branch */}
      {Object.entries(branchGroups).map(([branch, emps]) => (
        <div key={branch} className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">{branch} <span className="text-sm text-muted-foreground font-normal">({emps.length} staff)</span></h3>
          <div className="space-y-2">
            {emps.map(e => (
              <div key={e.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-semibold">{e.name}</p>
                  <p className="text-[10px] text-muted-foreground">{e.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums">{formatCurrency(e.grossSalary)}</p>
                  {e.salaryAdvance > 0 && <p className="text-[10px] text-amber-600">Adv: {formatCurrency(e.salaryAdvance)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function OwnerDashboard() {
  const [tab, setTab] = useState<'sales' | 'attendance'>('sales');
  const { logout } = useAuthStore();

  return (
    <div className="min-h-screen bg-background pt-14 pb-24">
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-body font-semibold text-primary uppercase tracking-widest mb-1">Owner Portal</p>
            <h1 className="font-display text-3xl font-bold text-foreground leading-none">Overview</h1>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl border border-border hover:bg-muted transition-all">
            <LogOut className="size-3.5" />Logout
          </button>
        </div>
      </div>

      <div className="mx-4 my-4 flex gap-1.5 p-1 rounded-2xl" style={{ background: 'hsl(var(--muted))' }}>
        <button onClick={() => setTab('sales')} className={cn('flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200', tab === 'sales' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          <span className="flex items-center justify-center gap-2"><BarChart3 className="size-4" />Sales</span>
        </button>
        <button onClick={() => setTab('attendance')} className={cn('flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200', tab === 'attendance' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          <span className="flex items-center justify-center gap-2"><CalendarCheck className="size-4" />Attendance</span>
        </button>
      </div>

      <div className="px-4 space-y-4">
        {tab === 'sales' && <SalesOverviewTab />}
        {tab === 'attendance' && <AttendanceSalaryTab />}
      </div>
    </div>
  );
}
