import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Gift, QrCode, Search, Sparkles, WalletCards, X } from 'lucide-react';
import type { Branch } from '@/branch/types';
import type { PromotionCampaign, PromotionCartLine, PromotionEvaluation, WalletCustomer } from '@/features/commerce/types';
import { evaluatePromotions } from '@/features/commerce/promotionEngine';
import { useWalletPromotionStore } from '@/stores/walletPromotionStore';
import { formatCurrency } from '@/lib/utils';

export type WalletOtherMode = 'cash' | 'upi' | 'card' | 'credit' | null;

type Props = {
  branch: Branch;
  lines: PromotionCartLine[];
  packagingCharges?: number;
  deliveryCharges?: number;
  taxes?: number;
  walletEnabled: boolean;
  walletAmount: number;
  otherMode: WalletOtherMode;
  onWalletChange: (wallet: WalletCustomer | null) => void;
  onWalletAmountChange: (amount: number) => void;
  onOtherModeChange: (mode: WalletOtherMode) => void;
  onPromotionChange: (evaluation: PromotionEvaluation) => void;
  selectedWallet: WalletCustomer | null;
  authorizationSecret: string;
  onAuthorizationSecretChange: (value: string) => void;
  onCouponChange?: (coupon: string) => void;
  compact?: boolean;
  showOffers?: boolean;
};

