// src/branch/tabs/BillTab.tsx
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Loader2, Receipt,
  IndianRupee, Banknote, Smartphone, CreditCard, Search, X, Scale,
  Hash, Pencil, ArrowLeftRight, Tag, Printer, XCircle, AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from '../branchStore';
import { useAuthStore } from '@/stores/authStore';
import type { Branch } from '../types';
import { BRANCH_COLORS } from '../types';
import type { StockItem } from '../branchStore';
import type { StockMismatch } from '../branchStore';
import { SNB_ITEMS, SNB_CATEGORIES } from '../snbItems';
import type { SnbItem, SnbCategory } from '../snbItems';
import { VRSNB_ITEMS, VRSNB_CATEGORIES } from '../vrsnbItems';
import type { VrsnbItem, VrsnbCategory } from '../vrsnbItems';

// ─── Types ────────────────────────────────────────────────────────────────────

type SellUnit      = 'pcs' | 'kg';
type PaymentMethod = 'cash' | 'upi' | 'card';
type DiscountType  = 'percent' | 'flat';

interface CartItem {
  itemName:  string;
  quantity:  number;
  sellUnit:  SellUnit;
  price:     number | null;
  lineTotal: number | null;
}

interface Props { branch: Branch; branchStock: StockItem[]; advanceOrders?: import('../branchStore').BranchAdvanceOrder[] }

// ─── Constants ────────────────────────────────────────────────────────────────

const SNB_BRANCHES: Branch[] = ['SNB', 'Hosur', 'VRSNB'];

const SNB_INFO = {
  name:    'Sri Nanjundeshwara Bakery',
  address: '404, Bagalur Main Road, Berigai Bus Stand,\nBerigai, Shoolagiri Taluk,\nKrishnagiri, Tamil Nadu. Hosur-635105',
  phone:   '9942266779, 9095445444',
  gstin:   '33AMTPR1760M1ZF',
};

