// src/pages/OwnerDashboard.tsx
// Owner Dashboard: All sales visualizations + Attendance & Salary breakdown
import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useBranchStore } from '@/branch/branchStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import OwnerCreditTab from '@/components/admin/OwnerCreditTab';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area, RadialBarChart, RadialBar,
} from 'recharts';
import {
  IndianRupee, ShoppingBag, TrendingUp, Users,
  Building2, BarChart3, CalendarCheck, ArrowUpRight, ArrowDownRight,
  Store, Layers,
} from 'lucide-react';

const COLORS = ['#2D7D6F', '#C5973E', '#5BA3C9', '#E07B5B', '#8B5CF6', '#EC4899'];

function KPI({ icon, label, value, sub, color, trend }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string; trend?: 'up' | 'down' | null }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-soft relative overflow-hidden">
      <div className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-5 -translate-y-6 translate-x-6" style={{ background: 'hsl(var(--primary))' }} />
      <div className="flex items-start justify-between mb-2">
        <div className={cn('size-9 rounded-xl flex items-center justify-center', color)}>{icon}</div>
        {trend === 'up' && <ArrowUpRight className="size-4 text-emerald-500" />}
        {trend === 'down' && <ArrowDownRight className="size-4 text-red-500" />}
      </div>
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

  // Bakery branch sales — revenue = qty * unit_price where available, fallback to qty
  const branchSales = useMemo(() => {
    const branches: Record<string, { qty: number; count: number; revenue: number }> = {
      VRSNB: { qty: 0, count: 0, revenue: 0 },
      SNB: { qty: 0, count: 0, revenue: 0 },
      Hosur: { qty: 0, count: 0, revenue: 0 },
    };
    (['VRSNB', 'SNB', 'Hosur'] as const).forEach(b => {
      (sales[b] || []).filter(s => new Date(s.soldAt) >= cutoff).forEach(s => {
        branches[b].qty += s.quantitySold;
        branches[b].count += 1;
        // Use unit_price field if available on the record
        const unitPrice = (s as typeof s & { unitPrice?: number }).unitPrice ?? 0;
        branches[b].revenue += unitPrice * s.quantitySold;
      });
    });
    return branches;
  }, [sales, cutoff]);

  const totalBakeryRevenue = Object.values(branchSales).reduce((a, v) => a + v.revenue, 0);
  const totalBakeryQty = Object.values(branchSales).reduce((a, v) => a + v.qty, 0);
  const grandTotal = cafeRevenue + totalBakeryRevenue;

  // Daily cafe revenue chart
  const dailyRevenueData = useMemo(() => {
    const days = dateRange === 'today' ? 1 : dateRange === '7d' ? 7 : 30;
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const cafeRev = cafeOrders.filter(o => new Date(o.createdAt).toDateString() === dateStr).reduce((s, o) => s + o.total, 0);
      const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      result.push({ date: label, cafe: cafeRev });
    }
    return result;
  }, [cafeOrders, dateRange]);

  // Revenue share pie
  const revShareData = [
    { name: 'Cafe', value: cafeRevenue, color: COLORS[0] },
    { name: 'VRSNB', value: branchSales.VRSNB.revenue, color: COLORS[1] },
    { name: 'SNB', value: branchSales.SNB.revenue, color: COLORS[2] },
    { name: 'Hosur', value: branchSales.Hosur.revenue, color: COLORS[3] },
  ].filter(d => d.value > 0);

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

  // Top cafe items by revenue
  const topCafeItems = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    cafeOrders.forEach(o => o.items.forEach(ci => {
      const ex = map.get(ci.menuItem.name);
      const rev = ci.menuItem.price * ci.quantity;
      if (ex) { ex.qty += ci.quantity; ex.revenue += rev; }
      else map.set(ci.menuItem.name, { qty: ci.quantity, revenue: rev });
    }));
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 8)
      .map(([name, v]) => ({ name: name.length > 14 ? name.slice(0, 14) + '…' : name, revenue: v.revenue, qty: v.qty }));
  }, [cafeOrders]);

  const maxBranchRev = Math.max(cafeRevenue, branchSales.VRSNB.revenue, branchSales.SNB.revenue, branchSales.Hosur.revenue, 1);

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
        <KPI icon={<IndianRupee className="size-4" />} label="Total Revenue" value={formatCurrency(grandTotal)} sub="All branches" color="bg-primary/10 text-primary" />
        <KPI icon={<Store className="size-4" />} label="Cafe Revenue" value={formatCurrency(cafeRevenue)} sub={`${cafeCount} orders`} color="bg-emerald-50 text-emerald-700" />
        <KPI icon={<ShoppingBag className="size-4" />} label="Bakery Revenue" value={formatCurrency(totalBakeryRevenue)} sub={`${totalBakeryQty} items sold`} color="bg-amber-50 text-amber-700" />
        <KPI icon={<Layers className="size-4" />} label="Bakery Items" value={String(totalBakeryQty)} sub="All branches" color="bg-blue-50 text-blue-700" />
      </div>

      {/* Branch Performance — Revenue */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-display text-base font-bold mb-1 flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" />Branch Performance
        </h3>
        <p className="text-[10px] text-muted-foreground mb-4">Revenue comparison across all branches</p>
        <div className="space-y-3">
          {[
            { label: 'Cafe', value: cafeRevenue, color: 'bg-emerald-500', qty: `${cafeCount} orders` },
            { label: 'VRSNB', value: branchSales.VRSNB.revenue, color: 'bg-blue-500', qty: `${branchSales.VRSNB.qty} items` },
            { label: 'SNB', value: branchSales.SNB.revenue, color: 'bg-amber-500', qty: `${branchSales.SNB.qty} items` },
            { label: 'Hosur', value: branchSales.Hosur.revenue, color: 'bg-purple-500', qty: `${branchSales.Hosur.qty} items` },
          ].map(row => (
            <div key={row.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-body font-medium">{row.label}</span>
                <div className="text-right">
                  <span className="text-sm font-bold tabular-nums">{formatCurrency(row.value)}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{row.qty}</span>
                </div>
              </div>
              <div className="flex-1 bg-muted rounded-full h-2.5">
                <div className={cn('h-full rounded-full transition-all', row.color)} style={{ width: `${Math.round((row.value / maxBranchRev) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue Share Pie */}
      {revShareData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Revenue Share</h3>
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={revShareData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {revShareData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center gap-2.5">
              {revShareData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="size-3 rounded-full shrink-0" style={{ background: d.color }} />
                  <div>
                    <p className="text-xs font-semibold">{d.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(d.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Cafe Revenue Trend */}
      {dateRange !== 'today' && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />Cafe Revenue Trend
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dailyRevenueData}>
              <defs>
                <linearGradient id="cafeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Area type="monotone" dataKey="cafe" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#cafeGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payment Breakdown */}
      {payBreakdown.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-3">Cafe Payment Methods</h3>
          <div className="space-y-2.5">
            {payBreakdown.map((p, i) => {
              const pct = cafeRevenue > 0 ? Math.round((p.value / cafeRevenue) * 100) : 0;
              return (
                <div key={p.name}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-sm font-bold tabular-nums">{formatCurrency(p.value)} <span className="text-xs text-muted-foreground font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Cafe Items by Revenue */}
      {topCafeItems.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Top Items by Revenue</h3>
          <ResponsiveContainer width="100%" height={Math.max(topCafeItems.length * 32, 180)}>
            <BarChart data={topCafeItems} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
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
  // U-15 FIX: track fetch error so we show an error state instead of a silent empty table
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadEmployees = () => {
    setLoading(true);
    setFetchError(null);
    supabase.from('employees').select('*').then(({ data, error }) => {
      if (error) {
        setFetchError(error.message || 'Failed to load employee data.');
      } else if (data) {
        setEmployees(data);
      }
      setLoading(false);
    });
  };

  useEffect(() => { loadEmployees(); }, []);

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
    totalSalary: emps.reduce((a, e) => a + (Number(e.grossSalary) || 0), 0),
  })), [branchGroups]);

  const salaryStats = useMemo(() => {
    const total = employees.reduce((a, e) => a + (Number(e.grossSalary) || 0), 0);
    const advances = employees.reduce((a, e) => a + (Number(e.salaryAdvance) || 0), 0);
    const deductions = employees.reduce((a, e) => a + (Number(e.uniformDeduction) || 0) + (Number(e.otherDeduction) || 0), 0);
    const netPayable = total - advances - deductions;
    return { total, advances, deductions, netPayable };
  }, [employees]);

  const deptData = useMemo(() => {
    const map = new Map<string, { count: number; salary: number }>();
    employees.forEach(e => {
      const ex = map.get(e.department);
      if (ex) { ex.count++; ex.salary += (Number(e.grossSalary) || 0); }
      else map.set(e.department, { count: 1, salary: (Number(e.grossSalary) || 0) });
    });
    return [...map.entries()].map(([dept, v]) => ({ dept: dept.length > 12 ? dept.slice(0, 12) + '…' : dept, ...v })).sort((a, b) => b.salary - a.salary);
  }, [employees]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="size-8 rounded-2xl bg-primary/10 animate-pulse" />
    </div>
  );

  // U-15 FIX: show explicit error state with retry so owner doesn't see an empty table and think no staff exist
  if (fetchError) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 px-6">
      <div className="size-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <Users className="size-7 text-destructive" />
      </div>
      <div className="text-center">
        <p className="font-display font-bold text-foreground">Failed to load employee data</p>
        <p className="text-sm font-body text-muted-foreground mt-1">{fetchError}</p>
      </div>
      <button
        onClick={loadEmployees}
        className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-body font-semibold active:scale-95 transition-transform"
      >
        Try again
      </button>
    </div>
  );

  const salaryPieData = [
    { name: 'Net Pay', value: Math.max(salaryStats.netPayable, 0) },
    { name: 'Advances', value: salaryStats.advances },
    { name: 'Deductions', value: salaryStats.deductions },
  ].filter(d => d.value > 0);

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
      {salaryPieData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Salary Breakdown</h3>
          <div className="flex gap-4 items-center">
            <ResponsiveContainer width="55%" height={160}>
              <PieChart>
                <Pie data={salaryPieData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
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
      )}

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
              <Tooltip />
              <Bar dataKey="count" name="Staff Count" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Branch Payroll */}
      {branchChartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-base font-bold mb-4">Branch Payroll</h3>
          <div className="space-y-3">
            {branchChartData.map((b, i) => {
              const maxSal = Math.max(...branchChartData.map(x => x.totalSalary), 1);
              return (
                <div key={b.branch}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium truncate">{b.branch}</span>
                    <span className="text-sm font-bold tabular-nums">{formatCurrency(b.totalSalary)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div className="h-full rounded-full" style={{ width: `${Math.round((b.totalSalary / maxSal) * 100)}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Department Salary */}
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
                  <p className="text-sm font-bold tabular-nums">{formatCurrency(Number(e.grossSalary) || 0)}</p>
                  {e.salaryAdvance > 0 && <p className="text-[10px] text-amber-600">Adv: {formatCurrency(Number(e.salaryAdvance) || 0)}</p>}
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
  const [tab, setTab] = useState<'sales' | 'attendance' | 'credit'>('sales');

  return (
    <div className="min-h-screen bg-background pt-14 pb-24">
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-body font-semibold text-primary uppercase tracking-widest mb-1">Owner Portal</p>
            <h1 className="font-display text-3xl font-bold text-foreground leading-none">Overview</h1>
          </div>
        </div>
      </div>

      <div className="mx-4 my-4 flex gap-1.5 p-1 rounded-2xl" style={{ background: 'hsl(var(--muted))' }}>
        <button
          onClick={() => setTab('sales')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200',
            tab === 'sales' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="flex items-center justify-center gap-2">
            <BarChart3 className="size-4" />Sales
          </span>
        </button>
        <button
          onClick={() => setTab('attendance')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200',
            tab === 'attendance' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="flex items-center justify-center gap-2">
            <CalendarCheck className="size-4" />Attendance
          </span>
        </button>
        <button
          onClick={() => setTab('credit')}
          className={cn(
            'flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all duration-200',
            tab === 'credit' ? 'bg-card shadow-soft text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="flex items-center justify-center gap-2">
            💳 Credit
          </span>
        </button>
      </div>

      <div className="px-4 space-y-4">
        {tab === 'sales'      && <SalesOverviewTab />}
        {tab === 'attendance' && <AttendanceSalaryTab />}
        {tab === 'credit'     && <OwnerCreditTab />}
      </div>
    </div>
  );
}