const round = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export default function WalletOffersPanel({
  branch, lines, packagingCharges = 0, deliveryCharges = 0, taxes = 0, walletEnabled,
  walletAmount, otherMode, onWalletChange, onWalletAmountChange, onOtherModeChange,
  onPromotionChange, selectedWallet, authorizationSecret, onAuthorizationSecretChange, onCouponChange, compact = false,
  showOffers = true,
}: Props) {
  const { searchBillingWallets, loadBillingPromotions, recordPromotionExposure } = useWalletPromotionStore();
  const [search, setSearch] = useState('');
  const [coupon, setCoupon] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [dismissedPrompt, setDismissedPrompt] = useState('');
  const [results, setResults] = useState<WalletCustomer[]>([]);
  const [billingPromotions, setBillingPromotions] = useState<PromotionCampaign[]>([]);
  const [error, setError] = useState('');
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const analyticsSession = useRef(typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const exposureKeys = useRef(new Set<string>());
  const previousPrompt = useRef<{ campaignId: string; remaining: number } | null>(null);

  useEffect(() => {
    let active = true;
    void loadBillingPromotions(branch).then((rows) => { if (active) setBillingPromotions(rows); }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load promotions.');
    });
    return () => { active = false; };
  }, [branch, loadBillingPromotions]);

  useEffect(() => {
    const query = search.trim();
    if (!query) { setResults([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchBillingWallets(query, branch).then((rows) => {
        if (active) { setResults(rows); setError(''); }
      }).catch((searchError) => {
        if (active) { setResults([]); setError(searchError instanceof Error ? searchError.message : 'Unable to search wallets.'); }
      });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [branch, search, searchBillingWallets]);

  const evaluation = useMemo(() => evaluatePromotions(billingPromotions, {
    branch,
    customer: selectedWallet,
    lines,
    packagingCharges,
    deliveryCharges,
    taxes,
    couponCode: coupon.trim() || undefined,
    paymentIncludesWallet: walletEnabled,
    selectedCampaignIds,
    billingChannel: branch === 'Cafe' ? 'cafe_billing' : 'branch_billing',
  }), [billingPromotions, branch, selectedWallet, lines, packagingCharges, deliveryCharges, taxes, coupon, walletEnabled, selectedCampaignIds]);

  useEffect(() => { onPromotionChange(evaluation); }, [evaluation, onPromotionChange]);
  useEffect(() => { onCouponChange?.(coupon.trim().toUpperCase()); }, [coupon, onCouponChange]);
  useEffect(() => {
    const record = (campaignId: string, eventType: 'offer_shown' | 'prompt_displayed' | 'prompt_accepted', incrementalAmount = 0) => {
      const key = `${analyticsSession.current}:${campaignId}:${eventType}`;
      if (exposureKeys.current.has(key)) return;
      exposureKeys.current.add(key);
      void recordPromotionExposure(campaignId, branch, eventType, key, incrementalAmount).catch(() => {
        exposureKeys.current.delete(key);
      });
    };
    const visibleCampaignIds = new Set([
      ...evaluation.applied.map((item) => item.campaignId),
      ...evaluation.eligible.map((item) => item.campaignId),
      ...(evaluation.nearThreshold ? [evaluation.nearThreshold.campaignId] : []),
    ]);
    visibleCampaignIds.forEach((campaignId) => record(campaignId, 'offer_shown'));
    if (evaluation.nearThreshold) {
      record(evaluation.nearThreshold.campaignId, 'prompt_displayed');
      previousPrompt.current = { campaignId: evaluation.nearThreshold.campaignId, remaining: evaluation.nearThreshold.remaining };
    } else if (previousPrompt.current && evaluation.applied.some((item) => item.campaignId === previousPrompt.current?.campaignId)) {
      record(previousPrompt.current.campaignId, 'prompt_accepted', previousPrompt.current.remaining);
      previousPrompt.current = null;
    }
  }, [branch, evaluation, recordPromotionExposure]);
  useEffect(() => {
    if (!walletEnabled) return;
    if (!selectedWallet) { onWalletAmountChange(0); return; }
    const maximum = Math.min(selectedWallet.totalBalance, evaluation.payableSubtotal + packagingCharges + deliveryCharges + taxes);
    if (walletAmount > maximum) onWalletAmountChange(round(maximum));
  }, [walletEnabled, selectedWallet, evaluation.payableSubtotal, packagingCharges, deliveryCharges, taxes, walletAmount, onWalletAmountChange]);

  const payable = round(evaluation.payableSubtotal + packagingCharges + deliveryCharges + taxes);
  const maxWallet = selectedWallet ? Math.min(selectedWallet.totalBalance, payable) : 0;
  const remainder = round(Math.max(0, payable - walletAmount));
  const promptKey = evaluation.nearThreshold ? `${evaluation.nearThreshold.campaignId}:${evaluation.nearThreshold.remaining}` : '';

  return <div className={`space-y-2 ${compact ? 'text-xs' : 'text-sm'}`}>
    {walletEnabled && <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/70 p-3">
      <div className="flex items-center justify-between gap-2"><div><p className="font-black text-emerald-900">Customer wallet</p><p className="text-[10px] text-emerald-700">Search by mobile, name, wallet ID or scan QR.</p></div><QrCode className="size-5 text-emerald-700" /></div>
      <div className="relative mt-2"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /><input value={search} onFocus={() => setShowResults(true)} onChange={(event) => { setSearch(event.target.value); setShowResults(true); }} placeholder="Search wallet customer" className="w-full rounded-xl border border-emerald-200 bg-white py-2 pl-8 pr-8 font-bold outline-none focus:border-emerald-500" />{search && <button onClick={() => { setSearch(''); setShowResults(false); }} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="size-3.5" /></button>}
        {showResults && search.trim() && <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border bg-white shadow-xl">{results.map((wallet) => <button key={wallet.id} type="button" onClick={() => { onWalletChange(wallet); onAuthorizationSecretChange(''); setSearch(`${wallet.customerName} · ${wallet.mobile}`); setShowResults(false); onWalletAmountChange(Math.min(wallet.totalBalance, payable)); }} className="flex w-full items-center justify-between border-b px-3 py-2 text-left hover:bg-emerald-50"><span><b>{wallet.customerName}</b><small className="block text-slate-500">{wallet.mobile} · {wallet.walletNumber}</small></span><span className="font-black text-emerald-700">{formatCurrency(wallet.totalBalance)}</span></button>)}{results.length === 0 && <p className="p-3 text-center font-bold text-slate-500">No active wallet found.</p>}</div>}
      </div>
      {selectedWallet && <div className="mt-2 rounded-xl bg-white p-2.5 shadow-sm"><div className="flex items-center justify-between gap-2"><div><p className="font-black text-slate-950">{selectedWallet.customerName}</p><p className="text-[10px] text-slate-500">Status: {selectedWallet.status} · {selectedWallet.walletNumber}</p></div><button type="button" onClick={() => { onWalletChange(null); onAuthorizationSecretChange(''); setSearch(''); onWalletAmountChange(0); }} className="rounded-lg bg-slate-100 p-1.5"><X className="size-3" /></button></div><div className="mt-2 grid grid-cols-3 gap-1 text-center"><div className="rounded-lg bg-slate-50 p-1"><small className="block text-slate-500">Paid</small><b>{formatCurrency(selectedWallet.paidBalance)}</b></div><div className="rounded-lg bg-purple-50 p-1 text-purple-800"><small className="block">Promo</small><b>{formatCurrency(selectedWallet.promotionalBalance)}</b></div><div className="rounded-lg bg-emerald-50 p-1 text-emerald-800"><small className="block">Available</small><b>{formatCurrency(selectedWallet.totalBalance)}</b></div></div>{selectedWallet.expiringPromotionalAmount ? <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">{formatCurrency(selectedWallet.expiringPromotionalAmount)} promotional balance is expiring soon.</p> : null}<div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] font-black uppercase text-slate-500">Wallet amount<input type="number" min="0" max={maxWallet} step="0.01" value={walletAmount || ''} onChange={(event) => onWalletAmountChange(Math.min(maxWallet, Math.max(0, Number(event.target.value || 0))))} className="mt-1 w-full rounded-xl border px-2 py-2 text-sm font-black" /></label><label className="text-[10px] font-black uppercase text-slate-500">Remaining mode<select value={otherMode || ''} disabled={remainder <= 0} onChange={(event) => onOtherModeChange((event.target.value || null) as WalletOtherMode)} className="mt-1 w-full rounded-xl border px-2 py-2 text-sm font-black disabled:opacity-50"><option value="">Fully wallet</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="credit">Credit</option></select></label></div><div className="mt-2 flex justify-between rounded-lg bg-slate-950 px-2 py-1.5 font-black text-white"><span>Wallet {formatCurrency(walletAmount)}</span><span>Other {formatCurrency(remainder)}</span></div>{selectedWallet.highValueAuthorizationLimit != null && selectedWallet.highValueAuthorizationLimit > 0 && walletAmount >= selectedWallet.highValueAuthorizationLimit && <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-2"><label className="text-[10px] font-black uppercase text-amber-900">Admin / Owner authorization<input type="password" autoComplete="off" value={authorizationSecret} onChange={(event) => onAuthorizationSecretChange(event.target.value)} placeholder={`Required from ${formatCurrency(selectedWallet.highValueAuthorizationLimit)}`} className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-2 py-2 text-sm font-bold" /></label><p className="mt-1 text-[10px] font-bold text-amber-800">A supervisor must enter their current password. It is verified only by the server and is never stored.</p></div>}{walletAmount > selectedWallet.totalBalance && <p className="mt-1 text-[10px] font-bold text-red-600">Wallet amount exceeds available balance.</p>}</div>}
    </div>}

    {showOffers && <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-3">
      <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Sparkles className="size-4 text-purple-700" /><div><p className="font-black text-purple-950">Offers</p><p className="text-[10px] text-purple-700">Automatically recalculated from eligible subtotal.</p></div></div><Gift className="size-5 text-purple-700" /></div>
      <div className="mt-2 flex gap-2"><input value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} placeholder="Coupon code" className="min-w-0 flex-1 rounded-xl border border-purple-200 bg-white px-3 py-2 font-bold" /><button type="button" className="rounded-xl bg-purple-700 px-3 py-2 font-black text-white">Apply</button></div>
      {evaluation.applied.length > 0 ? <div className="mt-2 space-y-1">{evaluation.applied.map((item) => <div key={item.campaignId} className="rounded-xl border border-emerald-200 bg-emerald-50 p-2"><div className="flex justify-between gap-2"><b className="text-emerald-900">{item.campaignName}</b><b className="text-emerald-700">-{formatCurrency(item.discount)}</b></div>{item.cashback > 0 && <p className="text-[10px] font-bold text-emerald-700">Earn {formatCurrency(item.cashback)} promotional wallet cashback after successful payment.</p>}{item.freeItems.map((freeItem, index) => <p key={`${freeItem.name}-${index}`} className="text-[10px] font-bold text-emerald-700">Free: {freeItem.quantity} × {freeItem.name}</p>)}</div>)}</div> : <p className="mt-2 text-[10px] font-bold text-slate-500">No promotion is currently applied.</p>}
      {evaluation.eligible.some((item) => item.requiresSelection) && <div className="mt-2 space-y-1"><p className="text-[10px] font-black uppercase tracking-wide text-purple-800">Cashier-selectable offers</p>{evaluation.eligible.filter((item) => item.requiresSelection).map((item) => { const selected = selectedCampaignIds.includes(item.campaignId); return <button key={item.campaignId} type="button" onClick={() => setSelectedCampaignIds((current) => selected ? current.filter((id) => id !== item.campaignId) : [...current, item.campaignId])} className={`flex w-full items-center justify-between rounded-xl border px-2 py-1.5 text-left font-bold ${selected ? 'border-purple-700 bg-purple-700 text-white' : 'border-purple-200 bg-white text-purple-900'}`}><span>{item.campaignName}<small className="block opacity-70">Estimated saving {formatCurrency(item.estimatedDiscount)}</small></span><span>{selected ? 'Selected' : 'Apply'}</span></button>; })}</div>}
      <div className="mt-2 grid grid-cols-3 gap-1 text-center"><div className="rounded-lg bg-white p-1"><small className="block text-slate-500">Original</small><b>{formatCurrency(evaluation.originalSubtotal)}</b></div><div className="rounded-lg bg-white p-1 text-purple-800"><small className="block">Discount</small><b>{formatCurrency(evaluation.discount)}</b></div><div className="rounded-lg bg-white p-1 text-emerald-800"><small className="block">After offers</small><b>{formatCurrency(evaluation.payableSubtotal)}</b></div></div>
    </div>}

    {evaluation.nearThreshold && promptKey !== dismissedPrompt && <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 shadow-lg"><div className="flex items-start justify-between gap-2"><div><p className="font-black text-amber-900">Almost unlocked</p><p className="mt-1 font-bold text-amber-800">{evaluation.nearThreshold.message}</p></div><button type="button" onClick={() => setDismissedPrompt(promptKey)} className="rounded-lg bg-amber-100 p-1"><X className="size-3.5" /></button></div>{evaluation.nearThreshold.suggestions.length > 0 && <div className="mt-2 space-y-1">{evaluation.nearThreshold.suggestions.map((suggestion) => <p key={suggestion.itemId} className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-amber-800">{suggestion.message}</p>)}</div>}</div>}
    {error && <p className="rounded-xl bg-amber-50 p-2 text-[10px] font-bold text-amber-800"><AlertTriangle className="mr-1 inline size-3" />{error}</p>}
  </div>;
}