const VRSNB_INFO = {
  name:    'VRSNB FOODS LLP',
  address: '#109/1C, Hosur main Road, Berigai,\nSoolagiri TK, Krishnagiri DT,\nTamilnadu 635105',
  gstin:   '33AAZFV1266C1ZZ',
  fssai:   '12425011000098',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const fmtNum = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatQty(qty: number, unit: SellUnit) {
  if (unit === 'kg') return qty >= 1 ? `${qty}` : `${qty}`;
  return `${qty}.00`;
}

function detectSellUnit(name: string): SellUnit {
  const lower = name.toLowerCase();
  const kws   = ['mysore pak','burfi','halwa','laadu','ladoo','chikki','mixture',
    'muruk','murukku','boondhi','pakoda','chips','cashew','groundnut','biscuit',
    'cookie','soan papdi','chana dal','mix dal','nippat','kachori','samosa',
    'oppat','jelabi','jangiri','badusha'];
  return kws.some((k) => lower.includes(k)) ? 'kg' : 'pcs';
}

function generateBillNo() {
  const d = new Date();
  return `CA-${d.getFullYear().toString().slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(1000+Math.random()*9000)}`;
}

// ─── Print Bill ───────────────────────────────────────────────────────────────

interface PrintArgs {
  branch: Branch; billNo: string; items: CartItem[];
  subtotal: number; discount: number; discountType: DiscountType;
  discountValue: string; roundOff: number; finalTotal: number;
  cgst: number; sgst: number;
  payMode: 'single'|'split'; singleMethod: PaymentMethod|null;
  splitMethods: [PaymentMethod|null, PaymentMethod|null];
  splitAmounts: [string,string]; soldBy: string;
}

function printBill(args: PrintArgs) {
  const { branch, billNo, items, subtotal, discount, discountType,
    discountValue, roundOff, finalTotal, cgst, sgst, payMode, singleMethod,
    splitMethods, splitAmounts, soldBy } = args;

  const isSNB = SNB_BRANCHES.includes(branch);
  const now   = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g, '/');
  const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12: true });

  const payLabel = payMode === 'single'
    ? (singleMethod ?? 'cash').charAt(0).toUpperCase() + (singleMethod ?? 'cash').slice(1)
    : [
        splitMethods[0] ? `${splitMethods[0].charAt(0).toUpperCase()+splitMethods[0].slice(1)}: ₹${splitAmounts[0]}` : '',
        splitMethods[1] ? `${splitMethods[1].charAt(0).toUpperCase()+splitMethods[1].slice(1)}: ₹${splitAmounts[1]}` : '',
      ].filter(Boolean).join(' + ');

  const totalQty = items.reduce((s,i) => s + i.quantity, 0);

  const isVRSNB_print = branch === 'VRSNB';

  // ── SNB / Hosur format ─────────────────────────────────────────────────────
  if (isSNB && !isVRSNB_print) {
    const addrLines = SNB_INFO.address.split('\n').map(l => `<div>${l}</div>`).join('');
    const rows = items.map((item, idx) => `
      <tr>
        <td class="sn">${idx+1}</td>
        <td class="name">${item.itemName}</td>
        <td class="num">${formatQty(item.quantity, item.sellUnit)}</td>
        <td class="num">${item.price != null ? fmtNum(item.price) : '—'}</td>
        <td class="num">${item.lineTotal != null ? fmtNum(item.lineTotal) : '—'}</td>
      </tr>`).join('');

    const payRows = payMode === 'single'
      ? `<tr><td class="lab">${payLabel}</td><td class="num">${fmtNum(finalTotal)}</td></tr>`
      : `${splitMethods[0] ? `<tr><td class="lab">${splitMethods[0].charAt(0).toUpperCase()+splitMethods[0].slice(1)}</td><td class="num">${fmtNum(parseFloat(splitAmounts[0])||0)}</td></tr>` : ''}
         ${splitMethods[1] ? `<tr><td class="lab">${splitMethods[1].charAt(0).toUpperCase()+splitMethods[1].slice(1)}</td><td class="num">${fmtNum(parseFloat(splitAmounts[1])||0)}</td></tr>` : ''}`;

    const html = `<!DOCTYPE html><html><head><title>Tax Invoice – ${billNo}</title>
    <style>
      @page { margin: 8mm; size: 80mm auto; }
      * { box-sizing: border-box; }
      body { font-family: 'Arial', sans-serif; font-size: 11px; color: #000; max-width: 300px; margin: 0 auto; padding: 8px; }
      .center { text-align: center; }
      .bold { font-weight: bold; }
      hr { border: none; border-top: 1px dashed #666; margin: 6px 0; }
      hr.solid { border-top: 1px solid #000; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 2px 2px; vertical-align: top; }
      .sn  { width: 16px; color: #555; }
      .name { }
      .num { text-align: right; white-space: nowrap; }
      .lab { }
      .th  { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 3px; }
      .net { font-size: 13px; font-weight: bold; }
    </style></head><body>
    <div class="center bold" style="font-size:14px">${SNB_INFO.name}</div>
    <div class="center" style="margin-top:3px">${addrLines}</div>
    <div class="center">Phone: ${SNB_INFO.phone}</div>
    <div class="center">GSTIN : ${SNB_INFO.gstin}</div>
    <hr class="solid"/>
    <div class="center bold" style="font-size:12px">TAX INVOICE</div>
    <hr/>
    <table><tr>
      <td>Bill No : <span class="bold">${billNo}</span></td>
      <td class="num">Date : ${dateStr}</td>
    </tr><tr>
      <td></td>
      <td class="num">Time : ${timeStr}</td>
    </tr></table>
    <hr/>
    <table>
      <thead><tr>
        <td class="th sn">Sn</td>
        <td class="th name">Item Name</td>
        <td class="th num">Qty</td>
        <td class="th num">Rate</td>
        <td class="th num">Amount</td>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="border-top:1px solid #000">
        <td></td>
        <td class="bold">Total</td>
        <td class="num bold">${fmtNum(totalQty)}</td>
        <td></td>
        <td class="num bold">${fmtNum(subtotal)}</td>
      </tr></tfoot>
    </table>
    <hr/>
    <table>
      <tr><td class="lab">Discount Amt :</td><td class="num">${fmtNum(discount)}</td></tr>
      <tr><td class="lab">Delivery Charges:</td><td class="num">.00</td></tr>
      <tr><td class="lab">GST:</td><td class="num">.00</td></tr>
      <tr><td class="lab">Round-Off :</td><td class="num">${roundOff >= 0 ? '' : '-'}${Math.abs(roundOff).toFixed(0)}</td></tr>
    </table>
    <hr class="solid"/>
    <table><tr>
      <td class="net">Net Bill Amount :</td>
      <td class="net num">Rs. ${fmtNum(finalTotal)}</td>
    </tr></table>
    <hr/>
    <div class="bold" style="margin-bottom:3px">Payment Details</div>
    <table>${payRows}</table>
    <hr/>
    <div class="center bold">Staff Name : ${soldBy}</div>
    <div class="center bold" style="margin-top:5px;font-size:12px">Thank you, Visit Again</div>
    <div class="center" style="margin-top:2px">Including all taxes</div>
    <script>window.onload=()=>window.print();</script>
    </body></html>`;

    const w = window.open('','_blank','width=380,height=650');
    if (w) { w.document.write(html); w.document.close(); }
    return;
  }

  // ── VRSNB FOODS LLP format (matches physical receipt) ─────────────────────
  if (isVRSNB_print) {
    const addrLines = VRSNB_INFO.address.split('\n').map(l => `<div>${l}</div>`).join('');
    const totalQtyVR = items.reduce((s,i) => s + i.quantity, 0);
    const rows = items.map((item, idx) => `
      <tr>
        <td class="name">${item.itemName}</td>
        <td class="num">${item.sellUnit === 'kg' ? (item.quantity < 1 ? `${Math.round(item.quantity*1000)}g` : `${item.quantity}kg`) : item.quantity}</td>
        <td class="num">${item.price != null ? fmtNum(item.price) : '—'}</td>
        <td class="num">${item.lineTotal != null ? fmtNum(item.lineTotal) : '—'}</td>
      </tr>`).join('');

    const payLabel2 = payMode === 'single'
      ? (singleMethod ?? 'cash').charAt(0).toUpperCase() + (singleMethod ?? 'cash').slice(1)
      : [
          splitMethods[0] ? splitMethods[0].charAt(0).toUpperCase()+splitMethods[0].slice(1) : '',
          splitMethods[1] ? splitMethods[1].charAt(0).toUpperCase()+splitMethods[1].slice(1) : '',
        ].filter(Boolean).join(' + ');

    const discountedBase2 = Math.round((subtotal - discount) * 100) / 100;

    const html = `<!DOCTYPE html><html><head><title>Bill – ${billNo}</title>
    <style>
      @page { margin: 8mm; size: 80mm auto; }
      * { box-sizing: border-box; }
      body { font-family: 'Arial', sans-serif; font-size: 11px; color: #000; max-width: 300px; margin: 0 auto; padding: 8px; }
      .center { text-align: center; }
      .bold { font-weight: bold; }
      hr { border: none; border-top: 1px dashed #666; margin: 6px 0; }
      hr.solid { border-top: 1px solid #000; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 2px 2px; vertical-align: top; }
      .name { } .num { text-align: right; white-space: nowrap; }
      .th { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 3px; }
      .net { font-size: 13px; font-weight: bold; }
    </style></head><body>
    <div class="center bold" style="font-size:11px">PAID</div>
    <div class="center bold" style="font-size:14px;margin-top:2px">${VRSNB_INFO.name}</div>
    <div class="center" style="margin-top:3px">${addrLines}</div>
    <div class="center">GST NO: ${VRSNB_INFO.gstin}</div>
    <div class="center">FSSAI NO: ${VRSNB_INFO.fssai}</div>
    <hr class="solid"/>
    <table><tr>
      <td>Name: </td>
    </tr><tr>
      <td>Date: <span class="bold">${dateStr}</span></td>
      <td class="num bold">Pick Up</td>
    </tr><tr>
      <td>${timeStr}</td>
    </tr><tr>
      <td>Cashier: ${soldBy}</td>
      <td class="num">Bill No.: <span class="bold">${billNo.split('-').pop()}</span></td>
    </tr></table>
    <hr/>
    <table>
      <thead><tr>
        <td class="th name">Item</td>
        <td class="th num">Qty.</td>
        <td class="th num">Price</td>
        <td class="th num">Amount</td>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="border-top:1px solid #000;margin-top:4px">
        <td class="bold">Total Qty: ${totalQtyVR}</td>
        <td></td>
        <td class="num">Sub Total</td>
        <td class="num bold">${fmtNum(discountedBase2)}</td>
      </tr></tfoot>
    </table>
    <hr class="solid"/>
    <table><tr>
      <td colspan="3" class="net">Grand Total</td>
      <td class="net num">&#8377;${fmtNum(finalTotal)}</td>
    </tr></table>
    <div style="font-size:10px;padding:2px 0">Paid via ${payLabel2}</div>
    <hr/>
    <div class="center bold" style="margin-top:4px">Thank You &amp; Visit Again...!!!</div>
    <script>window.onload=()=>window.print();</script>
    </body></html>`;

    const w = window.open('','_blank','width=380,height=650');
    if (w) { w.document.write(html); w.document.close(); }
    return;
  }

  // ── Café Aadvikam format (other cafe branches) ────────────────────────────
  const cafeInfo = { name: 'Café Aadvikam', addr: '109 Bagalur Main Road, Berikai', gst: '', fssai: '' };

  const addrDiv = cafeInfo.addr.split('\n').map(l => `<div style="font-size:10px;color:#555">${l}</div>`).join('');
  const discountedBase = Math.round((subtotal - discount) * 100) / 100;

  const rows = items.map((item) => `
    <tr>
      <td style="padding:5px 4px;font-size:12px;border-bottom:1px solid #f0f0f0">${item.itemName}</td>
      <td style="padding:5px 4px;font-size:12px;text-align:center;border-bottom:1px solid #f0f0f0">${item.sellUnit === 'kg' ? (item.quantity < 1 ? `${Math.round(item.quantity*1000)}g` : `${item.quantity}kg`) : `×${item.quantity}`}</td>
      <td style="padding:5px 4px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0">${item.price != null ? fmt(item.price) : '—'}</td>
      <td style="padding:5px 4px;font-size:12px;text-align:right;font-weight:600;border-bottom:1px solid #f0f0f0">${item.lineTotal != null ? fmt(item.lineTotal) : '—'}</td>
    </tr>`).join('');

  const discRow = discount > 0 ? `
    <tr><td colspan="3" style="padding:4px;font-size:12px;text-align:right;color:#16a34a">Discount ${discountType==='percent'?`(${discountValue}%)`:'(Flat)'}</td>
        <td style="padding:4px;font-size:12px;text-align:right;color:#16a34a">-${fmt(discount)}</td></tr>` : '';

  const html = `<!DOCTYPE html><html><head><title>Bill – ${billNo}</title>
  <style>
    @page { margin:10mm; size:80mm auto; }
    body { font-family:'Courier New',monospace; color:#111; max-width:320px; margin:0 auto; padding:12px; }
    .center { text-align:center; } .dashed { border:none; border-top:1px dashed #ccc; margin:8px 0; }
    table { width:100%; border-collapse:collapse; }
  </style></head><body>
  <div class="center">
    <p style="margin:0;font-size:11px;font-weight:700">PAID</p>
    <h2 style="margin:2px 0;font-size:16px;font-weight:700;letter-spacing:1px">${cafeInfo.name}</h2>
    ${addrDiv}
    ${cafeInfo.gst ? `<div style="font-size:10px;color:#555">GST No: ${cafeInfo.gst}</div>` : ''}
    ${cafeInfo.fssai ? `<div style="font-size:10px;color:#555">FSSAI No: ${cafeInfo.fssai}</div>` : ''}
  </div>
  <hr class="dashed"/>
  <table><tr>
    <td style="font-size:10px">Date: <b>${dateStr}</b></td>
    <td style="font-size:10px;text-align:right">Pick Up</td>
  </tr><tr>
    <td style="font-size:10px">${timeStr}</td>
    <td style="font-size:10px;text-align:right">Bill No.: <b>${billNo.split('-').pop()}</b></td>
  </tr><tr>
    <td style="font-size:10px">Cashier: ${soldBy}</td>
  </tr></table>
  <hr class="dashed"/>
  <table><thead><tr>
    <th style="text-align:left;font-size:10px;padding:3px;color:#666">Item</th>
    <th style="text-align:center;font-size:10px;padding:3px;color:#666">Qty</th>
    <th style="text-align:right;font-size:10px;padding:3px;color:#666">Price</th>
    <th style="text-align:right;font-size:10px;padding:3px;color:#666">Amount</th>
  </tr></thead><tbody>${rows}</tbody></table>
  <hr class="dashed"/>
  <table>
    <tr><td colspan="2" style="font-size:11px;padding:3px;text-align:left">Total Qty: ${totalQty}</td>
        <td style="font-size:11px;padding:3px;text-align:right">Sub Total</td>
        <td style="font-size:11px;padding:3px;text-align:right;font-weight:600">${fmtNum(discountedBase)}</td></tr>
    ${discRow}
  </table>
  <hr class="dashed"/>
  <table><tr>
    <td colspan="3" style="font-size:13px;font-weight:700;padding:6px 3px">Grand Total</td>
    <td style="text-align:right;font-size:16px;font-weight:700;padding:6px 3px">&#8377;${fmtNum(finalTotal)}</td>
  </tr></table>
  <div style="font-size:10px;padding:3px">Paid via ${payLabel}</div>
  <hr class="dashed"/>
  <div class="center" style="font-weight:700;margin-top:4px">Thank You &amp; Visit Again...!!!</div>
  <script>window.onload=()=>window.print();</script>
  </body></html>`;

  const w = window.open('','_blank','width=380,height=580');
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── KgInput ──────────────────────────────────────────────────────────────────

