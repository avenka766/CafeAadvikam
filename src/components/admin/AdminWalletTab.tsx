import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle, Banknote, CalendarDays, Download, Edit3, Eye, FileText, Gift, History,
  IndianRupee, Loader2, LockKeyhole, Merge, MessageCircle, Plus, Printer, QrCode,
  RefreshCw, RotateCcw, Search, Settings2, ShieldCheck, Smartphone, UserRound,
  WalletCards, X,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { BRANCHES } from '@/branch/types';
import type { Branch } from '@/branch/types';
import type {
  WalletCustomer, WalletCustomerType, WalletDeductionPriority, WalletPaymentMode,
  WalletStatus, WalletTransaction,
} from '@/features/commerce/types';
import { useWalletPromotionStore } from '@/stores/walletPromotionStore';

const customerTypes: WalletCustomerType[] = ['Regular', 'VIP', 'Wholesale', 'Corporate', 'Staff', 'Other'];
const paymentModes: Array<{ value: WalletPaymentMode; label: string }> = [
  { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' }, { value: 'cheque', label: 'Cheque' },
  { value: 'opening_balance', label: 'Opening balance' }, { value: 'promotional_credit', label: 'Promotional credit' },
  { value: 'adjustment', label: 'Adjustment' },
];
const priorities: Array<{ value: WalletDeductionPriority; label: string }> = [
  { value: 'promotional_first', label: 'Promotional balance first' },
  { value: 'paid_first', label: 'Paid balance first' },
  { value: 'proportional', label: 'Deduct proportionally' },
];
const today = () => new Date().toISOString().slice(0, 10);
const dateText = (value?: string | null) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] || character));

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  const safe = rows.length ? rows : [{ Status: 'No data' }];
  const headings = Object.keys(safe[0]);
  const csv = [headings.join(','), ...safe.map((row) => headings.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3" onMouseDown={onClose}>
    <div className={`max-h-[94vh] w-full ${wide ? 'max-w-6xl' : 'max-w-3xl'} overflow-hidden rounded-3xl bg-white shadow-2xl`} onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
        <div><h3 className="font-display text-xl font-black text-slate-950">{title}</h3><p className="text-xs text-slate-500">{subtitle}</p></div>
        <button onClick={onClose} className="rounded-xl bg-slate-100 p-2 text-slate-600" aria-label="Close"><X className="size-4" /></button>
      </div>
      <div className="max-h-[calc(94vh-82px)] overflow-y-auto p-5">{children}</div>
    </div>
  </div>;
}

function Kpi({ label, value, icon, note }: { label: string; value: string; icon: React.ReactNode; note?: string }) {
  return <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-500">{label}</p><p className="mt-2 font-display text-2xl font-black text-slate-950">{value}</p>{note && <p className="mt-1 text-[11px] text-slate-500">{note}</p>}</div><div className="rounded-2xl bg-emerald-50 p-2.5 text-emerald-700">{icon}</div></div>
  </div>;
}

const emptyCustomerForm = () => ({
  customerName: '', mobile: '', alternateMobile: '', email: '', dateOfBirth: '', anniversaryDate: '', address: '',
  customerType: 'Regular' as WalletCustomerType, preferredBranch: 'Cafe' as Branch, openingBalance: '', notes: '', status: 'active' as WalletStatus,
});
const customerFormFromWallet = (wallet: WalletCustomer) => ({
  customerName: wallet.customerName, mobile: wallet.mobile, alternateMobile: wallet.alternateMobile || '', email: wallet.email || '',
  dateOfBirth: wallet.dateOfBirth || '', anniversaryDate: wallet.anniversaryDate || '', address: wallet.address || '', customerType: wallet.customerType,
  preferredBranch: (wallet.preferredBranch || 'Cafe') as Branch, openingBalance: '', notes: wallet.notes || '', status: wallet.status,
});

export default function AdminWalletTab() {
  const {
    wallets, walletTransactions, loadingWallets, error, loadWallets, createWallet, creditWallet,
    updateWalletCustomer, adjustWalletBalance, mergeWallets, reverseWalletTransaction, updateWalletStatus, updateWalletLimits,
  } = useWalletPromotionStore();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<WalletStatus | 'all'>('all');
  const [branch, setBranch] = useState<Branch | 'all'>('all');
  const [minimumBalance, setMinimumBalance] = useState('');
  const [maximumBalance, setMaximumBalance] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creditTarget, setCreditTarget] = useState<WalletCustomer | null>(null);
  const [creditStep, setCreditStep] = useState<1 | 2>(1);
  const [profile, setProfile] = useState<WalletCustomer | null>(null);
  const [editTarget, setEditTarget] = useState<WalletCustomer | null>(null);
  const [limitsTarget, setLimitsTarget] = useState<WalletCustomer | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<WalletCustomer | null>(null);
  const [mergeTarget, setMergeTarget] = useState<WalletCustomer | null>(null);
  const [reverseTarget, setReverseTarget] = useState<WalletTransaction | null>(null);
  const [receipt, setReceipt] = useState<{ wallet: WalletCustomer; transaction: WalletTransaction } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const [walletForm, setWalletForm] = useState(emptyCustomerForm());
  const [editReason, setEditReason] = useState('Customer profile updated by Admin');
  const [creditForm, setCreditForm] = useState({ amount: '', paymentMode: 'cash' as WalletPaymentMode, referenceNumber: '', description: '', promotionalBonus: '', promotionalExpiryDate: '', branch: 'Cafe' as Branch, notes: '' });
  const [limitForm, setLimitForm] = useState({ transactionLimit: '', dailyLimit: '', highValueAuthorizationLimit: '', deductionPriority: 'promotional_first' as WalletDeductionPriority });
  const [adjustForm, setAdjustForm] = useState({ mode: 'deduct' as 'deduct' | 'add', paidAmount: '', promotionalAmount: '', promotionalExpiryDate: '', branch: 'Cafe' as Branch, reason: '', adminPin: '' });
  const [mergeForm, setMergeForm] = useState({ targetWalletId: '', reason: '', adminPin: '' });
  const [reverseForm, setReverseForm] = useState({ reason: '', adminPin: '' });
  const [statusForm, setStatusForm] = useState({ target: null as WalletCustomer | null, reason: '', adminPin: '' });

  useEffect(() => { void loadWallets(); }, [loadWallets]);
  useEffect(() => {
    let active = true;
    if (!profile) { setQrDataUrl(''); return () => { active = false; }; }
    void QRCode.toDataURL(`CAFE-AADVIKAM-WALLET:${profile.walletNumber}`, { width: 220, margin: 1 }).then((url) => { if (active) setQrDataUrl(url); }).catch(() => { if (active) setQrDataUrl(''); });
    return () => { active = false; };
  }, [profile]);

  const filtered = useMemo(() => wallets.filter((wallet) => {
    const normalized = query.trim().toLowerCase();
    const queryMatch = !normalized || wallet.customerName.toLowerCase().includes(normalized) || wallet.mobile.includes(normalized) || wallet.walletNumber.toLowerCase().includes(normalized);
    const updatedDay = wallet.updatedAt.slice(0, 10);
    return queryMatch && (status === 'all' || wallet.status === status) && (branch === 'all' || wallet.preferredBranch === branch)
      && (!minimumBalance || wallet.totalBalance >= Number(minimumBalance)) && (!maximumBalance || wallet.totalBalance <= Number(maximumBalance))
      && (!dateFrom || updatedDay >= dateFrom) && (!dateTo || updatedDay <= dateTo);
  }), [wallets, query, status, branch, minimumBalance, maximumBalance, dateFrom, dateTo]);

  const summary = useMemo(() => {
    const todayKey = today();
    const completed = walletTransactions.filter((transaction) => transaction.status === 'completed');
    return {
      customers: wallets.length,
      balance: wallets.reduce((sum, wallet) => sum + wallet.totalBalance, 0),
      credited: completed.filter((transaction) => ['credit', 'cashback', 'adjustment'].includes(transaction.transactionType) && transaction.newPaidBalance + transaction.newPromotionalBalance >= transaction.previousPaidBalance + transaction.previousPromotionalBalance).reduce((sum, transaction) => sum + transaction.amount, 0),
      spent: completed.filter((transaction) => transaction.transactionType === 'debit').reduce((sum, transaction) => sum + transaction.amount, 0),
      creditsToday: completed.filter((transaction) => transaction.createdAt.slice(0, 10) === todayKey && ['credit', 'cashback'].includes(transaction.transactionType)).reduce((sum, transaction) => sum + transaction.amount, 0),
      purchasesToday: completed.filter((transaction) => transaction.createdAt.slice(0, 10) === todayKey && transaction.transactionType === 'debit').reduce((sum, transaction) => sum + transaction.amount, 0),
      expired: completed.filter((transaction) => transaction.transactionType === 'expiry').reduce((sum, transaction) => sum + transaction.amount, 0),
      suspended: wallets.filter((wallet) => wallet.status === 'suspended').length,
    };
  }, [wallets, walletTransactions]);

  const transactionsFor = (wallet: WalletCustomer) => walletTransactions.filter((row) => row.walletId === wallet.id);
  const resetFeedback = () => { setFormError(''); setMessage(''); };

  const submitWallet = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setFormError('');
    try {
      const created = await createWallet({ ...walletForm, openingBalance: Number(walletForm.openingBalance || 0) });
      setShowCreate(false); setMessage(`Wallet ${created.walletNumber} created for ${created.customerName}.`); setWalletForm(emptyCustomerForm());
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Could not create wallet.'); }
    finally { setSaving(false); }
  };

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editTarget) return; setSaving(true); setFormError('');
    try {
      const updated = await updateWalletCustomer(editTarget.id, { ...walletForm, preferredBranch: walletForm.preferredBranch, reason: editReason });
      setEditTarget(null); setWalletForm(emptyCustomerForm()); setProfile(updated); setMessage('Customer details updated and audited.');
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Could not update customer details.'); }
    finally { setSaving(false); }
  };

  const submitCredit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!creditTarget) return;
    if (creditStep === 1) { setFormError(''); setCreditStep(2); return; }
    setSaving(true); setFormError('');
    try {
      const transaction = await creditWallet({
        walletId: creditTarget.id, amount: Number(creditForm.amount || 0), promotionalBonus: Number(creditForm.promotionalBonus || 0),
        paymentMode: creditForm.paymentMode, referenceNumber: creditForm.referenceNumber, description: creditForm.description,
        promotionalExpiryDate: creditForm.promotionalExpiryDate || undefined, branch: creditForm.branch, notes: creditForm.notes,
        idempotencyKey: `wallet-credit:${creditTarget.id}:${crypto.randomUUID()}`,
      });
      const refreshed = useWalletPromotionStore.getState().wallets.find((wallet) => wallet.id === creditTarget.id) || creditTarget;
      setReceipt({ wallet: refreshed, transaction }); setCreditTarget(null); setCreditStep(1);
      setMessage(`Wallet credited successfully. Transaction ${transaction.id.slice(0, 8).toUpperCase()}.`);
      setCreditForm({ amount: '', paymentMode: 'cash', referenceNumber: '', description: '', promotionalBonus: '', promotionalExpiryDate: '', branch: 'Cafe', notes: '' });
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Could not credit wallet.'); }
    finally { setSaving(false); }
  };

  const submitLimits = async (event: React.FormEvent) => {
    event.preventDefault(); if (!limitsTarget) return; setSaving(true); setFormError('');
    try {
      await updateWalletLimits(limitsTarget.id, limitForm.transactionLimit ? Number(limitForm.transactionLimit) : null, limitForm.dailyLimit ? Number(limitForm.dailyLimit) : null, limitForm.deductionPriority, limitForm.highValueAuthorizationLimit ? Number(limitForm.highValueAuthorizationLimit) : null);
      setLimitsTarget(null); setMessage('Wallet limits and deduction priority updated.');
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Could not update wallet limits.'); }
    finally { setSaving(false); }
  };

  const submitAdjustment = async (event: React.FormEvent) => {
    event.preventDefault(); if (!adjustTarget) return; setSaving(true); setFormError('');
    const sign = adjustForm.mode === 'deduct' ? -1 : 1;
    try {
      const transaction = await adjustWalletBalance({
        walletId: adjustTarget.id, paidDelta: sign * Number(adjustForm.paidAmount || 0), promotionalDelta: sign * Number(adjustForm.promotionalAmount || 0),
        reason: adjustForm.reason, adminPin: adjustForm.adminPin, branch: adjustForm.branch,
        promotionalExpiryDate: adjustForm.promotionalExpiryDate || undefined, idempotencyKey: `wallet-adjustment:${adjustTarget.id}:${crypto.randomUUID()}`,
      });
      setAdjustTarget(null); setMessage(`Authorized wallet adjustment recorded as ${transaction.id.slice(0, 8).toUpperCase()}.`);
      setAdjustForm({ mode: 'deduct', paidAmount: '', promotionalAmount: '', promotionalExpiryDate: '', branch: 'Cafe', reason: '', adminPin: '' });
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Could not adjust wallet balance.'); }
    finally { setSaving(false); }
  };

  const submitMerge = async (event: React.FormEvent) => {
    event.preventDefault(); if (!mergeTarget) return; setSaving(true); setFormError('');
    try {
      const target = await mergeWallets(mergeTarget.id, mergeForm.targetWalletId, mergeForm.reason, mergeForm.adminPin);
      setMergeTarget(null); setProfile(target); setMessage(`Wallet merged into ${target.walletNumber}. The source wallet is closed and fully audited.`);
      setMergeForm({ targetWalletId: '', reason: '', adminPin: '' });
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Could not merge wallets.'); }
    finally { setSaving(false); }
  };

  const submitReversal = async (event: React.FormEvent) => {
    event.preventDefault(); if (!reverseTarget) return; setSaving(true); setFormError('');
    try {
      const transaction = await reverseWalletTransaction(reverseTarget.id, reverseForm.reason, reverseForm.adminPin);
      setReverseTarget(null); setMessage(`Reversal completed as transaction ${transaction.id.slice(0, 8).toUpperCase()}.`);
      setReverseForm({ reason: '', adminPin: '' });
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Could not reverse transaction.'); }
    finally { setSaving(false); }
  };

  const submitStatus = async (event: React.FormEvent) => {
    event.preventDefault(); if (!statusForm.target) return; setSaving(true); setFormError('');
    const nextStatus: WalletStatus = statusForm.target.status === 'active' ? 'suspended' : 'active';
    try {
      await updateWalletStatus(statusForm.target.id, nextStatus, statusForm.reason, statusForm.adminPin || undefined);
      setStatusForm({ target: null, reason: '', adminPin: '' }); setProfile(null); setMessage(`Wallet ${nextStatus === 'active' ? 'reactivated' : 'suspended'} successfully.`);
    } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Status update failed.'); }
    finally { setSaving(false); }
  };

  const exportRows = () => downloadCsv(`wallet-report-${today()}.csv`, filtered.map((wallet) => ({
    'Wallet No': wallet.walletNumber, Customer: wallet.customerName, Mobile: wallet.mobile, Type: wallet.customerType,
    Branch: wallet.preferredBranch || '', Status: wallet.status, 'Paid Balance': wallet.paidBalance, 'Promotional Balance': wallet.promotionalBalance,
    'Total Balance': wallet.totalBalance, 'Lifetime Credits': wallet.lifetimeCredits, 'Lifetime Spend': wallet.lifetimeSpend,
    'Total Purchases': wallet.totalPurchases, 'Last Purchase': wallet.lastPurchaseAt || '', 'Last Recharge': wallet.lastRechargeAt || '',
  })));

  const exportStatement = (wallet: WalletCustomer) => downloadCsv(`${wallet.walletNumber}-statement-${today()}.csv`, transactionsFor(wallet).map((row) => ({
    Date: dateText(row.createdAt), Type: row.transactionType, Branch: row.branch || '', Bill: row.billNumber || '', Reference: row.referenceNumber || '',
    Amount: row.amount, 'Paid Bucket': row.paidAmount, 'Promotional Bucket': row.promotionalAmount, 'Previous Balance': row.previousPaidBalance + row.previousPromotionalBalance,
    'New Balance': row.newPaidBalance + row.newPromotionalBalance, Status: row.status, Description: row.description || '',
  })));

  const printWalletReport = () => {
    const popup = window.open('', '_blank', 'width=1000,height=720'); if (!popup) return;
    popup.document.write(`<html><head><title>Wallet Report</title><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:8px;border:1px solid #ddd;text-align:left}h1{margin:0}small{color:#555}</style></head><body><h1>Customer Wallet Report</h1><small>${escapeHtml(new Date().toLocaleString('en-IN'))}</small><table><thead><tr><th>Wallet</th><th>Customer</th><th>Mobile</th><th>Status</th><th>Paid</th><th>Promo</th><th>Total</th></tr></thead><tbody>${filtered.map((wallet) => `<tr><td>${escapeHtml(wallet.walletNumber)}</td><td>${escapeHtml(wallet.customerName)}</td><td>${escapeHtml(wallet.mobile)}</td><td>${escapeHtml(wallet.status)}</td><td>${wallet.paidBalance.toFixed(2)}</td><td>${wallet.promotionalBalance.toFixed(2)}</td><td>${wallet.totalBalance.toFixed(2)}</td></tr>`).join('')}</tbody></table></body></html>`); popup.document.close(); popup.print();
  };

  const printStatement = (wallet: WalletCustomer) => {
    const rows = transactionsFor(wallet);
    const popup = window.open('', '_blank', 'width=1000,height=720'); if (!popup) return;
    popup.document.write(`<html><head><title>${escapeHtml(wallet.walletNumber)} Statement</title><style>body{font-family:Arial;padding:24px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.card{border:1px solid #ddd;padding:12px;border-radius:10px}table{width:100%;border-collapse:collapse}th,td{padding:7px;border:1px solid #ddd;text-align:left;font-size:12px}h1,h2,p{margin:0 0 6px}</style></head><body><h1>Cafe Aadvikam Wallet Statement</h1><p>${escapeHtml(wallet.customerName)} · ${escapeHtml(wallet.walletNumber)} · ${escapeHtml(wallet.mobile)}</p><p>Generated ${escapeHtml(new Date().toLocaleString('en-IN'))}</p><div class="grid"><div class="card"><b>Paid</b><br>₹${wallet.paidBalance.toFixed(2)}</div><div class="card"><b>Promotional</b><br>₹${wallet.promotionalBalance.toFixed(2)}</div><div class="card"><b>Available</b><br>₹${wallet.totalBalance.toFixed(2)}</div></div><table><thead><tr><th>Date</th><th>Type</th><th>Bill/Reference</th><th>Paid</th><th>Promo</th><th>Amount</th><th>Balance</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(dateText(row.createdAt))}</td><td>${escapeHtml(row.transactionType)}</td><td>${escapeHtml(row.billNumber || row.referenceNumber || '—')}</td><td>₹${row.paidAmount.toFixed(2)}</td><td>₹${row.promotionalAmount.toFixed(2)}</td><td>₹${row.amount.toFixed(2)}</td><td>₹${(row.newPaidBalance + row.newPromotionalBalance).toFixed(2)}</td></tr>`).join('')}</tbody></table></body></html>`); popup.document.close(); popup.print();
  };

  const printReceipt = () => {
    if (!receipt) return; const { wallet, transaction } = receipt;
    const popup = window.open('', '_blank', 'width=520,height=720'); if (!popup) return;
    popup.document.write(`<html><head><title>Wallet Receipt</title><style>body{font-family:Arial;padding:24px}.line{display:flex;justify-content:space-between;border-bottom:1px dashed #bbb;padding:9px 0}h2,p{text-align:center}small{color:#555}</style></head><body><h2>Cafe Aadvikam</h2><p>Wallet Credit Receipt</p><div class="line"><span>Transaction</span><b>${escapeHtml(transaction.id.slice(0, 8).toUpperCase())}</b></div><div class="line"><span>Customer</span><b>${escapeHtml(wallet.customerName)}</b></div><div class="line"><span>Wallet</span><b>${escapeHtml(wallet.walletNumber)}</b></div><div class="line"><span>Previous balance</span><b>₹${(transaction.previousPaidBalance + transaction.previousPromotionalBalance).toFixed(2)}</b></div><div class="line"><span>Paid credit</span><b>₹${transaction.paidAmount.toFixed(2)}</b></div><div class="line"><span>Promotional credit</span><b>₹${transaction.promotionalAmount.toFixed(2)}</b></div><div class="line"><span>New balance</span><b>₹${(transaction.newPaidBalance + transaction.newPromotionalBalance).toFixed(2)}</b></div><p><small>${escapeHtml(dateText(transaction.createdAt))}</small></p></body></html>`); popup.document.close(); popup.print();
  };

  const shareReceipt = (channel: 'whatsapp' | 'sms') => {
    if (!receipt) return;
    const { wallet, transaction } = receipt;
    const body = `Cafe Aadvikam wallet receipt\n${wallet.customerName} · ${wallet.walletNumber}\nCredited: ${formatCurrency(transaction.amount)}\nNew balance: ${formatCurrency(transaction.newPaidBalance + transaction.newPromotionalBalance)}\nTransaction: ${transaction.id.slice(0, 8).toUpperCase()}`;
    const phone = wallet.mobile.replace(/\D/g, '').slice(-10);
    window.open(channel === 'whatsapp' ? `https://wa.me/91${phone}?text=${encodeURIComponent(body)}` : `sms:${phone}?body=${encodeURIComponent(body)}`, '_blank');
  };

  const openEdit = (wallet: WalletCustomer) => { setProfile(null); resetFeedback(); setWalletForm(customerFormFromWallet(wallet)); setEditReason('Customer profile updated by Admin'); setEditTarget(wallet); };
  const openCredit = (wallet: WalletCustomer, promotionalOnly = false) => { setProfile(null); resetFeedback(); setCreditStep(1); setCreditForm({ amount: promotionalOnly ? '0' : '', paymentMode: promotionalOnly ? 'promotional_credit' : 'cash', referenceNumber: '', description: promotionalOnly ? 'Promotional credit' : '', promotionalBonus: '', promotionalExpiryDate: '', branch: (wallet.preferredBranch || 'Cafe') as Branch, notes: '' }); setCreditTarget(wallet); };
  const openLimits = (wallet: WalletCustomer) => { setProfile(null); resetFeedback(); setLimitForm({ transactionLimit: wallet.transactionLimit?.toString() || '', dailyLimit: wallet.dailyLimit?.toString() || '', highValueAuthorizationLimit: wallet.highValueAuthorizationLimit?.toString() || '', deductionPriority: wallet.deductionPriority }); setLimitsTarget(wallet); };

  return <div className="space-y-5">
    {message && <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Dismiss"><X className="size-4" /></button></div>}
    {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"><AlertTriangle className="mr-2 inline size-4" />{error}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Wallet customers" value={summary.customers.toLocaleString('en-IN')} icon={<UserRound className="size-5" />} />
      <Kpi label="Active wallet balance" value={formatCurrency(summary.balance)} icon={<WalletCards className="size-5" />} note="Paid and promotional buckets" />
      <Kpi label="Total credited" value={formatCurrency(summary.credited)} icon={<Banknote className="size-5" />} />
      <Kpi label="Total spent" value={formatCurrency(summary.spent)} icon={<IndianRupee className="size-5" />} />
      <Kpi label="Credits today" value={formatCurrency(summary.creditsToday)} icon={<CalendarDays className="size-5" />} />
      <Kpi label="Wallet purchases today" value={formatCurrency(summary.purchasesToday)} icon={<Smartphone className="size-5" />} />
      <Kpi label="Expired promotional" value={formatCurrency(summary.expired)} icon={<Gift className="size-5" />} />
      <Kpi label="Suspended wallets" value={summary.suspended.toLocaleString('en-IN')} icon={<ShieldCheck className="size-5" />} />
    </div>

    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div><h3 className="font-display text-lg font-black text-slate-950">Wallet customers</h3><p className="text-xs text-slate-500">Create, credit, adjust, merge, audit and export prepaid wallets.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void loadWallets(true)} disabled={loadingWallets} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><RefreshCw className={`size-3.5 ${loadingWallets ? 'animate-spin' : ''}`} />Refresh</button>
          <button onClick={exportRows} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><Download className="size-3.5" />CSV</button>
          <button onClick={printWalletReport} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><Printer className="size-3.5" />Print</button>
          <button onClick={() => { resetFeedback(); setWalletForm(emptyCustomerForm()); setShowCreate(true); }} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><Plus className="size-3.5" />Create wallet</button>
        </div>
      </div>
      <div className="grid gap-2 border-b border-slate-100 p-4 md:grid-cols-4 xl:grid-cols-8">
        <label className="relative md:col-span-2"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, mobile or wallet ID" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value as WalletStatus | 'all')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="closed">Closed</option></select>
        <select value={branch} onChange={(event) => setBranch(event.target.value as Branch | 'all')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold"><option value="all">All branches</option>{BRANCHES.map((item) => <option key={item}>{item}</option>)}</select>
        <input type="number" min="0" value={minimumBalance} onChange={(event) => setMinimumBalance(event.target.value)} placeholder="Min balance" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <input type="number" min="0" value={maximumBalance} onChange={(event) => setMaximumBalance(event.target.value)} placeholder="Max balance" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        <label className="text-[10px] font-black text-slate-500">Updated from<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-xs" /></label>
        <label className="text-[10px] font-black text-slate-500">Updated to<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-2 py-2 text-xs" /></label>
      </div>
      <div className="max-h-[58vh] overflow-auto">
        <table className="w-full min-w-[1120px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr>{['Customer', 'Wallet ID', 'Type', 'Branch', 'Paid', 'Promotional', 'Available', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{filtered.map((wallet) => <tr key={wallet.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><p className="font-black text-slate-900">{wallet.customerName}</p><p className="text-xs text-slate-500">{wallet.mobile}</p></td><td className="px-4 py-3 font-mono text-xs font-bold">{wallet.walletNumber}</td><td className="px-4 py-3">{wallet.customerType}</td><td className="px-4 py-3">{wallet.preferredBranch || '—'}</td><td className="px-4 py-3 font-bold">{formatCurrency(wallet.paidBalance)}</td><td className="px-4 py-3 font-bold text-purple-700">{formatCurrency(wallet.promotionalBalance)}</td><td className="px-4 py-3 font-black text-emerald-700">{formatCurrency(wallet.totalBalance)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${wallet.status === 'active' ? 'bg-emerald-100 text-emerald-800' : wallet.status === 'suspended' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>{wallet.status}</span></td><td className="px-4 py-3"><div className="flex gap-1"><button onClick={() => setProfile(wallet)} className="rounded-lg border p-2" title="View profile"><Eye className="size-3.5" /></button><button onClick={() => openCredit(wallet)} disabled={wallet.status === 'closed'} className="rounded-lg bg-emerald-600 p-2 text-white disabled:opacity-40" title="Add money"><Plus className="size-3.5" /></button><button onClick={() => openLimits(wallet)} disabled={wallet.status === 'closed'} className="rounded-lg border p-2 disabled:opacity-40" title="Limits"><Settings2 className="size-3.5" /></button></div></td></tr>)}</tbody>
        </table>
        {!loadingWallets && filtered.length === 0 && <div className="p-12 text-center text-sm font-bold text-slate-500">No wallets match the selected filters.</div>}
        {loadingWallets && <div className="flex items-center justify-center gap-2 p-12 text-sm font-bold text-slate-500"><Loader2 className="size-4 animate-spin" />Loading wallets…</div>}
      </div>
    </section>

    {showCreate && <Modal title="Create customer wallet" subtitle="Existing customers are matched by mobile number; duplicate wallets are blocked." onClose={() => setShowCreate(false)}>
      <CustomerForm form={walletForm} setForm={setWalletForm} includeOpeningBalance includeStatus />
      <form onSubmit={submitWallet} className="mt-3"><FormError text={formError} /><div className="flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button><button disabled={saving || !walletForm.customerName.trim() || !walletForm.mobile.trim()} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create wallet'}</button></div></form>
    </Modal>}

    {editTarget && <Modal title={`Update customer · ${editTarget.customerName}`} subtitle="Changes update the linked customer and create a complete audit record." onClose={() => setEditTarget(null)}>
      <form onSubmit={submitEdit}><CustomerForm form={walletForm} setForm={setWalletForm} /><input required value={editReason} onChange={(event) => setEditReason(event.target.value)} placeholder="Reason for update *" className="mt-3 w-full rounded-xl border p-3" /><FormError text={formError} /><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setEditTarget(null)} className="rounded-xl border px-4 py-2 text-sm font-bold">Cancel</button><button disabled={saving} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save customer details'}</button></div></form>
    </Modal>}

    {creditTarget && <Modal title={`Add money · ${creditTarget.customerName}`} subtitle={`Paid ${formatCurrency(creditTarget.paidBalance)} · Promotional ${formatCurrency(creditTarget.promotionalBalance)} · Available ${formatCurrency(creditTarget.totalBalance)}`} onClose={() => setCreditTarget(null)}>
      <form onSubmit={submitCredit} className="grid gap-3 sm:grid-cols-2">
        {creditStep === 1 ? <>
          <input type="number" min="0" step="0.01" value={creditForm.amount} onChange={(event) => { setCreditStep(1); setCreditForm({ ...creditForm, amount: event.target.value }); }} placeholder="Paid amount" className="rounded-xl border p-3" />
          <select value={creditForm.paymentMode} onChange={(event) => setCreditForm({ ...creditForm, paymentMode: event.target.value as WalletPaymentMode })} className="rounded-xl border p-3">{paymentModes.map((mode) => <option value={mode.value} key={mode.value}>{mode.label}</option>)}</select>
          <input value={creditForm.referenceNumber} onChange={(event) => setCreditForm({ ...creditForm, referenceNumber: event.target.value })} placeholder="Transaction reference" className="rounded-xl border p-3" />
          <select value={creditForm.branch} onChange={(event) => setCreditForm({ ...creditForm, branch: event.target.value as Branch })} className="rounded-xl border p-3">{BRANCHES.map((item) => <option key={item}>{item}</option>)}</select>
          <input type="number" min="0" step="0.01" value={creditForm.promotionalBonus} onChange={(event) => setCreditForm({ ...creditForm, promotionalBonus: event.target.value })} placeholder="Optional promotional bonus" className="rounded-xl border p-3" />
          <label className="text-xs font-bold text-slate-600">Promotional expiry<input type="date" min={today()} value={creditForm.promotionalExpiryDate} onChange={(event) => setCreditForm({ ...creditForm, promotionalExpiryDate: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label>
          <input value={creditForm.description} onChange={(event) => setCreditForm({ ...creditForm, description: event.target.value })} placeholder="Description" className="rounded-xl border p-3 sm:col-span-2" />
          <textarea value={creditForm.notes} onChange={(event) => setCreditForm({ ...creditForm, notes: event.target.value })} placeholder="Notes" className="rounded-xl border p-3 sm:col-span-2" />
        </> : <div className="space-y-3 sm:col-span-2"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-black text-emerald-900">Confirm wallet credit</p><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><p>Previous balance <b>{formatCurrency(creditTarget.totalBalance)}</b></p><p>Paid credit <b>{formatCurrency(Number(creditForm.amount || 0))}</b></p><p>Promotional credit <b>{formatCurrency(Number(creditForm.promotionalBonus || 0))}</b></p><p>New balance <b>{formatCurrency(creditTarget.totalBalance + Number(creditForm.amount || 0) + Number(creditForm.promotionalBonus || 0))}</b></p><p>Payment mode <b>{paymentModes.find((mode) => mode.value === creditForm.paymentMode)?.label}</b></p><p>Branch <b>{creditForm.branch}</b></p></div></div><p className="text-xs text-slate-500">A completed credit cannot be edited or deleted. Corrections require an authorized reversal transaction.</p></div>}
        <FormError text={formError} className="sm:col-span-2" />
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => creditStep === 2 ? setCreditStep(1) : setCreditTarget(null)} className="rounded-xl border px-4 py-2 text-sm font-bold">{creditStep === 2 ? 'Back' : 'Cancel'}</button><button disabled={saving || (Number(creditForm.amount || 0) <= 0 && Number(creditForm.promotionalBonus || 0) <= 0)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">{saving ? 'Saving…' : creditStep === 1 ? 'Review credit' : 'Confirm and credit'}</button></div>
      </form>
    </Modal>}

    {limitsTarget && <Modal title={`Wallet limits · ${limitsTarget.customerName}`} subtitle="Configure safe single-use, daily-use and balance-bucket deduction rules." onClose={() => setLimitsTarget(null)}>
      <form onSubmit={submitLimits} className="grid gap-3 sm:grid-cols-2"><input type="number" min="0" step="0.01" value={limitForm.transactionLimit} onChange={(event) => setLimitForm({ ...limitForm, transactionLimit: event.target.value })} placeholder="Single transaction limit" className="rounded-xl border p-3" /><input type="number" min="0" step="0.01" value={limitForm.dailyLimit} onChange={(event) => setLimitForm({ ...limitForm, dailyLimit: event.target.value })} placeholder="Daily wallet limit" className="rounded-xl border p-3" /><input type="number" min="0" step="0.01" value={limitForm.highValueAuthorizationLimit} onChange={(event) => setLimitForm({ ...limitForm, highValueAuthorizationLimit: event.target.value })} placeholder="Require Admin/Owner password from amount" className="rounded-xl border p-3 sm:col-span-2" /><select value={limitForm.deductionPriority} onChange={(event) => setLimitForm({ ...limitForm, deductionPriority: event.target.value as WalletDeductionPriority })} className="rounded-xl border p-3 sm:col-span-2">{priorities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><FormError text={formError} className="sm:col-span-2" /><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setLimitsTarget(null)} className="rounded-xl border px-4 py-2 font-bold">Cancel</button><button disabled={saving} className="rounded-xl bg-slate-950 px-4 py-2 font-black text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save limits'}</button></div></form>
    </Modal>}

    {adjustTarget && <Modal title={`Authorized adjustment · ${adjustTarget.customerName}`} subtitle="Use this only for approved balance corrections or a direct wallet-balance refund." onClose={() => setAdjustTarget(null)}>
      <form onSubmit={submitAdjustment} className="grid gap-3 sm:grid-cols-2"><select value={adjustForm.mode} onChange={(event) => setAdjustForm({ ...adjustForm, mode: event.target.value as 'deduct' | 'add' })} className="rounded-xl border p-3 sm:col-span-2"><option value="deduct">Deduct / refund wallet balance</option><option value="add">Authorized positive adjustment</option></select><input type="number" min="0" step="0.01" value={adjustForm.paidAmount} onChange={(event) => setAdjustForm({ ...adjustForm, paidAmount: event.target.value })} placeholder="Paid balance amount" className="rounded-xl border p-3" /><input type="number" min="0" step="0.01" value={adjustForm.promotionalAmount} onChange={(event) => setAdjustForm({ ...adjustForm, promotionalAmount: event.target.value })} placeholder="Promotional balance amount" className="rounded-xl border p-3" /><select value={adjustForm.branch} onChange={(event) => setAdjustForm({ ...adjustForm, branch: event.target.value as Branch })} className="rounded-xl border p-3">{BRANCHES.map((item) => <option key={item}>{item}</option>)}</select><label className="text-xs font-bold">Promotional expiry for positive adjustment<input type="date" min={today()} disabled={adjustForm.mode === 'deduct'} value={adjustForm.promotionalExpiryDate} onChange={(event) => setAdjustForm({ ...adjustForm, promotionalExpiryDate: event.target.value })} className="mt-1 w-full rounded-xl border p-3 disabled:bg-slate-100" /></label><textarea required value={adjustForm.reason} onChange={(event) => setAdjustForm({ ...adjustForm, reason: event.target.value })} placeholder="Authorization reason *" className="rounded-xl border p-3 sm:col-span-2" /><input required type="password" value={adjustForm.adminPin} onChange={(event) => setAdjustForm({ ...adjustForm, adminPin: event.target.value })} placeholder="Current Admin/Owner password *" className="rounded-xl border p-3 sm:col-span-2" /><div className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800 sm:col-span-2"><LockKeyhole className="mr-1 inline size-4" />The server verifies your current credential and writes old/new balances, reason, user and session audit data.</div><FormError text={formError} className="sm:col-span-2" /><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setAdjustTarget(null)} className="rounded-xl border px-4 py-2 font-bold">Cancel</button><button disabled={saving || (!Number(adjustForm.paidAmount || 0) && !Number(adjustForm.promotionalAmount || 0))} className="rounded-xl bg-amber-600 px-4 py-2 font-black text-white disabled:opacity-50">{saving ? 'Authorizing…' : 'Authorize adjustment'}</button></div></form>
    </Modal>}

    {mergeTarget && <Modal title={`Merge duplicate wallet · ${mergeTarget.customerName}`} subtitle="Transfers available buckets to the selected wallet and permanently closes this source wallet." onClose={() => setMergeTarget(null)}>
      <form onSubmit={submitMerge} className="space-y-3"><select required value={mergeForm.targetWalletId} onChange={(event) => setMergeForm({ ...mergeForm, targetWalletId: event.target.value })} className="w-full rounded-xl border p-3"><option value="">Select destination wallet</option>{wallets.filter((wallet) => wallet.id !== mergeTarget.id && wallet.status !== 'closed').map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.walletNumber} · {wallet.customerName} · {wallet.mobile} · {formatCurrency(wallet.totalBalance)}</option>)}</select><textarea required value={mergeForm.reason} onChange={(event) => setMergeForm({ ...mergeForm, reason: event.target.value })} placeholder="Reason for merge *" className="w-full rounded-xl border p-3" /><input required type="password" value={mergeForm.adminPin} onChange={(event) => setMergeForm({ ...mergeForm, adminPin: event.target.value })} placeholder="Current Admin/Owner password *" className="w-full rounded-xl border p-3" /><div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">This is an audited high-value action. The source wallet cannot be used after merge.</div><FormError text={formError} /><div className="flex justify-end gap-2"><button type="button" onClick={() => setMergeTarget(null)} className="rounded-xl border px-4 py-2 font-bold">Cancel</button><button disabled={saving || !mergeForm.targetWalletId} className="rounded-xl bg-red-600 px-4 py-2 font-black text-white disabled:opacity-50">{saving ? 'Merging…' : 'Merge wallet'}</button></div></form>
    </Modal>}

    {reverseTarget && <Modal title="Reverse completed transaction" subtitle={`${reverseTarget.id.slice(0, 8).toUpperCase()} · ${formatCurrency(reverseTarget.amount)} · ${dateText(reverseTarget.createdAt)}`} onClose={() => setReverseTarget(null)}>
      <form onSubmit={submitReversal} className="space-y-3"><textarea required value={reverseForm.reason} onChange={(event) => setReverseForm({ ...reverseForm, reason: event.target.value })} placeholder="Reversal reason *" className="w-full rounded-xl border p-3" /><input required type="password" value={reverseForm.adminPin} onChange={(event) => setReverseForm({ ...reverseForm, adminPin: event.target.value })} placeholder="Current Admin/Owner password *" className="w-full rounded-xl border p-3" /><div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">The original record remains immutable and is linked to a separate reversal/refund transaction.</div><FormError text={formError} /><div className="flex justify-end gap-2"><button type="button" onClick={() => setReverseTarget(null)} className="rounded-xl border px-4 py-2 font-bold">Cancel</button><button disabled={saving} className="rounded-xl bg-red-600 px-4 py-2 font-black text-white disabled:opacity-50">{saving ? 'Authorizing…' : 'Authorize reversal'}</button></div></form>
    </Modal>}

    {statusForm.target && <Modal title={statusForm.target.status === 'active' ? 'Suspend wallet' : 'Reactivate wallet'} subtitle={`${statusForm.target.walletNumber} · ${statusForm.target.customerName}`} onClose={() => setStatusForm({ target: null, reason: '', adminPin: '' })}>
      <form onSubmit={submitStatus} className="space-y-3"><textarea required value={statusForm.reason} onChange={(event) => setStatusForm({ ...statusForm, reason: event.target.value })} placeholder="Reason *" className="w-full rounded-xl border p-3" />{statusForm.target.status !== 'active' && <input required type="password" value={statusForm.adminPin} onChange={(event) => setStatusForm({ ...statusForm, adminPin: event.target.value })} placeholder="Current Admin/Owner password *" className="w-full rounded-xl border p-3" />}<FormError text={formError} /><div className="flex justify-end gap-2"><button type="button" onClick={() => setStatusForm({ target: null, reason: '', adminPin: '' })} className="rounded-xl border px-4 py-2 font-bold">Cancel</button><button disabled={saving} className={`rounded-xl px-4 py-2 font-black text-white disabled:opacity-50 ${statusForm.target.status === 'active' ? 'bg-red-600' : 'bg-emerald-600'}`}>{saving ? 'Saving…' : statusForm.target.status === 'active' ? 'Suspend wallet' : 'Reactivate wallet'}</button></div></form>
    </Modal>}

    {profile && <Modal title={profile.customerName} subtitle={`${profile.walletNumber} · ${profile.mobile}`} onClose={() => setProfile(null)} wide>
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]"><div><div className="grid gap-3 sm:grid-cols-3"><Kpi label="Paid balance" value={formatCurrency(profile.paidBalance)} icon={<Banknote className="size-5" />} /><Kpi label="Promotional balance" value={formatCurrency(profile.promotionalBalance)} icon={<Gift className="size-5" />} /><Kpi label="Total available" value={formatCurrency(profile.totalBalance)} icon={<WalletCards className="size-5" />} /></div><div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3"><p><b>Customer type:</b> {profile.customerType}</p><p><b>Preferred branch:</b> {profile.preferredBranch || '—'}</p><p><b>Status:</b> {profile.status}</p><p><b>Lifetime credits:</b> {formatCurrency(profile.lifetimeCredits)}</p><p><b>Lifetime spending:</b> {formatCurrency(profile.lifetimeSpend)}</p><p><b>Total purchases:</b> {profile.totalPurchases}</p><p><b>Average bill:</b> {formatCurrency(profile.totalPurchases ? profile.lifetimeSpend / profile.totalPurchases : 0)}</p><p><b>Last purchase:</b> {dateText(profile.lastPurchaseAt)}</p><p><b>Last recharge:</b> {dateText(profile.lastRechargeAt)}</p><p><b>Single limit:</b> {profile.transactionLimit == null ? 'No limit' : formatCurrency(profile.transactionLimit)}</p><p><b>Daily limit:</b> {profile.dailyLimit == null ? 'No limit' : formatCurrency(profile.dailyLimit)}</p><p><b>Supervisor authorization:</b> {profile.highValueAuthorizationLimit == null ? 'Not required' : `From ${formatCurrency(profile.highValueAuthorizationLimit)}`}</p><p><b>Deduction:</b> {priorities.find((item) => item.value === profile.deductionPriority)?.label}</p><p><b>Expiring promo:</b> {formatCurrency(profile.expiringPromotionalAmount || 0)}</p><p><b>Next expiry:</b> {dateText(profile.promotionalExpiryDate)}</p><p><b>Created:</b> {dateText(profile.createdAt)}</p></div></div><div className="flex flex-col items-center justify-center rounded-2xl border bg-white p-4">{qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${profile.walletNumber}`} className="size-44" /> : <QrCode className="size-20 text-slate-300" />}<p className="mt-2 text-center font-mono text-xs font-black">{profile.walletNumber}</p><p className="mt-1 text-center text-[10px] text-slate-500">Cashiers can scan this wallet identifier.</p></div></div>
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => openCredit(profile)} disabled={profile.status === 'closed'} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><Plus className="mr-1 inline size-3.5" />Add money</button><button onClick={() => openCredit(profile, true)} disabled={profile.status === 'closed'} className="rounded-xl bg-purple-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><Gift className="mr-1 inline size-3.5" />Promo credit</button><button onClick={() => { setAdjustForm({ mode: 'deduct', paidAmount: '', promotionalAmount: '', promotionalExpiryDate: '', branch: (profile.preferredBranch || 'Cafe') as Branch, reason: '', adminPin: '' }); setProfile(null); setAdjustTarget(profile); }} disabled={profile.status === 'closed'} className="rounded-xl border px-3 py-2 text-xs font-black disabled:opacity-40"><IndianRupee className="mr-1 inline size-3.5" />Adjustment / refund</button><button onClick={() => openEdit(profile)} disabled={profile.status === 'closed'} className="rounded-xl border px-3 py-2 text-xs font-black disabled:opacity-40"><Edit3 className="mr-1 inline size-3.5" />Edit customer</button><button onClick={() => openLimits(profile)} disabled={profile.status === 'closed'} className="rounded-xl border px-3 py-2 text-xs font-black disabled:opacity-40"><Settings2 className="mr-1 inline size-3.5" />Limits</button><button onClick={() => { setProfile(null); setMergeTarget(profile); setMergeForm({ targetWalletId: '', reason: '', adminPin: '' }); }} disabled={profile.status === 'closed'} className="rounded-xl border px-3 py-2 text-xs font-black disabled:opacity-40"><Merge className="mr-1 inline size-3.5" />Merge duplicate</button><button onClick={() => printStatement(profile)} className="rounded-xl border px-3 py-2 text-xs font-black"><Printer className="mr-1 inline size-3.5" />Print statement</button><button onClick={() => exportStatement(profile)} className="rounded-xl border px-3 py-2 text-xs font-black"><Download className="mr-1 inline size-3.5" />Export statement</button></div>
      <div className="mt-4"><h4 className="mb-2 flex items-center gap-2 font-black"><History className="size-4" />Transaction, purchase, refund and reversal history</h4><div className="max-h-80 overflow-auto rounded-2xl border"><table className="w-full min-w-[900px] text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-3">Transaction</th><th className="p-3">Bill / reference</th><th className="p-3">Branch</th><th className="p-3">Bucket split</th><th className="p-3">Previous → new</th><th className="p-3 text-right">Amount</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y">{transactionsFor(profile).slice(0, 200).map((row) => { const negative = row.transactionType === 'debit' || row.transactionType === 'expiry' || (row.transactionType === 'adjustment' && row.newPaidBalance + row.newPromotionalBalance < row.previousPaidBalance + row.previousPromotionalBalance); return <tr key={row.id}><td className="p-3"><p className="font-black capitalize">{row.transactionType}</p><p className="text-slate-500">{dateText(row.createdAt)}</p><p className="font-mono text-[10px] text-slate-400">{row.id.slice(0, 8).toUpperCase()}</p></td><td className="p-3">{row.billNumber || row.referenceNumber || '—'}</td><td className="p-3">{row.branch || '—'}</td><td className="p-3">Paid {formatCurrency(row.paidAmount)}<br />Promo {formatCurrency(row.promotionalAmount)}</td><td className="p-3">{formatCurrency(row.previousPaidBalance + row.previousPromotionalBalance)} → <b>{formatCurrency(row.newPaidBalance + row.newPromotionalBalance)}</b></td><td className={`p-3 text-right font-black ${negative ? 'text-red-600' : 'text-emerald-700'}`}>{negative ? '-' : '+'}{formatCurrency(row.amount)}</td><td className="p-3">{row.status === 'completed' && !['expiry', 'refund', 'reversal'].includes(row.transactionType) ? <button onClick={() => { setReverseForm({ reason: '', adminPin: '' }); setProfile(null); setReverseTarget(row); }} className="rounded-lg border p-2" title="Reverse transaction"><RotateCcw className="size-3.5" /></button> : <span className="text-[10px] font-bold uppercase text-slate-400">{row.status}</span>}</td></tr>; })}</tbody></table>{transactionsFor(profile).length === 0 && <div className="p-8 text-center text-sm text-slate-500">No wallet transactions yet.</div>}</div></div>
      <div className="mt-4 flex justify-end"><button onClick={() => { setFormError(''); setProfile(null); setStatusForm({ target: profile, reason: profile.status === 'active' ? 'Suspended by Admin' : 'Reactivated by Admin', adminPin: '' }); }} disabled={profile.status === 'closed'} className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-40 ${profile.status === 'active' ? 'bg-red-600' : 'bg-emerald-600'}`}>{profile.status === 'active' ? 'Suspend wallet' : 'Reactivate wallet'}</button></div>
    </Modal>}

    {receipt && <Modal title="Wallet receipt" subtitle="Credit completed successfully and cannot be silently edited or deleted." onClose={() => setReceipt(null)}>
      <div className="rounded-2xl border p-4"><div className="flex justify-between border-b py-2"><span>Customer</span><b>{receipt.wallet.customerName}</b></div><div className="flex justify-between border-b py-2"><span>Wallet</span><b>{receipt.wallet.walletNumber}</b></div><div className="flex justify-between border-b py-2"><span>Previous balance</span><b>{formatCurrency(receipt.transaction.previousPaidBalance + receipt.transaction.previousPromotionalBalance)}</b></div><div className="flex justify-between border-b py-2"><span>Paid credit</span><b>{formatCurrency(receipt.transaction.paidAmount)}</b></div><div className="flex justify-between border-b py-2"><span>Promotional credit</span><b>{formatCurrency(receipt.transaction.promotionalAmount)}</b></div><div className="flex justify-between py-2 text-lg"><span>New balance</span><b>{formatCurrency(receipt.transaction.newPaidBalance + receipt.transaction.newPromotionalBalance)}</b></div></div><div className="mt-4 flex flex-wrap justify-end gap-2"><button onClick={printReceipt} className="rounded-xl border px-4 py-2 text-sm font-black"><Printer className="mr-1 inline size-4" />Print</button><button onClick={() => shareReceipt('whatsapp')} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white"><MessageCircle className="mr-1 inline size-4" />WhatsApp</button><button onClick={() => shareReceipt('sms')} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white"><Smartphone className="mr-1 inline size-4" />SMS</button></div>
    </Modal>}
  </div>;
}

type CustomerFormValue = ReturnType<typeof emptyCustomerForm>;
function CustomerForm({ form, setForm, includeOpeningBalance = false, includeStatus = false }: { form: CustomerFormValue; setForm: React.Dispatch<React.SetStateAction<CustomerFormValue>>; includeOpeningBalance?: boolean; includeStatus?: boolean }) {
  return <div className="grid gap-3 sm:grid-cols-2"><input required value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} placeholder="Customer name *" className="rounded-xl border p-3" /><input required inputMode="numeric" value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} placeholder="Primary mobile number *" className="rounded-xl border p-3" /><input value={form.alternateMobile} onChange={(event) => setForm({ ...form, alternateMobile: event.target.value })} placeholder="Alternate mobile number" className="rounded-xl border p-3" /><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email address" className="rounded-xl border p-3" /><label className="text-xs font-bold text-slate-600">Date of birth<input type="date" value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-xs font-bold text-slate-600">Anniversary date<input type="date" value={form.anniversaryDate} onChange={(event) => setForm({ ...form, anniversaryDate: event.target.value })} className="mt-1 w-full rounded-xl border p-3" /></label><select value={form.customerType} onChange={(event) => setForm({ ...form, customerType: event.target.value as WalletCustomerType })} className="rounded-xl border p-3">{customerTypes.map((item) => <option key={item}>{item}</option>)}</select><select value={form.preferredBranch} onChange={(event) => setForm({ ...form, preferredBranch: event.target.value as Branch })} className="rounded-xl border p-3">{BRANCHES.map((item) => <option key={item}>{item}</option>)}</select>{includeOpeningBalance && <input type="number" min="0" step="0.01" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} placeholder="Opening paid balance" className="rounded-xl border p-3" />}{includeStatus && <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as WalletStatus })} className="rounded-xl border p-3"><option value="active">Active</option><option value="suspended">Suspended</option></select>}<textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Address" className="rounded-xl border p-3 sm:col-span-2" /><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Notes" className="rounded-xl border p-3 sm:col-span-2" /></div>;
}

function FormError({ text, className = '' }: { text: string; className?: string }) {
  return text ? <p className={`mt-3 text-sm font-bold text-red-600 ${className}`}>{text}</p> : null;
}
