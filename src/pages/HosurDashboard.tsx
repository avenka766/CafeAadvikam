// src/pages/HosurDashboard.tsx
// Redesigned Hosur branch dashboard — bill-first, no stock tab, no thresholds,
// stock confirmation + discrepancy alert, mandatory customer name on bill, credit sales.

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  Receipt, Clock, Bell, CheckCircle2, AlertTriangle, Package,
  ChevronRight, ChevronDown, Plus, Minus, Trash2, Search, X,
  Banknote, Smartphone, CreditCard, ArrowLeftRight, Printer,
  Tag, Pencil, Scale, Hash, Loader2, XCircle, Wallet, IndianRupee,
  User, AlertCircle, CheckCheck, History, TrendingUp, Calendar,
  RefreshCw, CreditCard as CreditIcon, BadgeCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from '@/branch/branchStore';
import { useAuthStore } from '@/stores/authStore';
import { SNB_ITEMS, SNB_CATEGORIES } from '@/branch/snbItems';
import type { SnbItem } from '@/branch/snbItems';
import type { StockItem, IncomingStock, CreditSale, CreditSaleItem } from '@/branch/branchStore';
import { supabase } from '@/lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANCH = 'Hosur' as const;
const COLORS = {
  text:  'text-emerald-700',
  bg:    'bg-emerald-50',
  badge: 'bg-emerald-100 text-emerald-700',
  bar:   'bg-emerald-500',
  gradient: 'linear-gradient(135deg, #059669, #047857)',
};