function KgInput({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  const [raw, setRaw] = useState(String(value));
  const PRESETS = [0.1, 0.25, 0.5, 1, 2];
  const commit = (s: string) => {
    const n = parseFloat(s);
    if (!isNaN(n) && n > 0 && n <= max) onChange(Math.round(n * 1000) / 1000);
    else setRaw(String(value));
  };
  useEffect(() => setRaw(String(value)), [value]);
  return (
    <div className="space-y-2 pt-0.5">
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map((p) => (
          <button key={p} onClick={() => { onChange(p); setRaw(String(p)); }} disabled={p > max}
            className={cn('px-2 py-0.5 rounded-lg text-[10px] font-bold border transition active:scale-95',
              value === p ? 'bg-primary text-primary-foreground border-transparent'
                         : 'bg-muted border-border text-foreground disabled:opacity-30')}>
            {p < 1 ? `${p * 1000}g` : `${p}kg`}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Scale className="size-3.5 text-muted-foreground shrink-0" />
        <input type="number" inputMode="decimal" step="0.05" min="0.05" max={max} value={raw}
          onChange={(e) => setRaw(e.target.value)} onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit(raw)}
          className="flex-1 h-8 px-3 rounded-lg border bg-background text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="e.g. 0.500" />
        <span className="text-xs text-muted-foreground shrink-0">kg</span>
      </div>
      <p className="text-[10px] text-muted-foreground">Max: {max >= 1 ? `${max} kg` : `${Math.round(max * 1000)}g`}</p>
    </div>
  );
}

// ─── InlinePriceInput ─────────────────────────────────────────────────────────

function InlinePriceInput({ unit, value, onChange }: { unit: SellUnit; value: number | null; onChange: (v: number | null) => void }) {
  const [editing, setEditing] = useState(value == null);
  const [raw, setRaw]         = useState(value != null ? String(value) : '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const commit = () => {
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 0) { onChange(n); setEditing(false); }
    else { setRaw(value != null ? String(value) : ''); setEditing(false); }
  };
  if (!editing && value != null) return (
    <button onClick={() => setEditing(true)}
      className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition">
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
        className="w-20 h-6 px-2 rounded-md border bg-amber-50 border-amber-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-amber-400" />
    </div>
  );
}

// ─── ItemCard ─────────────────────────────────────────────────────────────────

function ItemCard({ item, inCart, cartQty, onAdd, onRemove, onKgChange, colors }: {
  item: StockItem; inCart: boolean; cartQty: number;
  onAdd: () => void; onRemove: () => void; onKgChange: (v: number) => void;
  colors: { bg: string; text: string; badge: string };
}) {
  const unit = detectSellUnit(item.itemName);
  return (
    <div className={cn('relative bg-card border rounded-2xl p-3 flex flex-col gap-2 transition-all duration-150',
      inCart ? 'border-primary/40 shadow-md ring-1 ring-primary/10 bg-primary/[0.02]' : 'border-border')}>
      {inCart && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary animate-pulse" />}
      <div className="pr-4">
        <p className="text-sm font-semibold leading-snug line-clamp-2">{item.itemName}</p>
        <div className="flex items-center gap-2 mt-1">
          {item.price != null
            ? <span className="text-[11px] font-bold text-emerald-600">₹{item.price}{unit === 'kg' ? '/kg' : ''}</span>
            : <span className="text-[10px] text-amber-500 font-medium">Set price ↓</span>}
          <span className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground">
            {unit === 'kg'
              ? <><Scale className="size-3" />{item.quantity >= 1 ? `${item.quantity}kg` : `${Math.round(item.quantity * 1000)}g`}</>
              : <><Hash className="size-3" />{item.quantity}</>}
          </span>
        </div>
      </div>
      {unit === 'kg' && inCart ? (
        <KgInput value={cartQty} onChange={onKgChange} max={item.quantity} />
      ) : unit === 'kg' ? (
        <button onClick={onAdd}
          className={cn('w-full py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition active:scale-95', colors.bg, colors.text)}>
          <Scale className="size-3" /> Weigh & Add
        </button>
      ) : inCart ? (
        <div className="flex items-center gap-2 justify-between">
          <button onClick={onRemove} className="size-8 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition"><Minus className="size-3.5" /></button>
          <span className="text-sm font-bold tabular-nums">{cartQty}</span>
          <button onClick={onAdd} disabled={cartQty >= item.quantity}
            className="size-8 rounded-xl cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90 disabled:opacity-40 transition"><Plus className="size-3.5" /></button>
        </div>
      ) : (
        <button onClick={onAdd}
          className={cn('w-full py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition active:scale-95', colors.bg, colors.text)}>
          <Plus className="size-3" /> Add
        </button>
      )}
    </div>
  );
}

// ─── SnbItemCard — for SNB/Hosur price-list items ────────────────────────────

function SnbItemCard({ item, inCart, cartQty, stockQty, onAdd, onRemove, onKgChange, colors }: {
  item: SnbItem; inCart: boolean; cartQty: number; stockQty: number;
  onAdd: () => void; onRemove: () => void; onKgChange: (v: number) => void;
  colors: { bg: string; text: string; badge: string };
}) {
  const unit: SellUnit = item.uom === 'Kgs' ? 'kg' : 'pcs';
  const noStock  = stockQty <= 0;
  const overStock = inCart && cartQty > stockQty && stockQty > 0;
  return (
    <div className={cn('relative bg-card border rounded-2xl p-3 flex flex-col gap-2 transition-all duration-150',
      inCart ? 'border-primary/40 shadow-md ring-1 ring-primary/10 bg-primary/[0.02]' : 'border-border')}>
      {inCart && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary animate-pulse" />}
      <div className="pr-4">
        <p className="text-sm font-semibold leading-snug line-clamp-2">{item.name}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] font-bold text-emerald-600">
            ₹{item.price}{unit === 'kg' ? '/kg' : ''}
          </span>
          {/* Stock indicator */}
          {noStock
            ? <span className="ml-auto text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">No stock</span>
            : <span className="ml-auto text-[9px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                {unit === 'kg'
                  ? stockQty >= 1 ? `${stockQty}kg` : `${Math.round(stockQty * 1000)}g`
                  : `${stockQty} pcs`} avail
              </span>
          }
        </div>
        {/* Over-stock warning — shown but sale still allowed */}
        {overStock && (
          <p className="text-[9px] text-amber-600 font-semibold mt-0.5 flex items-center gap-1">
            ⚠ Exceeds stock — mismatch will be logged
          </p>
        )}
      </div>
      {unit === 'kg' && inCart ? (
        <KgInput value={cartQty} onChange={onKgChange} max={999} />
      ) : unit === 'kg' ? (
        <button onClick={onAdd}
          className={cn('w-full py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition active:scale-95', colors.bg, colors.text)}>
          <Scale className="size-3" /> Weigh & Add
        </button>
      ) : inCart ? (
        <div className="flex items-center gap-2 justify-between">
          <button onClick={onRemove} className="size-8 rounded-xl bg-muted flex items-center justify-center active:scale-90 transition"><Minus className="size-3.5" /></button>
          <span className={cn('text-sm font-bold tabular-nums', overStock && 'text-amber-600')}>{cartQty}</span>
          {/* Always allow adding — no disabled, just colour-coded */}
          <button onClick={onAdd}
            className={cn('size-8 rounded-xl text-primary-foreground flex items-center justify-center active:scale-90 transition',
              overStock ? 'bg-amber-500' : 'cafe-gradient')}><Plus className="size-3.5" /></button>
        </div>
      ) : (
        <button onClick={onAdd}
          className={cn('w-full py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition active:scale-95', colors.bg, colors.text)}>
          <Plus className="size-3" /> Add
        </button>
      )}
    </div>
  );
}

// ─── CartLineItem ─────────────────────────────────────────────────────────────

function CartLineItem({ item, stockQty, onAdd, onRemove, onDelete, onPriceChange, isSNB = false }: {
  item: CartItem; stockQty: number; isSNB?: boolean;
  onAdd: () => void; onRemove: () => void; onDelete: () => void;
  onPriceChange: (p: number | null) => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold truncate leading-snug">{item.itemName}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono">
            {item.sellUnit === 'kg'
              ? (item.quantity < 1 ? `${Math.round(item.quantity*1000)}g` : `${item.quantity}kg`)
              : `×${item.quantity}`}
          </span>
          <span className="text-[10px] text-muted-foreground">×</span>
          <InlinePriceInput unit={item.sellUnit} value={item.price} onChange={onPriceChange} />
        </div>
        {item.lineTotal != null
          ? <p className="text-sm font-bold text-primary tabular-nums">= {fmt(item.lineTotal)}</p>
          : <p className="text-[11px] text-amber-500">Enter price above to calculate</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0 pt-0.5">
        {item.sellUnit === 'pcs' && (
          <>
            <button onClick={onRemove} className="size-7 rounded-lg bg-muted flex items-center justify-center active:scale-90 transition"><Minus className="size-3" /></button>
            <span className="w-5 text-center text-xs font-bold tabular-nums">{item.quantity}</span>
            {/* SNB: no stock cap — can sell any quantity */}
            <button onClick={onAdd} disabled={!isSNB && item.quantity >= stockQty}
              className="size-7 rounded-lg cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90 disabled:opacity-40 transition"><Plus className="size-3" /></button>
          </>
        )}
        {item.sellUnit === 'kg' && (
          <span className="text-xs font-semibold text-muted-foreground px-1">
            {item.quantity < 1 ? `${Math.round(item.quantity*1000)}g` : `${item.quantity}kg`}
          </span>
        )}
        <button onClick={onDelete}
          className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 transition ml-0.5"><Trash2 className="size-3" /></button>
      </div>
    </div>
  );
}

// ─── Cancel Confirm Dialog ────────────────────────────────────────────────────

function CancelDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center text-center gap-3">
          <div className="size-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="size-7 text-destructive" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold">Cancel Order?</h3>
            <p className="text-sm text-muted-foreground mt-1">All items in the cart will be removed.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button onClick={onClose} className="py-3 rounded-xl border bg-muted text-sm font-semibold active:scale-95 transition">Keep Order</button>
          <button onClick={onConfirm} className="py-3 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold active:scale-95 transition">Cancel Order</button>
        </div>
      </div>
    </div>
  );
}

