// src/components/admin/AdminCreditTab.tsx
// Shared Credit Tab – used by AdminVRSNBDashboard, AdminSNBDashboard, and AdminDashboard
// Scope is controlled by the `branches` prop.

import { useEffect, useState, useMemo } from 'react';
import { useBranchStore } from '@/branch/branchStore';
import type { CreditSale, CreditPayment } from '@/branch/branchStore';
import type { Branch } from '@/branch/types';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  IndianRupee, Users, CheckCircle2, Clock, AlertCircle,
  ChevronDown, ChevronUp, Filter, Loader2, Download, Percent, Pencil, Lock, X,
} from 'lucide-react';

const PAYMENT_MODES: CreditPayment['paymentMode'][] = ['cash', 'upi', 'card', 'bank'];

// ── Edit a settled credit payment's mode (fix a mis-recorded cash/UPI/card entry) ──
// Exported so branch-specific admin dashboards (e.g. AdminSNBDashboard's own local
// Credit tab) can reuse the same correction UI without duplicating the RPC wiring.
export function EditCreditPaymentModeModal({
  payment,
  onClose,
  onSaved,
}: {
  payment: CreditPayment;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { currentUser } = useAuthStore();
  const [mode, setMode] = useState<CreditPayment['paymentMode']>(payment.paymentMode);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (mode === payment.paymentMode) { setError('Choose a different payment mode.'); return; }
    if (!reason.trim()) { setError('Enter a reason for this correction.'); return; }
    if (!password) { setError('Enter your password to confirm.'); return; }
    setSaving(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('edit_branch_credit_payment_mode_secure', {
      p_branch: payment.branch,
      p_credit_payment_id: payment.id,
      p_new_mode: mode,
      p_reason: reason.trim(),
      p_password: password,
      p_changed_by: currentUser?.username || currentUser?.displayName || 'Admin',
    });
    setSaving(false);
    if (rpcError) {
      if (/INVALID_PASSWORD/i.test(rpcError.message)) setError('Incorrect password.');
      else if (/edit_branch_credit_payment_mode_secure|could not find the function|schema cache|does not exist/i.test(rpcError.message)) {
        setError('This feature is not installed yet. Ask the developer to run the latest migration.');
      } else setError(rpcError.message);
      return;
    }
    void data;
    onSaved(`Payment mode updated to ${mode.toUpperCase()} for bill #${payment.billNo}.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">Correct Payment Mode</h3>
          <button onClick={onClose}><X className="size-4 text-slate-400" /></button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Bill #{payment.billNo} · {formatCurrency(payment.amount)} collected on{' '}
          {new Date(payment.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          {' '}as <span className="font-bold uppercase">{payment.paymentMode}</span>
        </p>
        <div className="space-y-2.5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">New Payment Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as CreditPayment['paymentMode'])}
              className="mt-1 w-full rounded-lg border border-border px-2 py-2 text-sm font-semibold bg-background"
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>{m.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. cashier entered wrong mode"
              className="mt-1 w-full rounded-lg border border-border px-2 py-2 text-sm bg-background"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Your Password</label>
            <div className="relative mt-1">
              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-border py-2 pl-8 pr-2 text-sm bg-background"
              />
            </div>
          </div>
          {error && (
            <p className="text-[11px] text-destructive flex items-center gap-1">
              <AlertCircle className="size-3 shrink-0" />{error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2 text-sm font-bold">Cancel</button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex-1 rounded-xl bg-slate-950 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Correction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<CreditSale['status'], string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  partial: 'bg-blue-100 text-blue-700 border-blue-200',
  settled: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const BRANCH_COLOR: Record<Branch, string> = {
  Cafe:  '#10B981',
  VRSNB: '#5BA3C9',
  SNB:   '#C5973E',
  Hosur: '#2D7D6F',
};

const PIE_COLORS = ['#C5973E', '#5BA3C9', '#2D7D6F'];

function KpiCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-soft relative overflow-hidden">
      <div
        className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-5 -translate-y-6 translate-x-6"
        style={{ background: 'hsl(var(--primary))' }}
      />
      <div className={cn('size-9 rounded-xl flex items-center justify-center mb-3 shadow-sm', color)}>
        {icon}
      </div>
      <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-none">{value}</p>
      <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1.5">
        {label}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Expandable credit sale card ───────────────────────────────────────────────
function CreditCard({ sale }: { sale: CreditSale & { branch: Branch } }) {
  const { settleCreditSale, applyCreditDiscount, creditPayments } = useBranchStore();
  const [open, setOpen] = useState(false);
  const [settleAmt, setSettleAmt] = useState('');
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState('');
  const [editingPayment, setEditingPayment] = useState<CreditPayment | null>(null);
  const [correctionMessage, setCorrectionMessage] = useState('');

  const salePayments = useMemo(
    () => (creditPayments[sale.branch] || []).filter((p) => p.creditSaleId === sale.id),
    [creditPayments, sale.branch, sale.id],
  );

  const [showDiscount, setShowDiscount] = useState(false);
  const [discountAmt, setDiscountAmt] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [discountError, setDiscountError] = useState('');

  const handleApplyDiscount = async () => {
    const amt = parseFloat(discountAmt);
    if (isNaN(amt) || amt <= 0) { setDiscountError('Enter a valid amount'); return; }
    if (amt > sale.creditAmount) { setDiscountError('Discount exceeds balance due'); return; }
    setApplyingDiscount(true); setDiscountError('');
    const err = await applyCreditDiscount(sale.branch, sale.id, amt, discountReason || undefined);
    setApplyingDiscount(false);
    if (err) setDiscountError(err);
    else { setDiscountAmt(''); setDiscountReason(''); setShowDiscount(false); }
  };

  const isOverdue =
    sale.status !== 'settled' &&
    sale.dueDate &&
    new Date(sale.dueDate) < new Date();

  const handleSettle = async () => {
    const amt = parseFloat(settleAmt);
    if (isNaN(amt) || amt <= 0) { setSettleError('Enter a valid amount'); return; }
    if (amt > sale.creditAmount) { setSettleError('Amount exceeds balance due'); return; }
    setSettling(true); setSettleError('');
    const err = await settleCreditSale(sale.branch, sale.id, amt);
    setSettling(false);
    if (err) setSettleError(err);
    else setSettleAmt('');
  };

  return (
    <div
      className={cn(
        'border rounded-xl overflow-hidden transition-all',
        isOverdue ? 'border-red-300 bg-red-50/40' : 'border-border bg-card',
      )}
    >
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{sale.customerName}</span>
            {sale.customerPhone && (
              <span className="text-[10px] text-muted-foreground">{sale.customerPhone}</span>
            )}
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border font-semibold capitalize shrink-0',
                STATUS_COLOR[sale.status],
              )}
            >
              {sale.status}
            </span>
            {isOverdue && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border font-semibold bg-red-100 text-red-700 border-red-200">
                Overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
              style={{
                background: `${BRANCH_COLOR[sale.branch]}20`,
                color: BRANCH_COLOR[sale.branch],
              }}
            >
              {sale.branch}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(sale.createdAt).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            {sale.billNo && (
              <span className="text-[10px] text-muted-foreground">Bill #{sale.billNo}</span>
            )}
          </div>
        </div>
        <div className="text-right ml-3 shrink-0">
          <p className="text-sm font-bold tabular-nums text-destructive">
            -{formatCurrency(sale.creditAmount)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Paid {formatCurrency(sale.amountPaid)} / {formatCurrency(sale.subtotal)}
          </p>
        </div>
        <div className="ml-2 shrink-0 text-muted-foreground">
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border space-y-3">
          {/* Item breakdown */}
          <div className="mt-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Items
            </p>
            <div className="space-y-1">
              {sale.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{item.itemName}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {item.quantity} {item.sellUnit} × {formatCurrency(item.price)} ={' '}
                    <span className="font-semibold text-foreground">
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment summary */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="bg-muted rounded-lg p-2 text-center">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Subtotal</p>
              <p className="text-sm font-bold tabular-nums">{formatCurrency(sale.subtotal)}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-emerald-700 uppercase font-semibold">Paid</p>
              <p className="text-sm font-bold tabular-nums text-emerald-700">
                {formatCurrency(sale.amountPaid)}
              </p>
            </div>
            <div className="bg-red-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-red-700 uppercase font-semibold">Due</p>
              <p className="text-sm font-bold tabular-nums text-red-700">
                {formatCurrency(sale.creditAmount)}
              </p>
            </div>
          </div>

          {/* Meta */}
          <div className="space-y-1 text-xs text-muted-foreground">
            {sale.dueDate && (
              <p>
                Due Date:{' '}
                <span className={cn('font-semibold', isOverdue ? 'text-red-600' : 'text-foreground')}>
                  {new Date(sale.dueDate).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {isOverdue ? ' ⚠ Overdue' : ''}
                </span>
              </p>
            )}
            {sale.settledAt && (
              <p>
                Settled:{' '}
                <span className="font-semibold text-emerald-600">
                  {new Date(sale.settledAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </p>
            )}
            <p>Recorded by: <span className="font-semibold text-foreground">{sale.soldBy}</span></p>
            {sale.notes && <p>Notes: <span className="text-foreground">{sale.notes}</span></p>}
          </div>

          {/* ── Collect Payment (settle) ── */}
          {sale.status !== 'settled' && (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Collect Payment
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                  <input
                    type="number"
                    placeholder={`Max ${formatCurrency(sale.creditAmount)}`}
                    value={settleAmt}
                    onChange={e => { setSettleAmt(e.target.value); setSettleError(''); }}
                    className="w-full pl-7 pr-2 py-2 rounded-xl bg-background border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                  />
                </div>
                <button
                  onClick={handleSettle}
                  disabled={settling || !settleAmt}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold active:scale-95 disabled:opacity-50 transition"
                >
                  {settling
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <CheckCircle2 className="size-3.5" />}
                  {settling ? '…' : 'Collect'}
                </button>
              </div>
              {settleError && (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertCircle className="size-3 shrink-0" />{settleError}
                </p>
              )}

              {/* ── Give Discount ── */}
              <div className="pt-1">
                {!showDiscount ? (
                  <button
                    onClick={() => setShowDiscount(true)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 hover:underline"
                  >
                    <Percent className="size-3" />Give a discount instead
                  </button>
                ) : (
                  <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-2.5 space-y-2">
                    <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                      Give Discount (write off balance — not counted as cash collected)
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                        <input
                          type="number"
                          placeholder={`Max ${formatCurrency(sale.creditAmount)}`}
                          value={discountAmt}
                          onChange={e => { setDiscountAmt(e.target.value); setDiscountError(''); }}
                          className="w-full pl-7 pr-2 py-2 rounded-xl bg-background border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                        />
                      </div>
                      <button
                        onClick={handleApplyDiscount}
                        disabled={applyingDiscount || !discountAmt}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold active:scale-95 disabled:opacity-50 transition"
                      >
                        {applyingDiscount
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : <Percent className="size-3.5" />}
                        {applyingDiscount ? '…' : 'Apply'}
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Reason (optional, e.g. loyal customer, minor complaint)"
                      value={discountReason}
                      onChange={e => setDiscountReason(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-border text-xs bg-background"
                    />
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => { setShowDiscount(false); setDiscountError(''); }}
                        className="text-[11px] text-muted-foreground hover:underline"
                      >
                        Cancel
                      </button>
                      {discountError && (
                        <p className="text-[11px] text-destructive flex items-center gap-1">
                          <AlertCircle className="size-3 shrink-0" />{discountError}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!!sale.discountAmount && sale.discountAmount > 0 && (
            <p className="text-[10px] text-amber-700">
              Total discount given on this bill: {formatCurrency(sale.discountAmount)}
            </p>
          )}

          {/* ── Payment History / Correct Mode (e.g. cashier logged UPI as Cash) ── */}
          {salePayments.length > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Payment History
              </p>
              {correctionMessage && (
                <p className="text-[11px] text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="size-3 shrink-0" />{correctionMessage}
                </p>
              )}
              <div className="space-y-1.5">
                {salePayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg bg-muted px-2.5 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">
                        {formatCurrency(p.amount)} · <span className="uppercase">{p.paymentMode}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {p.collectedBy ? ` · ${p.collectedBy}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => { setEditingPayment(p); setCorrectionMessage(''); }}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700"
                    >
                      <Pencil className="size-3" />Fix Mode
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editingPayment && (
        <EditCreditPaymentModeModal
          payment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSaved={(message) => { setEditingPayment(null); setCorrectionMessage(message); }}
        />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface AdminCreditTabProps {
  branches: Branch[];
  accentColor?: string; // e.g. 'text-blue-700' for VRSNB, 'text-amber-600' for SNB
}

export default function AdminCreditTab({ branches, accentColor = 'text-primary' }: AdminCreditTabProps) {
  const { creditSales, fetchCreditSales, fetchCreditPayments } = useBranchStore();
  const [statusFilter, setStatusFilter] = useState<'all' | CreditSale['status']>('all');
  const [branchFilter, setBranchFilter] = useState<Branch | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<
    'date' | 'customer' | 'branch' | 'billNo' | 'subtotal' | 'amountPaid' | 'creditAmount' | 'status'
  >('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Fetch on mount for each relevant branch
  useEffect(() => {
    branches.forEach(b => { fetchCreditSales(b); fetchCreditPayments(b); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchCreditSales, fetchCreditPayments]);

  // Collect all credit sales for the given branches
  const allSales = useMemo(() => {
    const result: (CreditSale & { branch: Branch })[] = [];
    branches.forEach(branch => {
      (creditSales[branch] || []).forEach(s => result.push({ ...s, branch }));
    });
    return result.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [creditSales, branches]);

  // Filtered list
  const filtered = useMemo(() => {
    return allSales.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (branchFilter !== 'all' && s.branch !== branchFilter) return false;
      if (
        searchQuery &&
        !s.customerName.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !(s.customerPhone || '').includes(searchQuery) &&
        !s.billNo.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    });
  }, [allSales, statusFilter, branchFilter, searchQuery]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case 'date':
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        case 'customer':
          return a.customerName.localeCompare(b.customerName) * dir;
        case 'branch':
          return a.branch.localeCompare(b.branch) * dir;
        case 'billNo':
          return (a.billNo ?? '').localeCompare(b.billNo ?? '') * dir;
        case 'subtotal':
          return (a.subtotal - b.subtotal) * dir;
        case 'amountPaid':
          return (a.amountPaid - b.amountPaid) * dir;
        case 'creditAmount':
          return (a.creditAmount - b.creditAmount) * dir;
        case 'status':
          return a.status.localeCompare(b.status) * dir;
        default:
          return 0;
      }
    });
  }, [filtered, sortField, sortDir]);

  // KPI aggregates
  const totalGiven = allSales.reduce((a, s) => a + s.subtotal, 0);
  const totalCollected = allSales.reduce((a, s) => a + s.amountPaid, 0);
  const totalOutstanding = allSales.filter((sale) => sale.status !== 'settled').reduce((a, s) => a + s.creditAmount, 0);
  const overdueCount = allSales.filter(
    s => s.status !== 'settled' && s.dueDate && new Date(s.dueDate) < new Date(),
  ).length;

  // Pie chart – status distribution by credit amount
  const pieData = useMemo(() => {
    const map = new Map<string, number>([['Pending', 0], ['Partial', 0], ['Settled', 0]]);
    allSales.forEach(s => {
      if (s.status === 'pending') map.set('Pending', (map.get('Pending') || 0) + s.creditAmount);
      else if (s.status === 'partial') map.set('Partial', (map.get('Partial') || 0) + s.creditAmount);
      else map.set('Settled', (map.get('Settled') || 0) + s.subtotal);
    });
    return [...map.entries()]
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [allSales]);

  // Branch bar chart (only useful when >1 branch)
  const branchBarData = useMemo(() => {
    return branches.map(b => {
      const bSales = allSales.filter(s => s.branch === b);
      return {
        branch: b,
        outstanding: bSales.reduce((a, s) => a + s.creditAmount, 0),
        collected: bSales.reduce((a, s) => a + s.amountPaid, 0),
      };
    });
  }, [allSales, branches]);

  const showBranchFilter = branches.length > 1;

  const handleExcelDownload = async () => {
    const XLSX = await import('@/lib/safeSpreadsheet');
    const rows = sorted.map(s => ({
      'Branch':           s.branch,
      'Bill No':          s.billNo ?? '',
      'Customer Name':    s.customerName,
      'Customer Phone':   s.customerPhone ?? '',
      'Items':            s.items.map(i => `${i.itemName} ×${i.quantity}`).join(', '),
      'Subtotal (₹)':    s.subtotal,
      'Amount Paid (₹)': s.amountPaid,
      'Credit Due (₹)':  s.creditAmount,
      'Status':           s.status,
      'Sold By':          s.soldBy,
      'Date':             new Date(s.createdAt).toLocaleDateString('en-IN'),
      'Due Date':         s.dueDate ? new Date(s.dueDate).toLocaleDateString('en-IN') : '',
      'Notes':            s.notes ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Note: 'No credit sales match selected filters' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Credit Sales');
    XLSX.writeFile(wb, `CreditSales_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* ── Header row with Excel button ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{allSales.length} total · {filtered.length} shown</p>
        <button
          onClick={handleExcelDownload}
          className="flex items-center gap-1 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted transition"
        >
          <Download className="size-3" />Excel
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          icon={<IndianRupee className="size-4" />}
          label="Total Credit Given"
          value={formatCurrency(totalGiven)}
          sub={`${allSales.length} transactions`}
          color="bg-primary/10 text-primary"
        />
        <KpiCard
          icon={<CheckCircle2 className="size-4" />}
          label="Collected"
          value={formatCurrency(totalCollected)}
          color="bg-emerald-50 text-emerald-700"
        />
        <KpiCard
          icon={<Clock className="size-4" />}
          label="Outstanding"
          value={formatCurrency(totalOutstanding)}
          color="bg-amber-50 text-amber-700"
        />
        <KpiCard
          icon={<AlertCircle className="size-4" />}
          label="Overdue"
          value={String(overdueCount)}
          sub="past due date"
          color={overdueCount > 0 ? 'bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'}
        />
      </div>

      {/* ── Charts ─────────────────────────────────────────────────────────── */}
      {allSales.length > 0 && (
        <div className={cn('gap-4', branches.length > 1 ? 'grid grid-cols-1' : 'space-y-4')}>
          {/* Pie – status distribution */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-display text-base font-bold mb-1">Credit Status Distribution</h3>
            <p className="text-[10px] text-muted-foreground mb-3">By outstanding amount</p>
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={130}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={32}
                      outerRadius={55}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [formatCurrency(v), 'Amount']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div
                        className="size-3 rounded-full shrink-0"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">{d.name}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {formatCurrency(d.value)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Branch bar chart – only shown for multi-branch admins */}
          {branches.length > 1 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="font-display text-base font-bold mb-1">Credit by Branch</h3>
              <p className="text-[10px] text-muted-foreground mb-3">Outstanding vs Collected</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={branchBarData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="branch" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v)]} />
                  <Bar dataKey="outstanding" name="Outstanding" fill="#C5973E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" name="Collected" fill="#2D7D6F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                {[
                  { label: 'Outstanding', color: '#C5973E' },
                  { label: 'Collected', color: '#2D7D6F' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="size-2.5 rounded-sm shrink-0" style={{ background: l.color }} />
                    <span className="text-[10px] text-muted-foreground">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Filters</h3>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search customer, phone, bill no..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
        />

        <div className="grid grid-cols-2 gap-2">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="border rounded-lg px-2 py-1.5 text-sm bg-background"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="settled">Settled</option>
          </select>

          {/* Branch filter – only for multi-branch admins */}
          {showBranchFilter ? (
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value as Branch | 'all')}
              className="border rounded-lg px-2 py-1.5 text-sm bg-background"
            >
              <option value="all">All Branches</option>
              {branches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          ) : (
            <div />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={sortField}
            onChange={e => setSortField(e.target.value as typeof sortField)}
            className="border rounded-lg px-2 py-1.5 text-sm bg-background"
          >
            <option value="date">Sort: Date</option>
            <option value="customer">Sort: Customer Name</option>
            <option value="branch">Sort: Branch</option>
            <option value="billNo">Sort: Bill No</option>
            <option value="subtotal">Sort: Subtotal</option>
            <option value="amountPaid">Sort: Amount Paid</option>
            <option value="creditAmount">Sort: Credit Due</option>
            <option value="status">Sort: Status</option>
          </select>
          <button
            onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
            className="border rounded-lg px-2 py-1.5 text-sm bg-background flex items-center justify-center gap-1"
          >
            {sortDir === 'asc' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {sortDir === 'asc' ? 'Ascending' : 'Descending'}
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} records · Outstanding{' '}
          {formatCurrency(filtered.reduce((a, s) => a + s.creditAmount, 0))}
        </p>
      </div>

      {/* ── Credit Sale List ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <div className="bg-card border border-border rounded-xl py-10 text-center">
            <Users className="size-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No credit sales found</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Credit sales will appear here once they are recorded at the branch.
            </p>
          </div>
        ) : (
          sorted.map(sale => <CreditCard key={sale.id} sale={sale} />)
        )}
      </div>
    </div>
  );
}