type SellUnit = 'pcs' | 'kg';
type PaymentMethod = 'cash' | 'upi' | 'card' | 'credit';
type DiscountType = 'percent' | 'flat';
type HosurTab = 'bill' | 'confirm' | 'alert' | 'credit' | 'history';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(s: string | number | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const fmtMoney = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtNum = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fetchNextBillNo(): Promise<string> {
  const { data, error } = await supabase.rpc('get_next_bill_number');
  if (error || data == null) {
    const d = new Date();
    const dp = `${d.getFullYear().toString().slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    return `${dp}-${crypto.randomUUID().replace(/-/g,'').slice(0,4).toUpperCase()}`;
  }
  return String(data);
}

interface CartItem {
  itemName: string; quantity: number; sellUnit: SellUnit;
  price: number | null; lineTotal: number | null;
}

// ─── Print Bill (Hosur) ───────────────────────────────────────────────────────

function printHosurBill(args: {
  billNo: string; customerName: string; items: CartItem[];
  subtotal: number; discount: number; discountType: DiscountType;
  discountValue: string; finalTotal: number;
  payMode: 'single'|'split'|'credit';
  singleMethod: PaymentMethod|null;
  splitMethods: [PaymentMethod|null, PaymentMethod|null];
  splitAmounts: [string,string];
  creditAmount: number; amountPaid: number;
  soldBy: string;
}) {
  const { billNo, customerName, items, subtotal, discount, discountType,
    discountValue, finalTotal, payMode, singleMethod, splitMethods,
    splitAmounts, creditAmount, amountPaid, soldBy } = args;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  const payLabel = payMode === 'credit'
    ? `Credit (Paid: ₹${fmtNum(amountPaid)}, Due: ₹${fmtNum(creditAmount)})`
    : payMode === 'single'
      ? (singleMethod ?? 'cash').toUpperCase()
      : [
          splitMethods[0] ? `${splitMethods[0].toUpperCase()}: ₹${splitAmounts[0]}` : '',
          splitMethods[1] ? `${splitMethods[1].toUpperCase()}: ₹${splitAmounts[1]}` : '',
        ].filter(Boolean).join(' + ');

  const rows = items.map((item, idx) => `
    <tr>
      <td class="sn">${idx+1}</td>
      <td class="name">${escHtml(item.itemName)}</td>
      <td class="num">${item.sellUnit === 'kg' ? (item.quantity < 1 ? `${Math.round(item.quantity*1000)}g` : `${item.quantity}kg`) : item.quantity}</td>
      <td class="num">${item.price != null ? fmtNum(item.price) : '—'}</td>
      <td class="num">${item.lineTotal != null ? fmtNum(item.lineTotal) : '—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><title>Bill – ${billNo}</title>
  <style>
    @page { margin: 8mm; size: 80mm auto; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #000; max-width: 300px; margin: 0 auto; padding: 8px; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    hr { border: none; border-top: 1px dashed #666; margin: 6px 0; }
    hr.solid { border-top: 1px solid #000; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px; vertical-align: top; }
    .sn { width: 16px; color: #555; }
    .num { text-align: right; white-space: nowrap; }
    .net { font-size: 13px; font-weight: bold; }
    .credit-box { border: 2px solid #000; padding: 4px 6px; margin: 4px 0; }
  </style></head><body>
  <div class="center bold" style="font-size:9px">SRI NANJUNDESHWARA BAKERY</div>
  <div class="center bold" style="font-size:14px">HOSUR BRANCH</div>
  <div class="center" style="font-size:9px">Hosur, Tamil Nadu</div>
  <hr class="solid"/>
  <div class="center bold" style="font-size:11px">TAX INVOICE</div>
  <hr/>
  <table>
    <tr><td>Bill No: <span class="bold">${escHtml(billNo)}</span></td><td class="num">Date: ${dateStr}</td></tr>
    <tr><td>Customer: <span class="bold">${escHtml(customerName)}</span></td><td class="num">Time: ${timeStr}</td></tr>
    <tr><td>Biller: <span class="bold">${escHtml(soldBy)}</span></td></tr>
  </table>
  <hr/>
  <table>
    <thead><tr>
      <td class="bold sn">Sn</td>
      <td class="bold">Item</td>
      <td class="bold num">Qty</td>
      <td class="bold num">Rate</td>
      <td class="bold num">Amt</td>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="border-top:1px solid #000">
      <td></td><td class="bold">Total</td>
      <td class="num bold">${totalQty}</td>
      <td></td>
      <td class="num bold">${fmtNum(subtotal)}</td>
    </tr></tfoot>
  </table>
  <hr/>
  <table>
    ${discount > 0 ? `<tr><td>Discount${discountType==='percent'?` (${discountValue}%)`:' (Flat)'}:</td><td class="num">-${fmtNum(discount)}</td></tr>` : ''}
  </table>
  <hr class="solid"/>
  <table><tr>
    <td class="net">Net Amount:</td>
    <td class="net num">Rs. ${fmtNum(finalTotal)}</td>
  </tr></table>
  <hr/>
  ${payMode === 'credit' ? `
  <div class="credit-box">
    <div class="bold" style="font-size:11px">CREDIT SALE</div>
    <table>
      <tr><td>Amount Paid:</td><td class="num">${fmtNum(amountPaid)}</td></tr>
      <tr><td class="bold">Amount Due:</td><td class="num bold">${fmtNum(creditAmount)}</td></tr>
    </table>
  </div>` : `<div>Payment: <span class="bold">${payLabel}</span></div>`}
  <hr/>
  <div class="center bold" style="margin-top:4px">Thank You, Visit Again!</div>
  <script>window.onload=()=>window.print();</script>
  </body></html>`;

  const w = window.open('','_blank','width=380,height=650');
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── KgInput ──────────────────────────────────────────────────────────────────

function KgInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [raw, setRaw] = useState(String(value));
  const PRESETS = [0.1, 0.25, 0.5, 1, 2];
  const commit = (s: string) => {
    const n = parseFloat(s);
    if (!isNaN(n) && n > 0) onChange(Math.round(n * 1000) / 1000);
    else setRaw(String(value));
  };
  useEffect(() => setRaw(String(value)), [value]);
  return (
    <div className="space-y-1.5 pt-0.5">
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map((p) => (
          <button key={p} onClick={() => { onChange(p); setRaw(String(p)); }}
            className={cn('px-2 py-0.5 rounded-lg text-[10px] font-bold border transition active:scale-95',
              value === p ? 'bg-emerald-600 text-white border-transparent' : 'bg-muted border-border')}>
            {p < 1 ? `${p * 1000}g` : `${p}kg`}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Scale className="size-3.5 text-muted-foreground shrink-0" />
        <input type="number" inputMode="decimal" step="0.05" min="0.05" value={raw}
          onChange={(e) => setRaw(e.target.value)} onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit(raw)}
          className="flex-1 h-8 px-3 rounded-lg border bg-background text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          placeholder="0.500" />
        <span className="text-xs text-muted-foreground">kg</span>
      </div>
    </div>
  );
}

// ─── InlinePriceInput ─────────────────────────────────────────────────────────

function InlinePriceInput({ unit, value, onChange }: { unit: SellUnit; value: number|null; onChange: (v: number|null) => void }) {
  const [editing, setEditing] = useState(value == null);
  const [raw, setRaw] = useState(value != null ? String(value) : '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const commit = () => {
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) { onChange(n); setEditing(false); }
    else { setRaw(value != null ? String(value) : ''); setEditing(false); }
  };
  if (!editing && value != null) return (
    <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition">
      ₹{value}{unit === 'kg' ? '/kg' : '/pc'}<Pencil className="size-2.5 opacity-60" />
    </button>
  );
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">₹</span>
      <input ref={ref} type="number" inputMode="decimal" min="0.01" step="0.5" value={raw}
        onChange={(e) => setRaw(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        placeholder={unit === 'kg' ? 'price/kg' : 'price/pc'}
        className="w-20 h-6 px-2 rounded-md border bg-amber-50 border-amber-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400" />
    </div>
  );
}

// ─── CartLineItem ─────────────────────────────────────────────────────────────

function CartLineItem({ item, onAdd, onRemove, onDelete, onPriceChange }: {
  item: CartItem; onAdd: () => void; onRemove: () => void;
  onDelete: () => void; onPriceChange: (p: number|null) => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold truncate leading-snug">{item.itemName}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono">
            {item.sellUnit === 'kg' ? (item.quantity < 1 ? `${Math.round(item.quantity*1000)}g` : `${item.quantity}kg`) : `×${item.quantity}`}
          </span>
          <span className="text-[10px] text-muted-foreground">×</span>
          <InlinePriceInput unit={item.sellUnit} value={item.price} onChange={onPriceChange} />
        </div>
        {item.lineTotal != null
          ? <p className="text-sm font-bold text-emerald-600 tabular-nums">= {fmtMoney(item.lineTotal)}</p>
          : <p className="text-[11px] text-amber-500">Enter price above</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0 pt-0.5">
        {item.sellUnit === 'pcs' && (
          <>
            <button onClick={onRemove} className="size-7 rounded-lg bg-muted flex items-center justify-center active:scale-90 transition"><Minus className="size-3" /></button>
            <span className="w-5 text-center text-xs font-bold tabular-nums">{item.quantity}</span>
            <button onClick={onAdd} className="size-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center active:scale-90 transition"><Plus className="size-3" /></button>
          </>
        )}
        {item.sellUnit === 'kg' && (
          <span className="text-xs font-semibold text-muted-foreground px-1">
            {item.quantity < 1 ? `${Math.round(item.quantity*1000)}g` : `${item.quantity}kg`}
          </span>
        )}
        <button onClick={onDelete} className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 transition ml-0.5"><Trash2 className="size-3" /></button>
      </div>
    </div>
  );
}

// ─── ConfirmStockTab ──────────────────────────────────────────────────────────

function ConfirmStockTab({ branchIncoming }: { branchIncoming: IncomingStock[] }) {
  const { confirmIncoming, confirmAllIncoming } = useBranchStore();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [error, setError] = useState('');

  const unconfirmed = branchIncoming.filter(i => !i.confirmed);
  const todayStr = new Date().toDateString();
  const todayItems = unconfirmed.filter(i => new Date(i.receivedAt).toDateString() === todayStr);
  const olderItems = unconfirmed.filter(i => new Date(i.receivedAt).toDateString() !== todayStr);

  const handleConfirm = async (id: string) => {
    setConfirming(id); setError('');
    const err = await confirmIncoming(BRANCH, id);
    setConfirming(null);
    if (err) setError(err);
  };

  const handleConfirmAll = async () => {
    setConfirmAll(true); setError('');
    const err = await confirmAllIncoming(BRANCH);
    setConfirmAll(false);
    if (err) setError(err);
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-base text-foreground">Confirm Received Stock</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Tap confirm to add items to your stock</p>
        </div>
        {todayItems.length > 1 && (
          <button onClick={handleConfirmAll} disabled={confirmAll}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600 text-white active:scale-95 disabled:opacity-60">
            {confirmAll ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3" />}
            Confirm All Today
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 px-3 py-2.5 rounded-xl text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />{error}
        </div>
      )}

      {unconfirmed.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <div className="size-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <CheckCircle2 className="size-8 text-emerald-500" />
          </div>
          <p className="text-sm font-body font-semibold text-foreground">All stock confirmed!</p>
          <p className="text-xs text-muted-foreground">No pending incoming items</p>
        </div>
      ) : (
        <div className="space-y-3">
          {todayItems.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-2 px-1">Today's Arrivals</p>
              {todayItems.map(item => (
                <IncomingCard key={item.id} item={item} confirming={confirming === item.id} onConfirm={() => handleConfirm(item.id)} />
              ))}
            </div>
          )}
          {olderItems.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Older Pending</p>
              {olderItems.map(item => (
                <IncomingCard key={item.id} item={item} confirming={confirming === item.id} onConfirm={() => handleConfirm(item.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recently confirmed */}
      {branchIncoming.filter(i => i.confirmed).length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 px-1">Recently Confirmed</p>
          <div className="space-y-2 opacity-60">
            {branchIncoming.filter(i => i.confirmed).slice(0,5).map(item => (
              <div key={item.id} className="bg-muted/50 border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.itemName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit} · {new Date(item.receivedAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <CheckCircle2 className="size-3" />Confirmed
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IncomingCard({ item, confirming, onConfirm }: {
  item: IncomingStock; confirming: boolean; onConfirm: () => void;
}) {
  return (
    <div className="bg-card border-2 border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between mb-2">
      <div>
        <p className="text-sm font-bold text-foreground">{item.itemName}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
          <Package className="size-3" />
          {item.quantity} {item.unit} · from {item.dispatchedBy}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {new Date(item.receivedAt).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
        </p>
      </div>
      <button onClick={onConfirm} disabled={confirming}
        className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600 text-white active:scale-95 disabled:opacity-60 transition ml-3">
        {confirming ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
        {confirming ? 'Adding…' : 'Confirm'}
      </button>
    </div>
  );
}

// ─── DiscrepancyAlertTab ──────────────────────────────────────────────────────

function DiscrepancyAlertTab({ branchStock, branchIncoming }: {
  branchStock: StockItem[]; branchIncoming: IncomingStock[];
}) {
  const { fetchStockMismatches, stockMismatches } = useBranchStore();
  const hosurMismatches = stockMismatches.filter(m => m.branch === BRANCH);

  // Find items dispatched but not confirmed (packing discrepancy)
  const pendingConfirm = branchIncoming.filter(i => !i.confirmed);

  // Low/zero stock items
  const zeroStock = branchStock.filter(s => s.quantity <= 0);
  const lowStock  = branchStock.filter(s => s.quantity > 0 && s.quantity <= (s.minThreshold ?? 5));

  const totalAlerts = pendingConfirm.length + hosurMismatches.length + zeroStock.length + lowStock.length;

  useEffect(() => { fetchStockMismatches(); }, []);

  return (
    <div className="space-y-4 pb-6">
      <div>
        <h2 className="font-display font-bold text-base text-foreground">Stock Alerts</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{totalAlerts} issue{totalAlerts !== 1 ? 's' : ''} need attention</p>
      </div>

      {/* Packing discrepancies — items dispatched but not confirmed */}
      {pendingConfirm.length > 0 && (
        <AlertSection icon={<Package className="size-4 text-amber-500" />} title="Unconfirmed Dispatches" color="amber" count={pendingConfirm.length}>
          {pendingConfirm.map(item => (
            <AlertRow key={item.id} title={item.itemName}
              desc={`${item.quantity} ${item.unit} dispatched by ${item.dispatchedBy} — not yet confirmed`}
              date={item.receivedAt} color="amber" />
          ))}
        </AlertSection>
      )}

      {/* Stock sale mismatches */}
      {hosurMismatches.length > 0 && (
        <AlertSection icon={<AlertTriangle className="size-4 text-red-500" />} title="Sale Discrepancies" color="red" count={hosurMismatches.length}>
          {hosurMismatches.map(m => (
            <AlertRow key={m.id} title={m.itemName}
              desc={`Sold ${m.soldQty} but had shortage of ${m.shortage} — sold by ${m.soldBy}`}
              date={m.soldAt} color="red" />
          ))}
        </AlertSection>
      )}

      {/* Zero stock */}
      {zeroStock.length > 0 && (
        <AlertSection icon={<XCircle className="size-4 text-red-500" />} title="Out of Stock" color="red" count={zeroStock.length}>
          {zeroStock.map(item => (
            <AlertRow key={item.itemName} title={item.itemName} desc="No stock available" color="red" />
          ))}
        </AlertSection>
      )}

      {/* Low stock */}
      {lowStock.length > 0 && (
        <AlertSection icon={<AlertTriangle className="size-4 text-orange-500" />} title="Low Stock" color="orange" count={lowStock.length}>
          {lowStock.map(item => (
            <AlertRow key={item.itemName} title={item.itemName}
              desc={`Only ${item.quantity} ${item.unit === 'kg' ? 'kg' : 'pcs'} remaining`} color="orange" />
          ))}
        </AlertSection>
      )}

      {totalAlerts === 0 && (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="size-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <BadgeCheck className="size-8 text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-foreground">All clear!</p>
          <p className="text-xs text-muted-foreground">No stock discrepancies or alerts</p>
        </div>
      )}
    </div>
  );
}

function AlertSection({ icon, title, color, count, children }: {
  icon: React.ReactNode; title: string; color: string; count: number; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const colorMap: Record<string, string> = {
    red: 'border-red-200 bg-red-50', amber: 'border-amber-200 bg-amber-50',
    orange: 'border-orange-200 bg-orange-50',
  };
  return (
    <div className={cn('border rounded-2xl overflow-hidden', colorMap[color] ?? 'border-border bg-muted/30')}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3">
        {icon}
        <span className="font-body font-bold text-sm text-foreground flex-1 text-left">{title}</span>
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
          color === 'red' ? 'bg-red-100 text-red-700' : color === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700')}>
          {count}
        </span>
        {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function AlertRow({ title, desc, date, color }: { title: string; desc: string; date?: string; color: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-t border-border/30 first:border-0">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
      {date && <p className="text-[10px] text-muted-foreground/70">{new Date(date).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</p>}
    </div>
  );
}

// ─── CreditTab ────────────────────────────────────────────────────────────────

function CreditTab({ creditSales }: { creditSales: CreditSale[] }) {
  const { settleCreditSale } = useBranchStore();
  const [filter, setFilter] = useState<'all' | 'pending' | 'partial' | 'settled'>('pending');
  const [settling, setSettling] = useState<string | null>(null);
  const [settleAmt, setSettleAmt] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const safeSales = creditSales.filter((cs): cs is CreditSale => cs != null);

  const filtered = safeSales.filter(cs =>
    filter === 'all' ? true : cs.status === filter
  );

  const totalCredit = safeSales
    .filter(cs => cs.status !== 'settled')
    .reduce((s, cs) => s + (cs.creditAmount ?? 0), 0);

  const handleSettle = async (cs: CreditSale) => {
    const amt = parseFloat(settleAmt[cs.id] || '0');
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return; }
    if (amt > (cs.creditAmount ?? 0)) { setError('Amount exceeds balance due'); return; }
    setSettling(cs.id); setError('');
    const err = await settleCreditSale(BRANCH, cs.id, amt);
    setSettling(null);
    if (err) setError(err);
    else setSettleAmt(prev => { const n = {...prev}; delete n[cs.id]; return n; });
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Summary */}
      <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-red-700 uppercase tracking-widest mb-1">Total Credit Outstanding</p>
        <p className="font-display text-3xl font-bold text-red-600 tabular-nums">{fmtMoney(totalCredit)}</p>
        <p className="text-xs text-muted-foreground mt-1">{safeSales.filter(cs => cs.status !== 'settled').length} open credit accounts</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-xl text-xs text-destructive">
          <AlertCircle className="size-3 shrink-0" />{error}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-1.5">
        {(['all','pending','partial','settled'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-3 py-1.5 rounded-full text-[11px] font-bold border transition',
              filter === f ? 'bg-emerald-600 text-white border-transparent' : 'bg-card border-border text-muted-foreground')}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground">
          <CreditIcon className="size-8 opacity-20" />
          <p className="text-sm font-body">No {filter !== 'all' ? filter : ''} credit sales</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(cs => (
            <CreditCard key={cs.id} cs={cs} settling={settling === cs.id}
              settleAmt={settleAmt[cs.id] || ''}
              onSettleAmtChange={v => setSettleAmt(prev => ({...prev, [cs.id]: v}))}
              onSettle={() => handleSettle(cs)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CreditCard({ cs, settling, settleAmt, onSettleAmtChange, onSettle }: {
  cs: CreditSale; settling: boolean; settleAmt: string;
  onSettleAmtChange: (v: string) => void; onSettle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusColors: Record<string, string> = {
    pending: 'bg-red-100 text-red-700 border-red-200',
    partial: 'bg-amber-100 text-amber-700 border-amber-200',
    settled: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  // Guard against undefined/null cs (can occur during concurrent store updates)
  if (!cs) return null;

  const safeItems = (cs.items || []).filter((item): item is CreditSaleItem => item != null);

  return (
    <div className="bg-card border-2 border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-body font-bold text-sm text-foreground truncate">{cs.customerName ?? 'Unknown'}</span>
            <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', statusColors[cs.status ?? 'pending'])}>
              {(cs.status ?? 'pending').toUpperCase()}
            </span>
          </div>
          {cs.customerPhone && <p className="text-xs text-muted-foreground">{cs.customerPhone}</p>}
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Bill #{(cs.billNo ?? '').split('-').pop() || '—'} · {new Date(cs.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })} · {cs.soldBy ?? 'Staff'}
          </p>
        </div>
        <div className="text-right ml-3">
          <p className="text-xs text-muted-foreground">Due</p>
          <p className="font-display font-bold text-lg text-red-600 tabular-nums">{fmtMoney(cs.creditAmount ?? 0)}</p>
        </div>
      </div>

      {/* Expand toggle */}
      <button onClick={() => setExpanded(v=>!v)}
        className="w-full flex items-center justify-between px-4 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground font-semibold">
        <span>Total: {fmtMoney(cs.subtotal ?? 0)} · Paid: {fmtMoney(cs.amountPaid ?? 0)}</span>
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>

      {expanded && (
        <div className="px-4 py-3 border-t border-border/50 space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Items</p>
          {safeItems.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-foreground">{item.quantity}{item.sellUnit === 'kg' ? 'kg' : '×'} {item.itemName}</span>
              <span className="font-bold tabular-nums text-primary">{fmtMoney(item.lineTotal)}</span>
            </div>
          ))}
          {cs.notes && <p className="text-xs text-muted-foreground italic mt-2">Note: {cs.notes}</p>}
          {cs.dueDate && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="size-3" />Due by: {new Date(cs.dueDate + 'T00:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })}
            </p>
          )}
        </div>
      )}

      {/* Collect payment */}
      {cs.status !== 'settled' && (
        <div className="px-4 py-3 border-t border-border bg-muted/10 space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase">Collect Payment</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <input type="number" placeholder={`Max ${fmtMoney(cs.creditAmount ?? 0)}`}
                value={settleAmt} onChange={e => onSettleAmtChange(e.target.value)}
                className="w-full pl-7 pr-2 py-2 rounded-xl bg-card border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
            </div>
            <button onClick={onSettle} disabled={settling || !settleAmt}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold active:scale-95 disabled:opacity-50">
              {settling ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              {settling ? '…' : 'Collect'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────

function HosurHistoryTab() {
  const { sales } = useBranchStore();
  const branchSales = sales[BRANCH] || [];

  const grouped = useMemo(() => {
    const map = new Map<string, typeof branchSales>();
    branchSales.forEach(s => {
      const dateKey = new Date(s.soldAt).toDateString();
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(s);
    });
    return Array.from(map.entries());
  }, [branchSales]);

  return (
    <div className="space-y-4 pb-6">
      <div>
        <h2 className="font-display font-bold text-base">Sales History</h2>
        <p className="text-xs text-muted-foreground">Last 30 days · {branchSales.length} records</p>
      </div>
      {grouped.map(([dateStr, records]) => (
        <div key={dateStr}>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
            {new Date(dateStr).toLocaleDateString('en-IN', { weekday:'long', day:'2-digit', month:'short' })}
            <span className="ml-2 normal-case">{fmtMoney(records.reduce((s,r)=>s+r.quantitySold*(/* price not in SaleRecord, so 0 */0),0))}</span>
          </p>
          <div className="space-y-1.5">
            {records.map(r => (
              <div key={r.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{r.itemName}</p>
                  <p className="text-xs text-muted-foreground">{r.soldBy} · {r.paymentMethod?.toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-muted-foreground">×{r.quantitySold}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(r.soldAt).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {branchSales.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-2 text-muted-foreground">
          <History className="size-8 opacity-20" />
          <p className="text-sm">No sales history yet</p>
        </div>
      )}
    </div>
  );
}

// ─── BillPanel ────────────────────────────────────────────────────────────────

function BillPanel({ branchStock }: { branchStock: StockItem[] }) {
  const { recordSnbSale, recordCreditSale } = useBranchStore();
  const { currentUser } = useAuthStore();
  const soldBy = currentUser?.displayName || currentUser?.username || 'Staff';

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const billNo = useRef<string>('…');
  useEffect(() => { fetchNextBillNo().then(n => { billNo.current = n; }); }, []);

  // Customer name — mandatory for Hosur
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerErr, setCustomerErr] = useState('');

  // Discount
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [showDiscount, setShowDiscount] = useState(false);

  // Payment
  const [payMode, setPayMode] = useState<'single'|'split'|'credit'>('single');
  const [singleMethod, setSingle] = useState<PaymentMethod|null>(null);
  const [splitMethods, setSplitMethods] = useState<[PaymentMethod|null, PaymentMethod|null]>([null,null]);
  const [splitAmounts, setSplitAmounts] = useState<[string,string]>(['','']);

  // Credit
  const [creditAmountPaid, setCreditAmountPaid] = useState('');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [creditNotes, setCreditNotes] = useState('');

  // UI
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const resetCart = useCallback(() => {
    setCart([]); setCustomerName(''); setCustomerPhone(''); setCustomerErr('');
    setPayMode('single'); setSingle(null); setSplitMethods([null,null]); setSplitAmounts(['','']);
    setCreditAmountPaid(''); setCreditDueDate(''); setCreditNotes('');
    setDiscountValue(''); setShowDiscount(false); setError('');
    fetchNextBillNo().then(n => { billNo.current = n; });
  }, []);

  // Items from SNB price list (Hosur uses SNB items)
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return SNB_ITEMS.filter(item => {
      if (q) return item.name.toLowerCase().includes(q);
      return activeCategory === 'All' || item.category === activeCategory;
    });
  }, [search, activeCategory]);

  const getCartItem = (name: string) => cart.find(c => c.itemName === name);
  const getStockQty = (name: string) => branchStock.find(s => s.itemName === name)?.quantity ?? 0;

  const addItem = (item: SnbItem) => {
    const unit: SellUnit = item.uom === 'Kgs' ? 'kg' : 'pcs';
    setCart(prev => {
      const ex = prev.find(c => c.itemName === item.name);
      if (ex) {
        if (unit === 'pcs') {
          const nq = ex.quantity + 1;
          return prev.map(c => c.itemName === item.name ? { ...c, quantity: nq, lineTotal: nq * (c.price ?? 0) } : c);
        }
        return prev;
      }
      const qty = unit === 'kg' ? 0.5 : 1;
      return [...prev, { itemName: item.name, quantity: qty, sellUnit: unit, price: item.price, lineTotal: item.price * qty }];
    });
  };

  const removeItem = (name: string) => setCart(prev => {
    const ex = prev.find(c => c.itemName === name);
    if (!ex) return prev;
    if (ex.sellUnit === 'kg' || ex.quantity <= 1) return prev.filter(c => c.itemName !== name);
    const nq = ex.quantity - 1;
    return prev.map(c => c.itemName === name ? { ...c, quantity: nq, lineTotal: nq * (c.price ?? 0) } : c);
  });

  const updateKgQty = (name: string, qty: number) =>
    setCart(prev => prev.map(c => c.itemName === name ? { ...c, quantity: qty, lineTotal: (c.price ?? 0) * qty } : c));
  const updatePrice = (name: string, price: number|null) =>
    setCart(prev => prev.map(c => c.itemName === name ? { ...c, price, lineTotal: price != null ? price * c.quantity : null } : c));

  const allPriced = cart.length > 0 && cart.every(c => c.price != null);
  const subtotal = useMemo(() => cart.reduce((s, c) => s + (c.lineTotal ?? 0), 0), [cart]);
  const discount = useMemo(() => {
    const v = parseFloat(discountValue) || 0;
    if (!allPriced || v <= 0) return 0;
    if (discountType === 'percent') return Math.round(subtotal * Math.min(v,100) / 100 * 100) / 100;
    return Math.min(v, subtotal);
  }, [subtotal, discountType, discountValue, allPriced]);

  const preRound = Math.round((subtotal - discount) * 100) / 100;
  const roundOff = Math.round(preRound) - preRound;
  const finalTotal = Math.round(preRound);

  const creditAmt = payMode === 'credit'
    ? Math.max(0, finalTotal - (parseFloat(creditAmountPaid) || 0))
    : 0;

  const splitTotal0 = parseFloat(splitAmounts[0]) || 0;
  const splitTotal1 = parseFloat(splitAmounts[1]) || 0;
  const splitSum = Math.round((splitTotal0 + splitTotal1) * 100) / 100;

  const paymentReady = payMode === 'credit'
    ? true // credit always ready (amount paid can be 0)
    : payMode === 'single'
      ? singleMethod != null
      : splitMethods[0] != null && splitMethods[1] != null && splitMethods[0] !== splitMethods[1]
        && Math.abs(splitSum - finalTotal) < 0.01;

  const doCheckout = async () => {
    if (cart.length === 0) return;
    if (!customerName.trim()) { setCustomerErr('Customer name is required'); return; }
    if (!paymentReady) { setError('Select a payment method'); return; }
    setError(''); setCustomerErr(''); setSubmitting(true);

    const methodLabel = payMode === 'credit'
      ? 'credit'
      : payMode === 'single' ? (singleMethod ?? 'cash')
      : [splitMethods[0], splitMethods[1]].filter(Boolean).join('+');

    try {
      if (payMode === 'credit') {
        // Record as credit sale — no stock deduction yet for credit; record the sale
        const items: CreditSaleItem[] = cart.map(c => ({
          itemName: c.itemName, quantity: c.quantity, sellUnit: c.sellUnit,
          price: c.price ?? 0, lineTotal: c.lineTotal ?? 0,
        }));
        const amtPaid = parseFloat(creditAmountPaid) || 0;
        const err = await recordCreditSale(BRANCH, {
          branch: BRANCH, customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || null, items,
          subtotal: finalTotal, amountPaid: amtPaid,
          creditAmount: Math.max(0, finalTotal - amtPaid),
          soldBy, dueDate: creditDueDate || null, notes: creditNotes.trim() || null,
          billNo: billNo.current,
        });
        if (err) { setError(err); return; }
        // Also record each item sale
        for (const item of cart) {
          await recordSnbSale(BRANCH, item.itemName, item.quantity, soldBy, 'credit', item.price ?? 0, billNo.current);
        }
      } else {
        for (const item of cart) {
          const { error: err } = await recordSnbSale(BRANCH, item.itemName, item.quantity, soldBy, methodLabel, item.price ?? 0, billNo.current);
          if (err) { setError(err); return; }
        }
      }

      printHosurBill({
        billNo: billNo.current, customerName: customerName.trim(), items: cart,
        subtotal, discount, discountType, discountValue, finalTotal,
        payMode, singleMethod, splitMethods, splitAmounts,
        creditAmount: creditAmt, amountPaid: parseFloat(creditAmountPaid) || 0,
        soldBy,
      });

      setShowSuccess(true);
      resetCart();
      setTimeout(() => setShowSuccess(false), 2500);
    } finally {
      setSubmitting(false);
    }
  };

  if (showSuccess) return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="size-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
        <CheckCircle2 className="size-10 text-emerald-600" />
      </div>
      <h2 className="font-display text-2xl font-bold">Sale Complete!</h2>
      <p className="text-muted-foreground text-sm mt-1">Bill printed and recorded.</p>
    </div>
  );

  const PAYMENT_OPTIONS = [
    { key: 'cash' as PaymentMethod, label: 'Cash', icon: <Banknote className="size-4" /> },
    { key: 'upi'  as PaymentMethod, label: 'UPI',  icon: <Smartphone className="size-4" /> },
    { key: 'card' as PaymentMethod, label: 'Card', icon: <CreditCard className="size-4" /> },
  ];

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden" style={{ height: 'calc(100dvh - 260px)' }}>

      {/* ── COL 1: Category sidebar ──────────────────────────────────────────── */}
      <div className="w-1/4 shrink-0 flex flex-col border-r border-border bg-muted/40 overflow-y-auto">
        {(['All', ...SNB_CATEGORIES] as string[]).map(cat => {
          const isActive = activeCategory === cat && !search.trim();
          return (
            <button key={cat} onClick={() => { setActiveCategory(cat); setSearch(''); }}
              className={cn('w-full text-left px-2.5 py-3 border-b border-border/50 transition-all',
                isActive ? 'bg-emerald-600 text-white' : 'hover:bg-muted text-foreground')}>
              <p className={cn('text-[11px] font-bold leading-tight', isActive ? 'text-white' : 'text-foreground')}>
                {cat === 'All' ? 'All' : cat}
              </p>
            </button>
          );
        })}
      </div>

      {/* ── COL 2: Item grid ─────────────────────────────────────────────────── */}
      <div className="w-[45%] min-w-0 flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b bg-background shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input type="text" placeholder="Search items…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-muted/50 border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-4 text-muted-foreground" /></button>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-2 gap-2">
            {filteredItems.map(item => {
              const ci = getCartItem(item.name);
              const unit: SellUnit = item.uom === 'Kgs' ? 'kg' : 'pcs';
              const stockQty = getStockQty(item.name);
              return (
                <div key={item.barcode ?? item.name}
                  className={cn('border rounded-xl p-2.5 flex flex-col gap-1.5 transition-all',
                    ci ? 'border-emerald-400 bg-emerald-50' : 'border-border bg-card')}>
                  <p className="text-xs font-bold text-foreground truncate leading-tight">{item.name}</p>
                  <p className="text-xs font-bold text-emerald-600 tabular-nums">₹{item.price}{unit==='kg'?'/kg':''}</p>
                  {unit === 'kg' && ci ? (
                    <KgInput value={ci.quantity} onChange={v => updateKgQty(item.name, v)} />
                  ) : unit === 'kg' ? (
                    <button onClick={() => addItem(item)}
                      className="w-full py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 active:scale-95">
                      <Scale className="inline size-3 mr-1" />Add
                    </button>
                  ) : ci ? (
                    <div className="flex items-center gap-1 w-full">
                      <button onClick={() => removeItem(item.name)} className="size-6 rounded-lg bg-muted border border-border flex items-center justify-center active:scale-90"><Minus className="size-3" /></button>
                      <span className="flex-1 text-center text-xs font-bold">{ci.quantity}</span>
                      <button onClick={() => addItem(item)} className="size-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center active:scale-90"><Plus className="size-3" /></button>
                    </div>
                  ) : (
                    <button onClick={() => addItem(item)}
                      className="w-full py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-600 active:scale-95">
                      <Plus className="inline size-3 mr-0.5" />Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── COL 3: Bill panel ────────────────────────────────────────────────── */}
      <div className="w-[30%] shrink-0 flex flex-col border-l border-border bg-card overflow-hidden">

        {/* Bill header */}
        <div className="px-4 py-3 bg-zinc-900 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Receipt className="size-4 text-emerald-400" />
              <span className="font-semibold text-white text-sm">Bill</span>
              <span className="text-[10px] font-mono text-zinc-400">{billNo.current}</span>
            </div>
            {cart.length > 0 && (
              <button onClick={() => setShowCancel(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-900/30 px-2 py-1 rounded-lg">
                <XCircle className="size-3" />Cancel
              </button>
            )}
          </div>

          {/* ── Customer name (mandatory) ── */}
          <div className={cn('rounded-xl border px-3 py-2 bg-white/10',
            customerErr ? 'border-red-400' : 'border-white/20')}>
            <div className="flex items-center gap-2">
              <User className="size-3.5 text-zinc-400 shrink-0" />
              <input
                type="text" placeholder="Customer name *"
                value={customerName}
                onChange={e => { setCustomerName(e.target.value); setCustomerErr(''); }}
                className="flex-1 bg-transparent text-white text-sm font-body placeholder:text-zinc-500 focus:outline-none"
              />
            </div>
            {customerErr && <p className="text-[10px] text-red-400 mt-1">{customerErr}</p>}
          </div>

          {/* Phone (optional, needed for credit) */}
          {payMode === 'credit' && (
            <div className="mt-1.5 rounded-xl border border-white/20 px-3 py-2 bg-white/10">
              <div className="flex items-center gap-2">
                <CreditIcon className="size-3.5 text-zinc-400 shrink-0" />
                <input type="tel" placeholder="Phone (for credit)"
                  value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                  className="flex-1 bg-transparent text-white text-sm font-body placeholder:text-zinc-500 focus:outline-none" />
              </div>
            </div>
          )}

          {allPriced && cart.length > 0 && (
            <div className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2 mt-2">
              <span className="text-xs text-zinc-300">Total</span>
              <span className="font-display text-xl font-bold text-emerald-400 tabular-nums">{fmtMoney(subtotal)}</span>
            </div>
          )}
        </div>

        {/* Cart items */}
        {cart.length > 0 && (
          <div className="flex-1 overflow-y-auto divide-y min-h-0">
            {cart.map(c => (
              <CartLineItem key={c.itemName} item={c}
                onAdd={() => { const i = SNB_ITEMS.find(i => i.name === c.itemName); if (i) addItem(i); }}
                onRemove={() => removeItem(c.itemName)}
                onDelete={() => setCart(prev => prev.filter(x => x.itemName !== c.itemName))}
                onPriceChange={p => updatePrice(c.itemName, p)} />
            ))}
          </div>
        )}

        {cart.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground p-4">
            <Receipt className="size-8 opacity-20" />
            <p className="text-xs font-body text-center">Tap any item to add to bill</p>
          </div>
        )}

        {/* Totals + payment */}
        {cart.length > 0 && (
          <div className="border-t border-border px-4 py-3 space-y-3 bg-muted/10 shrink-0 overflow-y-auto" style={{ maxHeight: '65%' }}>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-semibold tabular-nums text-foreground">{allPriced ? fmtMoney(subtotal) : '—'}</span>
            </div>

            {/* Discount */}
            <div>
              <button onClick={() => setShowDiscount(v => !v)}
                className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition',
                  showDiscount ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-muted border-border text-muted-foreground')}>
                <Tag className="size-3.5" />{showDiscount ? 'Discount Applied' : 'Apply Discount'}
              </button>
              {showDiscount && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex rounded-xl overflow-hidden border bg-muted p-0.5 shrink-0">
                    {(['percent','flat'] as DiscountType[]).map(t => (
                      <button key={t} onClick={() => { setDiscountType(t); setDiscountValue(''); }}
                        className={cn('px-3 py-1 text-[11px] font-bold rounded-lg transition',
                          discountType === t ? 'bg-white shadow text-foreground' : 'text-muted-foreground')}>
                        {t === 'percent' ? '%' : '₹'}
                      </button>
                    ))}
                  </div>
                  <input type="number" inputMode="decimal" min="0"
                    max={discountType === 'percent' ? 100 : subtotal} value={discountValue}
                    onChange={e => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'percent' ? 'e.g. 10' : 'e.g. 50'}
                    className="flex-1 h-9 px-3 rounded-xl border bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
                  {discount > 0 && <span className="text-xs font-bold text-emerald-600 shrink-0">-{fmtMoney(discount)}</span>}
                </div>
              )}
            </div>

            {allPriced && roundOff !== 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Round-Off</span>
                <span className="font-semibold">{roundOff > 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
              </div>
            )}

            {/* Total */}
            <div className={cn('flex items-center justify-between rounded-xl px-4 py-3',
              allPriced ? 'bg-emerald-700 text-white' : 'bg-amber-50 border border-amber-100')}>
              <p className={cn('text-sm font-bold', allPriced ? 'text-white' : 'text-foreground')}>Net Bill</p>
              {allPriced
                ? <span className="font-display text-3xl font-bold tabular-nums">{fmtMoney(finalTotal)}</span>
                : <span className="text-xs text-amber-600 font-medium">⚠ Enter prices</span>}
            </div>

            {/* Payment method */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payment</p>
              <div className="grid grid-cols-4 gap-1.5">
                {PAYMENT_OPTIONS.map(m => (
                  <button key={m.key} onClick={() => { setPayMode('single'); setSingle(m.key); setError(''); }}
                    className={cn('py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 border transition active:scale-95',
                      payMode === 'single' && singleMethod === m.key ? 'bg-emerald-600 text-white border-transparent shadow-md' : 'bg-card border-border')}>
                    {m.icon}{m.label}
                  </button>
                ))}
                <button onClick={() => { setPayMode('credit'); setSingle(null); setError(''); }}
                  className={cn('py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 border transition active:scale-95',
                    payMode === 'credit' ? 'bg-red-600 text-white border-transparent shadow-md' : 'bg-card border-border')}>
                  <CreditIcon className="size-4" />Credit
                </button>
              </div>

              {/* Credit details */}
              {payMode === 'credit' && allPriced && (
                <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-3 space-y-2">
                  <p className="text-xs font-bold text-red-700">Credit Sale Details</p>
                  <div className="relative">
                    <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                    <input type="number" placeholder="Amount paid now (0 for full credit)"
                      value={creditAmountPaid} onChange={e => setCreditAmountPaid(e.target.value)}
                      className="w-full pl-7 pr-2 py-2 rounded-xl bg-white border border-red-200 text-sm font-body focus:outline-none focus:ring-2 focus:ring-red-300" />
                  </div>
                  <div className={cn('flex items-center justify-between rounded-xl px-3 py-2',
                    creditAmt > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>
                    <span className="text-xs font-bold">Credit Amount Due</span>
                    <span className="text-sm font-bold tabular-nums">{fmtMoney(creditAmt)}</span>
                  </div>
                  <input type="date" placeholder="Due date (optional)"
                    value={creditDueDate} onChange={e => setCreditDueDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-red-200 text-sm font-body focus:outline-none focus:ring-2 focus:ring-red-300" />
                  <input type="text" placeholder="Notes (optional)"
                    value={creditNotes} onChange={e => setCreditNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-red-200 text-sm font-body focus:outline-none focus:ring-2 focus:ring-red-300" />
                </div>
              )}

              {/* Split payment */}
              {payMode !== 'credit' && (
                <button onClick={() => { setPayMode('split'); setSingle(null); setSplitMethods([null,null]); setSplitAmounts(['','']); }}
                  className={cn('w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition active:scale-95',
                    payMode === 'split' ? 'bg-violet-600 text-white border-transparent' : 'bg-card border-border text-muted-foreground')}>
                  <ArrowLeftRight className="size-3.5" />Split Payment
                </button>
              )}

              {payMode === 'split' && (
                <div className="rounded-2xl border-2 border-violet-200 bg-violet-50/60 p-3 space-y-3">
                  {([0,1] as const).map(idx => (
                    <div key={idx} className="space-y-1.5">
                      <p className="text-[11px] font-bold text-violet-700">{idx===0?'1st':'2nd'} Payment</p>
                      <div className="grid grid-cols-3 gap-1">
                        {PAYMENT_OPTIONS.map(m => {
                          const blocked = splitMethods[idx===0?1:0] === m.key;
                          const chosen = splitMethods[idx] === m.key;
                          return (
                            <button key={m.key} disabled={blocked}
                              onClick={() => { const n = [...splitMethods] as [PaymentMethod|null,PaymentMethod|null]; n[idx]=m.key; setSplitMethods(n); }}
                              className={cn('py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border-2 transition',
                                chosen ? 'bg-violet-600 text-white border-violet-600' : blocked ? 'opacity-25 border-muted' : 'bg-white border-border')}>
                              {m.icon}{m.label}
                            </button>
                          );
                        })}
                      </div>
                      <input type="number" placeholder="Amount"
                        value={splitAmounts[idx]}
                        onChange={e => {
                          const v = e.target.value; const n = [...splitAmounts] as [string,string]; n[idx] = v;
                          if (!isNaN(parseFloat(v)) && allPriced) {
                            const other = Math.max(0, Math.round((finalTotal - parseFloat(v)) * 100) / 100);
                            n[idx===0?1:0] = String(other);
                          }
                          setSplitAmounts(n);
                        }}
                        disabled={!splitMethods[idx]}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-violet-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-40" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2.5 rounded-xl">{error}</p>
            )}

            <button onClick={doCheckout} disabled={submitting || !allPriced}
              className="w-full py-3.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition shadow-md"
              style={{ background: COLORS.gradient }}>
              {submitting
                ? <><Loader2 className="size-4 animate-spin" />Processing…</>
                : <><Printer className="size-4" />Print & Confirm</>}
            </button>
          </div>
        )}
      </div>

      {/* Cancel dialog */}
      {showCancel && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center p-4" onClick={() => setShowCancel(false)}>
          <div className="bg-card rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="size-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="size-7 text-destructive" />
              </div>
              <h3 className="font-display text-lg font-bold">Cancel Order?</h3>
              <p className="text-sm text-muted-foreground">All items will be removed from the bill.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowCancel(false)} className="py-3 rounded-xl border bg-muted text-sm font-semibold">Keep</button>
              <button onClick={() => { resetCart(); setShowCancel(false); }} className="py-3 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main HosurDashboard ──────────────────────────────────────────────────────

export default function HosurDashboard() {
  const { stock, sales, incoming, advanceOrders, creditSales, loading,
    fetchBranchData, syncIncomingFromDispatches, fetchCreditSales, cleanOldData, seedBranchItems,
    fetchStockMismatches, stockMismatches } = useBranchStore();

  const [tab, setTab] = useState<HosurTab>('bill');
  const initRef = useRef(false);

  const branchStock    = stock[BRANCH]          || [];
  const branchIncoming = incoming[BRANCH]        || [];
  const branchCredit   = (creditSales?.[BRANCH] || []).filter((c): c is NonNullable<typeof c> => c != null);
  const branchSales    = sales[BRANCH]           || [];

  useEffect(() => {
    fetchBranchData(BRANCH);
    fetchCreditSales?.(BRANCH);
    if (!initRef.current) {
      initRef.current = true;
      syncIncomingFromDispatches(BRANCH);
      seedBranchItems(BRANCH);
      cleanOldData();
      fetchStockMismatches();
    }
    const id = setInterval(() => { fetchBranchData(BRANCH); fetchCreditSales?.(BRANCH); }, 30_000);
    return () => clearInterval(id);
  }, []);

  const todayStr = new Date().toDateString();
  const todaySales = branchSales.filter(s => new Date(s.soldAt).toDateString() === todayStr);

  const unconfirmedCount = branchIncoming.filter(i => !i.confirmed).length;
  const hosurMismatches  = stockMismatches.filter(m => m.branch === BRANCH);
  // alertCount retained for potential future use
  const _alertCount       = unconfirmedCount + hosurMismatches.length;
  const pendingCredit    = branchCredit.filter(c => c.status !== 'settled').length;

  const TABS: { id: HosurTab; label: string; icon: React.ElementType; badge?: number; badgeColor?: string }[] = [
    { id: 'bill',    label: 'Bill',    icon: Receipt },
    { id: 'confirm', label: 'Stock',   icon: CheckCheck,    badge: unconfirmedCount, badgeColor: 'bg-emerald-500' },
    { id: 'credit',  label: 'Credit',  icon: CreditIcon,    badge: pendingCredit,    badgeColor: 'bg-orange-500' },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <div className="bg-background pt-14 pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b bg-emerald-50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-emerald-700">Hosur Branch</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}
            </p>
          </div>
          <button onClick={() => { fetchBranchData(BRANCH); fetchCreditSales?.(BRANCH); }}
            className="p-2 rounded-xl bg-emerald-100 text-emerald-700 active:scale-90 transition">
            <RefreshCw className="size-4" />
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="font-display text-xl font-bold text-foreground tabular-nums">{todaySales.length}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mt-0.5">Sold Today</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="font-display text-xl font-bold text-orange-600 tabular-nums">{pendingCredit}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mt-0.5">Open Credit</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className={cn('font-display text-xl font-bold tabular-nums', unconfirmedCount > 0 ? 'text-amber-600' : 'text-emerald-600')}>{unconfirmedCount}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase mt-0.5">Pending Stock</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex bg-muted border-b border-border px-2 py-1.5 gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-bold transition-all relative',
              tab === t.id ? 'bg-card shadow text-foreground' : 'text-muted-foreground active:scale-95')}>
            <t.icon className="size-4" />
            {t.label}
            {(t.badge ?? 0) > 0 && (
              <span className={cn('absolute -top-0.5 -right-0.5 size-4 flex items-center justify-center rounded-full text-white text-[8px] font-bold', t.badgeColor ?? 'bg-red-500')}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bill tab — full height, no padding */}
      <div className={cn(tab !== 'bill' && 'hidden')}>
        <BillPanel branchStock={branchStock} />
      </div>

      {/* Other tabs — padded scroll */}
      {tab !== 'bill' && (
        <div className="px-4 pt-4 overflow-y-auto" style={{ height: 'calc(100dvh - 260px)' }}>
          {tab === 'confirm' && <ConfirmStockTab branchIncoming={branchIncoming} />}
          {tab === 'credit'  && <CreditTab creditSales={branchCredit} />}
          {tab === 'history' && <HosurHistoryTab />}
        </div>
      )}
    </div>
  );
}