// ─── Bill Preview Sheet ───────────────────────────────────────────────────────

function BillPreviewSheet({ branch, billNo, items, subtotal, discount, discountType, discountValue,
  roundOff, finalTotal, payMode, singleMethod, splitMethods, splitAmounts, soldBy, onClose, onConfirmPrint }: {
  branch: Branch; billNo: string; items: CartItem[]; subtotal: number;
  discount: number; discountType: DiscountType; discountValue: string;
  roundOff: number; finalTotal: number; payMode: 'single'|'split';
  singleMethod: PaymentMethod|null;
  splitMethods: [PaymentMethod|null, PaymentMethod|null];
  splitAmounts: [string,string]; soldBy: string;
  onClose: () => void; onConfirmPrint: () => void;
}) {
  const isSNB    = SNB_BRANCHES.includes(branch);
  const now      = new Date();
  const totalQty = items.reduce((s,i) => s + i.quantity, 0);

  const payLabel = payMode === 'single'
    ? (singleMethod ?? 'cash').charAt(0).toUpperCase() + (singleMethod ?? 'cash').slice(1)
    : [
        splitMethods[0] ? `${splitMethods[0].charAt(0).toUpperCase()+splitMethods[0].slice(1)} ${fmt(parseFloat(splitAmounts[0])||0)}` : '',
        splitMethods[1] ? `${splitMethods[1].charAt(0).toUpperCase()+splitMethods[1].slice(1)} ${fmt(parseFloat(splitAmounts[1])||0)}` : '',
      ].filter(Boolean).join(' + ');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className="bg-card w-full rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Bill Preview</h2>
            <span className="text-[10px] font-mono text-muted-foreground">{billNo}</span>
          </div>
          <button onClick={onClose} className="size-8 rounded-xl bg-muted flex items-center justify-center"><X className="size-4" /></button>
        </div>

        {/* Receipt */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="bg-white border rounded-2xl overflow-hidden shadow-sm mx-auto" style={{ maxWidth: 320, fontFamily: "'Courier New', monospace", fontSize: 11 }}>

            {/* Header band */}
            <div className="text-center py-4 px-4" style={{ background: '#1a1a1a', color: '#fff' }}>
              {isSNB ? (
                <>
                  <p style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: 0.5, margin: 0 }}>{SNB_INFO.name}</p>
                  {SNB_INFO.address.split('\n').map((l,i) => <p key={i} style={{ color: '#aaa', fontSize: 10, margin: '2px 0' }}>{l}</p>)}
                  <p style={{ color: '#aaa', fontSize: 10, margin: '2px 0' }}>Phone: {SNB_INFO.phone}</p>
                  <p style={{ color: '#ccc', fontSize: 10, margin: '2px 0' }}>GSTIN: {SNB_INFO.gstin}</p>
                  <p style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: 2, marginTop: 8 }}>TAX INVOICE</p>
                </>
              ) : (
                <>
                  <p style={{ fontWeight: 700, fontSize: 16, letterSpacing: 1, margin: 0 }}>CAFE AADVIKAM</p>
                  <p style={{ color: '#aaa', fontSize: 10, margin: '3px 0' }}>{branch} Branch</p>
                  <p style={{ color: '#aaa', fontSize: 10, margin: 0 }}>109 Bagalur Main Road, Berikai</p>
                </>
              )}
            </div>

            {/* Meta */}
            <div className="px-4 py-2.5" style={{ borderBottom: '1px dashed #ccc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span style={{ color: '#555' }}>Bill No: <strong style={{ color: '#111' }}>{billNo}</strong></span>
                <span style={{ color: '#555' }}>{branch}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 2 }}>
                <span style={{ color: '#555' }}>
                  {now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
                <span style={{ color: '#555' }}>
                  {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </span>
              </div>
              <div style={{ fontSize: 10, marginTop: 2, color: '#555' }}>Staff: <strong style={{ color: '#111' }}>{soldBy}</strong></div>
            </div>

            {/* Items table */}
            <div className="px-4 py-2">
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: isSNB ? '14px 1fr 36px 44px 44px' : '1fr 36px 44px 44px', gap: 2, fontSize: 9, color: '#666', fontFamily: 'sans-serif', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid #ddd', paddingBottom: 4, marginBottom: 4 }}>
                {isSNB && <span>Sn</span>}
                <span>Item</span>
                <span style={{ textAlign: 'center' }}>Qty</span>
                <span style={{ textAlign: 'right' }}>Rate</span>
                <span style={{ textAlign: 'right' }}>Amt</span>
              </div>

              {/* Rows */}
              {items.map((item, idx) => (
                <div key={item.itemName} style={{ display: 'grid', gridTemplateColumns: isSNB ? '14px 1fr 36px 44px 44px' : '1fr 36px 44px 44px', gap: 2, fontSize: 10, padding: '2px 0', color: '#111' }}>
                  {isSNB && <span style={{ color: '#888' }}>{idx+1}</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.itemName}</span>
                  <span style={{ textAlign: 'center' }}>{formatQty(item.quantity, item.sellUnit)}</span>
                  <span style={{ textAlign: 'right' }}>{item.price != null ? fmtNum(item.price) : '—'}</span>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{item.lineTotal != null ? fmtNum(item.lineTotal) : '—'}</span>
                </div>
              ))}

              {/* Qty total row (SNB style) */}
              {isSNB && (
                <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr 36px 44px 44px', gap: 2, fontSize: 10, fontWeight: 700, borderTop: '1px solid #111', marginTop: 4, paddingTop: 4 }}>
                  <span></span><span>Total</span>
                  <span style={{ textAlign: 'center' }}>{fmtNum(totalQty)}</span>
                  <span></span>
                  <span style={{ textAlign: 'right' }}>{fmtNum(subtotal)}</span>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="px-4 pb-3" style={{ borderTop: '1px dashed #ccc' }}>
              {isSNB ? (
                /* SNB summary rows */
                <div style={{ marginTop: 6 }}>
                  {[
                    { label: 'Discount Amt :', val: fmtNum(discount), green: discount > 0 },
                    { label: 'Delivery Charges:', val: '.00' },
                    { label: 'GST:', val: '.00' },
                    { label: `Round-Off :`, val: `${roundOff < 0 ? '-' : ''}${Math.abs(roundOff).toFixed(0)}` },
                  ].map(({ label, val, green }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '1.5px 0', color: green ? '#16a34a' : '#555' }}>
                      <span>{label}</span><span style={{ fontFamily: 'monospace' }}>{val}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontWeight: 700, fontSize: 13, borderTop: '2px solid #111', marginTop: 5, paddingTop: 5 }}>
                    <span>Net Bill Amount:</span>
                    <span>Rs. {fmtNum(finalTotal)}</span>
                  </div>
                  <div style={{ borderTop: '1px dashed #ccc', marginTop: 6, paddingTop: 6 }}>
                    <p style={{ fontWeight: 700, fontSize: 10, fontFamily: 'sans-serif', marginBottom: 3 }}>Payment Details</p>
                    {payMode === 'single' ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                        <span>{payLabel}</span><span>{fmtNum(finalTotal)}</span>
                      </div>
                    ) : (
                      <>
                        {splitMethods[0] && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span>{splitMethods[0].charAt(0).toUpperCase()+splitMethods[0].slice(1)}</span>
                          <span>{fmtNum(parseFloat(splitAmounts[0])||0)}</span></div>}
                        {splitMethods[1] && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span>{splitMethods[1].charAt(0).toUpperCase()+splitMethods[1].slice(1)}</span>
                          <span>{fmtNum(parseFloat(splitAmounts[1])||0)}</span></div>}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                /* Cafe Aadvikam summary */
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#555' }}>Subtotal</span>
                    <span style={{ fontWeight: 600 }}>{fmt(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#16a34a' }}>
                      <span>Discount {discountType==='percent'?`(${discountValue}%)`:'(Flat)'}</span>
                      <span style={{ fontWeight: 600 }}>-{fmt(discount)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontWeight: 700, fontSize: 14, borderTop: '2px solid #111', marginTop: 5, paddingTop: 5 }}>
                    <span>TOTAL</span><span>{fmt(finalTotal)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center px-4 pb-4" style={{ borderTop: '1px dashed #ccc' }}>
              <p style={{ fontWeight: 700, fontSize: 10, fontFamily: 'sans-serif', marginTop: 6 }}>Staff Name: {soldBy}</p>
              <p style={{ fontWeight: 700, fontSize: 11, fontFamily: 'sans-serif', marginTop: 5 }}>
                {isSNB ? 'Thank you, Visit Again' : 'Thank you for visiting!'}
              </p>
              {isSNB && <p style={{ fontSize: 9, color: '#888', marginTop: 2 }}>Including all taxes</p>}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-6 pt-3 border-t grid grid-cols-2 gap-3 shrink-0">
          <button onClick={onClose}
            className="py-3.5 rounded-xl border bg-muted font-semibold text-sm active:scale-95 transition">
            Edit Order
          </button>
          <button onClick={onConfirmPrint}
            className="py-3.5 rounded-xl cafe-gradient text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition shadow-md">
            <Printer className="size-4" /> Print & Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main BillTab ─────────────────────────────────────────────────────────────

export function BillTab({ branch, branchStock, advanceOrders = [] }: Props) {
  const { recordSale, recordSnbSale } = useBranchStore();
  const { currentUser } = useAuthStore();
  const colors = BRANCH_COLORS[branch];
  const soldBy = currentUser?.displayName || currentUser?.username || 'Staff';
  const isVRSNB = branch === 'VRSNB';
  const isSNB   = SNB_BRANCHES.includes(branch);  // SNB + Hosur + VRSNB all use price list

  // Cart
  const [cart, setCart]     = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<SnbCategory | VrsnbCategory | 'All'>('All');
  const billNo              = useRef(generateBillNo());

  // Discount
  const [discountType,  setDiscountType]  = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [showDiscount,  setShowDiscount]  = useState(false);

  // Payment
  const [payMode, setPayMode]           = useState<'single'|'split'>('single');
  const [singleMethod, setSingle]       = useState<PaymentMethod|null>(null);
  const [splitMethods, setSplitMethods] = useState<[PaymentMethod|null,PaymentMethod|null]>([null,null]);
  const [splitAmounts, setSplitAmounts] = useState<[string,string]>(['','']);

  // UI
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCancel,  setShowCancel]  = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const resetPayment = useCallback(() => {
    setPayMode('single'); setSingle(null);
    setSplitMethods([null,null]); setSplitAmounts(['','']); setError('');
  }, []);

  const clearCart = useCallback(() => {
    setCart([]); resetPayment();
    setDiscountValue(''); setShowDiscount(false);
    billNo.current = generateBillNo();
  }, [resetPayment]);

  useEffect(() => { clearCart(); setSearch(''); setActiveCategory('All'); }, [branch]);

  // ── Item source: price list (SNB/Hosur/VRSNB) or stock (Cafe) ─────────────

  const activeItems = isVRSNB ? VRSNB_ITEMS : SNB_ITEMS;
  const activeCategories = isVRSNB ? VRSNB_CATEGORIES : SNB_CATEGORIES;

  const snbFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeItems.filter((item) => {
      const matchCat = activeCategory === 'All' || item.category === activeCategory;
      const matchQ   = !q || item.name.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [search, activeCategory, activeItems]);

  const stockAvailable = useMemo(() => branchStock.filter((s) => s.quantity > 0), [branchStock]);
  const stockFiltered  = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? stockAvailable.filter((s) => s.itemName.toLowerCase().includes(q)) : stockAvailable;
  }, [stockAvailable, search]);

  // Unified display list
  const displayItems   = isSNB ? snbFiltered  : stockFiltered;
  const totalItemCount = isSNB ? activeItems.length : stockAvailable.length;

  // ── Cart helpers ─────────────────────────────────────────────────────────────

  const getCartItem = (name: string) => cart.find((c) => c.itemName === name);
  const getStockQty = (name: string) => branchStock.find((s) => s.itemName === name)?.quantity ?? 0;
  const calcLine    = (price: number|null, qty: number) =>
    price != null ? Math.round(price * qty * 100) / 100 : null;

  // Add from SNB price list
  const addSnbItemToCart = (item: SnbItem) => {
    const unit: SellUnit = item.uom === 'Kgs' ? 'kg' : 'pcs';
    setCart((prev) => {
      const ex = prev.find((c) => c.itemName === item.name);
      if (ex) {
        if (unit === 'pcs') {
          const nq = ex.quantity + 1;
          return prev.map((c) => c.itemName === item.name ? { ...c, quantity: nq, lineTotal: calcLine(c.price, nq) } : c);
        }
        return prev;
      }
      const qty = unit === 'kg' ? 0.5 : 1;
      return [...prev, { itemName: item.name, quantity: qty, sellUnit: unit, price: item.price, lineTotal: calcLine(item.price, qty) }];
    });
  };

  // Add from stock
  const addToCart = (item: StockItem) => {
    const unit = detectSellUnit(item.itemName);
    setCart((prev) => {
      const ex = prev.find((c) => c.itemName === item.itemName);
      if (ex) {
        if (unit === 'pcs') {
          const nq = ex.quantity + 1;
          if (nq > item.quantity) return prev;
          return prev.map((c) => c.itemName === item.itemName ? { ...c, quantity: nq, lineTotal: calcLine(c.price, nq) } : c);
        }
        return prev;
      }
      const qty = Math.min(unit === 'kg' ? 0.5 : 1, item.quantity);
      return [...prev, { itemName: item.itemName, quantity: qty, sellUnit: unit, price: item.price, lineTotal: calcLine(item.price, qty) }];
    });
  };

  const removeFromCart = (name: string) => setCart((prev) => {
    const ex = prev.find((c) => c.itemName === name);
    if (!ex) return prev;
    if (ex.sellUnit === 'kg' || ex.quantity <= 1) return prev.filter((c) => c.itemName !== name);
    const nq = ex.quantity - 1;
    return prev.map((c) => c.itemName === name ? { ...c, quantity: nq, lineTotal: calcLine(c.price, nq) } : c);
  });

  const updateKgQty = (name: string, qty: number) =>
    setCart((prev) => prev.map((c) => c.itemName === name ? { ...c, quantity: qty, lineTotal: calcLine(c.price, qty) } : c));
  const updatePrice = (name: string, price: number|null) =>
    setCart((prev) => prev.map((c) => c.itemName === name ? { ...c, price, lineTotal: calcLine(price, c.quantity) } : c));
  const deleteFromCart = (name: string) => setCart((prev) => prev.filter((c) => c.itemName !== name));

  // ── Totals ───────────────────────────────────────────────────────────────────

  const allPriced = cart.length > 0 && cart.every((c) => c.price != null);
  const subtotal  = useMemo(() => cart.reduce((s, c) => s + (c.lineTotal ?? 0), 0), [cart]);

  const discount = useMemo(() => {
    const v = parseFloat(discountValue) || 0;
    if (!allPriced || v <= 0) return 0;
    if (discountType === 'percent') return Math.round(subtotal * Math.min(v,100) / 100 * 100) / 100;
    return Math.min(v, subtotal);
  }, [subtotal, discountType, discountValue, allPriced]);

  // Round-off for SNB/Hosur only
  const preRound   = Math.round((subtotal - discount) * 100) / 100;
  const roundOff   = (!isVRSNB && isSNB) ? Math.round(preRound) - preRound : 0;
  // GST is INCLUDED in prices — do not add on top
  const cafeCgst   = 0;
  const cafeSgst   = 0;
  const finalTotal = isSNB ? Math.round(preRound) : preRound;

  // ── Payment ──────────────────────────────────────────────────────────────────

  const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { key: 'cash', label: 'Cash',  icon: <Banknote   className="size-4" /> },
    { key: 'upi',  label: 'UPI',   icon: <Smartphone className="size-4" /> },
    { key: 'card', label: 'Card',  icon: <CreditCard className="size-4" /> },
  ];

  const splitTotal0  = parseFloat(splitAmounts[0]) || 0;
  const splitTotal1  = parseFloat(splitAmounts[1]) || 0;
  const splitSum     = Math.round((splitTotal0 + splitTotal1) * 100) / 100;
  const splitPending = allPriced ? Math.round((finalTotal - splitSum) * 100) / 100 : 0;

  const splitReady = payMode === 'split'
    ? splitMethods[0] != null && splitMethods[1] != null && splitMethods[0] !== splitMethods[1] &&
      (allPriced ? Math.abs(splitSum - finalTotal) < 0.01 : splitTotal0 > 0 && splitTotal1 > 0)
    : singleMethod != null;

  const handleSplitAmount = (idx: 0|1, raw: string) => {
    setError('');
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= 0 && allPriced) {
      // Auto-fill the other slot so both always sum to finalTotal
      const other = Math.round((finalTotal - parsed) * 100) / 100;
      const otherStr = other >= 0 ? String(other) : '';
      setSplitAmounts(idx === 0 ? [raw, otherStr] : [otherStr, raw]);
    } else {
      // No prices yet — just store what the user typed, no auto-fill
      setSplitAmounts((prev) => idx === 0 ? [raw, prev[1]] : [prev[0], raw]);
    }
  };

  const selectSplitMethod = (idx: 0|1, method: PaymentMethod) => {
    setError('');
    setSplitMethods((prev) => { const n = [...prev] as [PaymentMethod|null,PaymentMethod|null]; n[idx] = method; return n; });
    if (idx === 0 && allPriced) setSplitAmounts(['','']);
  };

  const buildMethodLabel = () => {
    if (payMode === 'single') return singleMethod ?? 'cash';
    // Store as "method1+method2" — allowed by DB check constraint (see migration)
    const parts: string[] = [];
    if (splitMethods[0]) parts.push(splitMethods[0]);
    if (splitMethods[1]) parts.push(splitMethods[1]);
    return parts.join('+');
  };

  // ── Checkout ─────────────────────────────────────────────────────────────────

  const doCheckout = async () => {
    if (cart.length === 0) return;
    if (!splitReady) {
      if (payMode === 'split') {
        if (!splitMethods[0] || !splitMethods[1]) { setError('Select both methods.'); return; }
        if (splitMethods[0] === splitMethods[1])  { setError('Choose two different methods.'); return; }
        if (allPriced && Math.abs(splitSum - finalTotal) >= 0.01) { setError(`Amounts total ${fmt(splitSum)} but bill is ${fmt(finalTotal)}.`); return; }
      } else { setError('Select a payment method.'); return; }
    }
    setError(''); setSubmitting(true);
    const methodLabel = buildMethodLabel();

    if (isSNB) {
      // SNB / Hosur — items from price list; deduct stock if available, log mismatch if not
      for (const item of cart) {
        const { error: err } = await recordSnbSale(
          branch, item.itemName, item.quantity, soldBy, methodLabel, item.price ?? 0,
        );
        if (err) { setError(err); setSubmitting(false); return; }
      }
    } else {
      // VRSNB — stock-gated sale
      const succeeded: string[] = [];
      for (const item of cart) {
        const err = await recordSale(branch, item.itemName, item.quantity, soldBy, methodLabel);
        if (err) {
          setError(`Failed on "${item.itemName}": ${err}.${succeeded.length > 0 ? ` (Saved: ${succeeded.join(', ')})` : ''}`);
          setSubmitting(false); return;
        }
        succeeded.push(item.itemName);
      }
    }

    setSubmitting(false); setShowPreview(false); setShowSuccess(true);
    clearCart(); setTimeout(() => setShowSuccess(false), 2500);
  };

  const handlePrintAndConfirm = () => {
    printBill({ branch, billNo: billNo.current, items: cart, subtotal, discount,
      discountType, discountValue, roundOff, finalTotal, cgst: cafeCgst, sgst: cafeSgst,
      payMode, singleMethod, splitMethods, splitAmounts, soldBy });
    if (isVRSNB) setTimeout(() => printKOT(billNo.current, cart), 400);
    doCheckout();
  };

  // ── Success ──────────────────────────────────────────────────────────────────

  if (showSuccess) return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="size-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4 shadow-md">
        <CheckCircle2 className="size-10 text-emerald-600" />
      </div>
      <h2 className="font-display text-2xl font-bold">Sale Complete!</h2>
      <p className="text-muted-foreground text-sm mt-1">Sale recorded successfully.</p>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 pb-6">

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input type="text" placeholder={isSNB ? `Search ${totalItemCount} items…` : 'Search items…'} value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-card border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-4 text-muted-foreground" /></button>}
      </div>

      {/* Category filter — price-list branches only */}
      {isSNB && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-1 px-1">
          {(['All', ...activeCategories] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat as SnbCategory | VrsnbCategory | 'All')}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition whitespace-nowrap',
                activeCategory === cat
                  ? 'bg-primary text-primary-foreground border-transparent shadow-sm'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/50',
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground px-0.5">
        {displayItems.length === totalItemCount
          ? `${totalItemCount} ${isSNB ? 'items' : 'items in stock'}`
          : `${displayItems.length} of ${totalItemCount} items`}
      </p>

      {/* Item grid */}
      {displayItems.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground bg-muted/30 rounded-2xl border border-dashed">
          {totalItemCount === 0 ? 'No items in stock.' : 'No items match your search.'}
        </div>
      ) : isSNB ? (
        <div className="grid grid-cols-2 gap-2">
          {(displayItems as SnbItem[]).map((item) => {
            const ci = getCartItem(item.name);
            const stockQtyForItem = getStockQty(item.name);
            return (
              <SnbItemCard
                key={item.barcode}
                item={item}
                inCart={!!ci}
                cartQty={ci?.quantity ?? 0}
                stockQty={stockQtyForItem}
                onAdd={() => addSnbItemToCart(item)}
                onRemove={() => removeFromCart(item.name)}
                onKgChange={(v) => updateKgQty(item.name, v)}
                colors={colors}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(displayItems as StockItem[]).map((item) => {
            const ci = getCartItem(item.itemName);
            return (
              <ItemCard key={item.itemName} item={item} inCart={!!ci} cartQty={ci?.quantity ?? 0}
                onAdd={() => addToCart(item)} onRemove={() => removeFromCart(item.itemName)}
                onKgChange={(v) => updateKgQty(item.itemName, v)} colors={colors} />
            );
          })}
        </div>
      )}

      {/* ── Billing panel ── */}
      {cart.length > 0 && (
        <div className="bg-card border rounded-2xl overflow-hidden shadow-lg">

          {/* Bill header */}
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-900">
            <div className="flex items-center gap-2">
              <Receipt className="size-4 text-amber-400" />
              <span className="font-semibold text-sm text-white">Bill</span>
              <span className="text-[10px] font-mono text-zinc-400">{billNo.current}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', colors.badge)}>
                {cart.length} {cart.length === 1 ? 'item' : 'items'}
              </span>
              <button onClick={() => setShowCancel(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-900/30 hover:bg-red-900/50 px-2.5 py-1 rounded-lg transition">
                <XCircle className="size-3" /> Cancel
              </button>
            </div>
          </div>

          {/* Line items */}
          <div className="divide-y max-h-72 overflow-y-scroll overscroll-contain" onWheel={(e) => e.stopPropagation()}>
            {cart.map((c) => (
              <CartLineItem key={c.itemName} item={c} stockQty={getStockQty(c.itemName)}
                onAdd={() => {
                  if (isSNB) {
                    const s = SNB_ITEMS.find((i) => i.name === c.itemName);
                    if (s) addSnbItemToCart(s);
                  } else {
                    const s = branchStock.find((si) => si.itemName === c.itemName);
                    if (s) addToCart(s);
                  }
                }}
                onRemove={() => removeFromCart(c.itemName)}
                onDelete={() => deleteFromCart(c.itemName)}
                onPriceChange={(p) => updatePrice(c.itemName, p)}
                isSNB={isSNB}
              />
            ))}
          </div>

          {/* Totals + Discount + Payment */}
          <div className="px-4 py-4 space-y-3 border-t bg-muted/10">

            {/* Subtotal */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-semibold tabular-nums text-foreground">{allPriced ? fmt(subtotal) : '—'}</span>
            </div>

            {/* Discount */}
            <div>
              <button onClick={() => setShowDiscount((v) => !v)}
                className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition',
                  showDiscount ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-muted border-border text-muted-foreground')}>
                <Tag className="size-3.5" />{showDiscount ? 'Discount Applied' : 'Apply Discount'}
              </button>
              {showDiscount && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex rounded-xl overflow-hidden border bg-muted p-0.5 shrink-0">
                    {(['percent','flat'] as DiscountType[]).map((t) => (
                      <button key={t} onClick={() => { setDiscountType(t); setDiscountValue(''); }}
                        className={cn('px-3 py-1 text-[11px] font-bold rounded-lg transition',
                          discountType === t ? 'bg-white shadow text-foreground' : 'text-muted-foreground')}>
                        {t === 'percent' ? '%' : '₹'}
                      </button>
                    ))}
                  </div>
                  <input type="number" inputMode="decimal" min="0"
                    max={discountType === 'percent' ? 100 : subtotal} step={discountType === 'percent' ? 1 : 10}
                    value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'percent' ? 'e.g. 10' : 'e.g. 50'}
                    className="flex-1 h-9 px-3 rounded-xl border bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400/40" />
                  {discount > 0 && <span className="text-xs font-bold text-emerald-600 shrink-0">-{fmt(discount)}</span>}
                </div>
              )}
            </div>

            {/* Round-off row (SNB only) */}
            {isSNB && allPriced && roundOff !== 0 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Round-Off</span>
                <span className="font-semibold tabular-nums">{roundOff > 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
              </div>
            )}

            {/* Grand total */}
            <div className={cn('flex items-center justify-between rounded-xl px-4 py-3',
              allPriced ? 'bg-primary/5 border border-primary/10' : 'bg-amber-50 border border-amber-100')}>
              <div className="flex items-center gap-2">
                <IndianRupee className="size-3.5 text-muted-foreground" />
                <span className="text-sm font-bold">
                  {isSNB ? 'Net Bill Amount' : 'Total'}
                  {discount > 0 && <span className="text-[10px] font-normal text-emerald-600 ml-1">(after discount)</span>}
                </span>
              </div>
              {allPriced
                ? <span className="font-display text-2xl font-bold tabular-nums">{fmt(finalTotal)}</span>
                : <span className="text-xs text-amber-600 font-medium">⚠ Enter prices above</span>}
            </div>

            {/* Payment method */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payment</p>
              <div className="grid grid-cols-4 gap-2">
                {PAYMENT_OPTIONS.map((m) => (
                  <button key={m.key} onClick={() => { setPayMode('single'); setSingle(m.key); setError(''); }}
                    className={cn('py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 border transition active:scale-95',
                      payMode === 'single' && singleMethod === m.key ? 'cafe-gradient text-primary-foreground border-transparent shadow-md' : 'bg-card border-border hover:bg-muted/50')}>
                    {m.icon}{m.label}
                  </button>
                ))}
                <button onClick={() => { setPayMode('split'); setSingle(null); setSplitMethods([null,null]); setSplitAmounts(['','']); setError(''); }}
                  className={cn('py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 border transition active:scale-95',
                    payMode === 'split' ? 'bg-violet-600 text-white border-transparent shadow-md' : 'bg-card border-border hover:bg-muted/50')}>
                  <ArrowLeftRight className="size-4" />Part Pay
                </button>
              </div>

              {payMode === 'split' && (
                <div className="rounded-2xl border-2 border-violet-200 bg-violet-50/60 overflow-hidden">
                  <div className="px-4 py-2 bg-violet-600">
                    <p className="text-xs font-bold text-white uppercase tracking-wider text-center">Part Payment</p>
                  </div>
                  <div className="p-4 space-y-4">
                    {([0,1] as const).map((idx) => {
                      const other = splitMethods[idx === 0 ? 1 : 0];
                      const label = idx === 0 ? '1st Payment' : '2nd Payment';
                      return (
                        <div key={idx} className="space-y-2">
                          <p className="text-[11px] font-bold text-violet-700">{label}</p>
                          {/* Method selector */}
                          <div className="grid grid-cols-3 gap-2">
                            {PAYMENT_OPTIONS.map((m) => {
                              const chosen  = splitMethods[idx] === m.key;
                              const blocked = other === m.key;
                              return (
                                <button key={m.key}
                                  onClick={() => !blocked && selectSplitMethod(idx, m.key)}
                                  disabled={blocked}
                                  className={cn(
                                    'py-2.5 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border-2 transition active:scale-95',
                                    chosen  ? 'bg-violet-600 text-white border-violet-600 shadow-md'
                                    : blocked ? 'opacity-25 bg-muted border-muted cursor-not-allowed'
                                    : 'bg-white border-border hover:border-violet-300',
                                  )}>
                                  {m.icon}{m.label}
                                </button>
                              );
                            })}
                          </div>
                          {/* Amount input */}
                          <div className={cn(
                            'flex items-center gap-3 rounded-xl border-2 px-4 py-3 bg-white transition',
                            splitMethods[idx] ? 'border-violet-300' : 'border-border opacity-50',
                          )}>
                            <span className="text-lg font-bold text-muted-foreground">₹</span>
                            <input
                              type="number" inputMode="decimal" min="0" step="1"
                              value={splitAmounts[idx]}
                              onChange={(e) => handleSplitAmount(idx, e.target.value)}
                              disabled={!splitMethods[idx]}
                              placeholder={splitMethods[idx] ? (allPriced ? String(Math.round(finalTotal / 2)) : '0') : 'Select method first'}
                              className="flex-1 text-xl font-bold tabular-nums bg-transparent focus:outline-none disabled:cursor-not-allowed placeholder:text-muted-foreground/40 placeholder:text-sm placeholder:font-normal"
                            />
                          </div>
                        </div>
                      );
                    })}
                    {/* Balance indicator */}
                    {allPriced && (splitTotal0 > 0 || splitTotal1 > 0) && (
                      <div className={cn(
                        'flex items-center justify-between rounded-xl px-4 py-3 font-bold',
                        Math.abs(splitPending) < 0.01
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700',
                      )}>
                        <span className="text-sm">
                          {Math.abs(splitPending) < 0.01 ? '✓ Balanced' : splitPending > 0 ? 'Still to collect' : 'Over by'}
                        </span>
                        {Math.abs(splitPending) >= 0.01 && (
                          <span className="text-lg tabular-nums">{fmt(Math.abs(splitPending))}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2.5 rounded-xl">{error}</p>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => { if (!splitReady) { setError('Select payment method first.'); return; } setError(''); setShowPreview(true); }}
                disabled={!allPriced || submitting}
                className="py-3.5 rounded-xl border-2 border-primary text-primary font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition">
                <Printer className="size-4" /> Print Bill
              </button>
              <button onClick={doCheckout} disabled={submitting || !splitReady}
                className="py-3.5 rounded-xl cafe-gradient text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition shadow-md">
                {submitting
                  ? <><Loader2 className="size-4 animate-spin" /> Processing…</>
                  : <><Receipt className="size-4" /> Complete Sale</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty hint */}
      {cart.length === 0 && totalItemCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 rounded-xl text-xs text-muted-foreground border border-dashed">
          <ShoppingCart className="size-3.5 shrink-0" />
          Tap any item above to add it to the cart
          <ChevronRight className="size-3.5 ml-auto shrink-0" />
        </div>
      )}

      {/* ── Overlays ── */}
      {showCancel && (
        <CancelDialog onConfirm={() => { clearCart(); setShowCancel(false); }} onClose={() => setShowCancel(false)} />
      )}
      {showPreview && (
        <BillPreviewSheet
          branch={branch} billNo={billNo.current} items={cart}
          subtotal={subtotal} discount={discount} discountType={discountType}
          discountValue={discountValue} roundOff={roundOff} finalTotal={finalTotal}
          payMode={payMode} singleMethod={singleMethod}
          splitMethods={splitMethods} splitAmounts={splitAmounts} soldBy={soldBy}
          onClose={() => setShowPreview(false)}
          onConfirmPrint={handlePrintAndConfirm} />
      )}
    </div>
  );
}
