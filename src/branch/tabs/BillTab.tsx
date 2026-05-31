// src/branch/tabs/BillTab.tsx
import { supabase } from '@/lib/supabase'; // BUG #13 FIX: supabase was used in fetchNextBillNo() but never imported
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Loader2, Receipt,
  IndianRupee, Banknote, Smartphone, CreditCard, Search, X, Scale,
  Hash, Pencil, ArrowLeftRight, Tag, Printer, XCircle, AlertTriangle,
  ChevronRight, ChevronDown, Wallet, Clock, AlertCircle, Package, Bell, Calendar, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranchStore } from '../branchStore';
import { useAuthStore } from '@/stores/authStore';
import type { Branch } from '../types';
import { BRANCH_COLORS } from '../types';
import type { StockItem, BranchAdvanceOrder, BranchAdvanceItem } from '../branchStore';
import type { StockMismatch } from '../branchStore';
import { SNB_ITEMS, SNB_CATEGORIES } from '../snbItems';
import type { SnbItem, SnbCategory } from '../snbItems';
import { VRSNB_ITEMS, VRSNB_CATEGORIES } from '../vrsnbItems';
import type { VrsnbItem, VrsnbCategory } from '../vrsnbItems';
import { useItemPriceStore } from '@/stores/itemPriceStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type SellUnit      = 'pcs' | 'kg';
type PaymentMethod = 'cash' | 'upi' | 'card' | 'credit';
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

// B8 FIX: escape dynamic values before injecting into innerHTML / document.write
// Prevents a DB item name containing </td><script> from executing in the print window.
function escHtml(s: string | number | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

// Fetch a shared sequential bill number from the DB so all branches
// (VRSNB, SNB, Hosur) share the same incrementing counter.
async function fetchNextBillNo(): Promise<string> {
  const { data, error } = await supabase.rpc('get_next_bill_number');
  if (error || data == null) {
    // Fallback to local random if RPC fails — avoids blocking the biller
    const d = new Date();
    const datePart = `${d.getFullYear().toString().slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
    return `${datePart}-${suffix}`;
  }
  return String(data);
}

// ─── Print KOT (Kitchen Order Ticket) — VRSNB only ───────────────────────────
// Called after printBill for VRSNB to send a copy to the kitchen/packing area.
function printKOT(billNo: string, items: CartItem[]) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const rows = items.map((item) => `
    <tr>
      <td style="padding:4px 2px;font-size:13px;font-weight:bold">${escHtml(item.itemName)}</td>
      <td style="padding:4px 2px;font-size:13px;font-weight:bold;text-align:right">
        ${item.sellUnit === 'kg'
          ? (item.quantity < 1 ? `${Math.round(item.quantity * 1000)}g` : `${item.quantity}kg`)
          : `×${item.quantity}`}
      </td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><title>KOT – ${billNo}</title>
  <style>
    @page { margin: 6mm; size: 80mm auto; }
    body { font-family: 'Arial', sans-serif; font-size: 12px; color: #000; max-width: 300px; margin: 0 auto; padding: 6px; }
    .center { text-align: center; }
    hr { border: none; border-top: 2px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
  </style></head><body>
  <div class="center" style="font-size:16px;font-weight:900;letter-spacing:2px">KOT</div>
  <div class="center" style="font-size:11px">Bill #${escHtml(billNo.split('-').pop())} · ${timeStr}</div>
  <hr/>
  <table><tbody>${rows}</tbody></table>
  <hr/>
  <div class="center" style="font-size:10px">— Kitchen Copy —</div>
  <script>window.onload=()=>window.print();</script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=380,height=400');
  if (w) { w.document.write(html); w.document.close(); }
}

// ─── Print Bill ───────────────────────────────────────────────────────────────

interface PrintArgs {
  branch: Branch; billNo: string; items: CartItem[];
  subtotal: number; discount: number; discountType: DiscountType;
  discountValue: string; roundOff: number; finalTotal: number;
  cgst: number; sgst: number;
  payMode: 'single'|'split'|'credit'; singleMethod: PaymentMethod|null;
  splitMethods: [PaymentMethod|null, PaymentMethod|null];
  splitAmounts: [string,string]; soldBy: string;
  customerName?: string; creditAmountPaid?: number;
}

function printBill(args: PrintArgs) {
  const { branch, billNo, items, subtotal, discount, discountType,
    discountValue, roundOff, finalTotal, cgst, sgst, payMode, singleMethod,
    splitMethods, splitAmounts, soldBy, customerName, creditAmountPaid } = args;

  const isSNB = SNB_BRANCHES.includes(branch);
  const now   = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g, '/');
  const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12: true });

  // Build payment label — credit sales show what was paid upfront + amount due
  const creditDue = payMode === 'credit' ? Math.max(0, finalTotal - (creditAmountPaid ?? 0)) : 0;
  const payLabel = payMode === 'credit'
    ? `Credit — Paid: ₹${(creditAmountPaid ?? 0).toFixed(2)} / Due: ₹${creditDue.toFixed(2)}`
    : payMode === 'single'
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
        <td class="name">${escHtml(item.itemName)}</td>
        <td class="num">${formatQty(item.quantity, item.sellUnit)}</td>
        <td class="num">${item.price != null ? fmtNum(item.price) : '—'}</td>
        <td class="num">${item.lineTotal != null ? fmtNum(item.lineTotal) : '—'}</td>
      </tr>`).join('');

    const payRows = payMode === 'credit'
      ? `<tr><td class="lab">Advance Paid</td><td class="num">${fmtNum(creditAmountPaid ?? 0)}</td></tr>
         <tr><td class="lab" style="color:red;font-weight:bold">Balance Due</td><td class="num" style="color:red;font-weight:bold">${fmtNum(Math.max(0, finalTotal - (creditAmountPaid ?? 0)))}</td></tr>`
      : payMode === 'single'
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
    ${payMode === 'credit' ? `<div class="bold" style="margin-bottom:2px">Customer: ${escHtml(customerName ?? 'Customer')}</div>` : ''}
    <div class="bold" style="margin-bottom:3px">Payment Details</div>
    <table>${payRows}</table>
    <hr/>
    <div class="center bold">Staff Name : ${escHtml(soldBy)}</div>
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
    const rows = items.map((item) => `
      <tr>
        <td class="name">${escHtml(item.itemName)}</td>
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

    // Date as DD/MM/YY (2-digit year) to match physical receipt
    const vrDate = now.toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'2-digit' }).replace(/\//g, '/');
    // Time as HH:MM (24-hour) to match physical receipt
    const vrTime = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12: false });

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
      .snb-logo { font-size: 28px; font-weight: 900; letter-spacing: 2px; border: 2px solid #000; display: inline-block; padding: 2px 14px; }
      .snb-sub { font-size: 9px; letter-spacing: 3px; }
      .snb-tagline { font-size: 9px; }
    </style></head><body>
    <div class="center snb-tagline">SINCE 1988</div>
    <div class="center"><span class="snb-logo">SNB</span></div>
    <div class="center snb-sub">SWEETS &amp; SNACKS</div>
    <div class="center snb-tagline" style="margin-bottom:4px">SHOP NO. 10/1C</div>
    <div class="center bold" style="font-size:11px">PAID</div>
    <div class="center bold" style="font-size:14px;margin-top:2px">${VRSNB_INFO.name}</div>
    <div class="center" style="margin-top:3px">${addrLines}</div>
    <div class="center">GST NO:${VRSNB_INFO.gstin}</div>
    <div class="center">FSSAI NO:${VRSNB_INFO.fssai}</div>
    <hr class="solid"/>
    <table>
      <tr><td colspan="2">Name:</td></tr>
      <tr style="border-top:1px solid #000;border-bottom:1px solid #000;padding:2px 0">
        <td>Date: <span class="bold">${vrDate}</span></td>
        <td class="num bold">Pick Up</td>
      </tr>
      <tr>
        <td>${vrTime}</td>
      </tr>
      <tr>
        <td>Cashier: ${escHtml(soldBy)}</td>
        <td class="num">Bill No.: <span class="bold">${billNo.split('-').pop()}</span></td>
      </tr>
    </table>
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
      <td style="padding:5px 4px;font-size:12px;border-bottom:1px solid #f0f0f0">${escHtml(item.itemName)}</td>
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
    <div className={cn('relative bg-white border rounded-3xl p-4 flex flex-col gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md',
      inCart ? 'border-emerald-400 shadow-md ring-4 ring-emerald-100 bg-emerald-50/30' : 'border-slate-200 hover:border-slate-300')}>
      {inCart && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary animate-pulse" />}
      <div className="pr-4">
        <p className="text-base font-bold leading-snug line-clamp-2">{item.itemName}</p>
        <div className="flex items-center gap-2 mt-1.5">
          {item.price != null
            ? <span className="text-sm font-bold text-emerald-600">₹{item.price}{unit === 'kg' ? '/kg' : ''}</span>
            : <span className="text-xs text-amber-500 font-semibold">Set price ↓</span>}
          <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground font-medium">
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
          className={cn('w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 border transition active:scale-95', colors.bg, colors.text)}>
          <Scale className="size-3.5" /> Weigh & Add
        </button>
      ) : inCart ? (
        <div className="flex items-center gap-2 justify-between">
          <button onClick={onRemove} className="size-9 rounded-lg bg-muted flex items-center justify-center active:scale-90 transition border border-border"><Minus className="size-4" /></button>
          <span className="text-lg font-bold tabular-nums">{cartQty}</span>
          <button onClick={onAdd} disabled={cartQty >= item.quantity}
            className="size-9 rounded-lg cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90 disabled:opacity-40 transition"><Plus className="size-4" /></button>
        </div>
      ) : (
        <button onClick={onAdd}
          className={cn('w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 border transition active:scale-95', colors.bg, colors.text)}>
          <Plus className="size-3.5" /> Add
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
    <div className={cn('relative bg-white border rounded-3xl p-4 flex flex-col gap-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md',
      inCart ? 'border-emerald-400 shadow-md ring-4 ring-emerald-100 bg-emerald-50/30' : 'border-slate-200 hover:border-slate-300')}>
      {inCart && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-primary animate-pulse" />}
      <div className="pr-4">
        <p className="text-base font-bold leading-snug line-clamp-2">{item.name}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span className="text-sm font-bold text-emerald-600">
            ₹{item.price}{unit === 'kg' ? '/kg' : ''}
          </span>
          {noStock
            ? <span className="ml-auto text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">No stock</span>
            : <span className="ml-auto text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                {unit === 'kg'
                  ? stockQty >= 1 ? `${stockQty}kg` : `${Math.round(stockQty * 1000)}g`
                  : `${stockQty} pcs`}
              </span>
          }
        </div>
        {overStock && (
          <p className="text-[9px] text-amber-600 font-semibold mt-0.5">⚠ Exceeds stock</p>
        )}
      </div>
      {unit === 'kg' && inCart ? (
        <KgInput value={cartQty} onChange={onKgChange} max={999} />
      ) : unit === 'kg' ? (
        <button onClick={onAdd}
          className={cn('w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 border transition active:scale-95', colors.bg, colors.text)}>
          <Scale className="size-3.5" /> Weigh & Add
        </button>
      ) : inCart ? (
        <div className="flex items-center gap-2 justify-between">
          <button onClick={onRemove} className="size-9 rounded-lg bg-muted flex items-center justify-center active:scale-90 transition border border-border"><Minus className="size-4" /></button>
          <span className={cn('text-lg font-bold tabular-nums', overStock && 'text-amber-600')}>{cartQty}</span>
          <button onClick={onAdd}
            className={cn('size-9 rounded-lg text-primary-foreground flex items-center justify-center active:scale-90 transition',
              overStock ? 'bg-amber-500' : 'cafe-gradient')}><Plus className="size-4" /></button>
        </div>
      ) : (
        <button onClick={onAdd}
          className={cn('w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 border transition active:scale-95', colors.bg, colors.text)}>
          <Plus className="size-3.5" /> Add
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
  roundOff, finalTotal, payMode, singleMethod, splitMethods, splitAmounts, soldBy,
  customerName, creditAmountPaid,
  onClose, onConfirmPrint }: {
  branch: Branch; billNo: string; items: CartItem[]; subtotal: number;
  discount: number; discountType: DiscountType; discountValue: string;
  roundOff: number; finalTotal: number; payMode: 'single'|'split'|'credit';
  singleMethod: PaymentMethod|null;
  splitMethods: [PaymentMethod|null, PaymentMethod|null];
  splitAmounts: [string,string]; soldBy: string;
  customerName?: string; creditAmountPaid?: number;
  onClose: () => void; onConfirmPrint: () => void;
}) {
  const isVRSNB  = branch === 'VRSNB';
  const isSNB    = SNB_BRANCHES.includes(branch) && !isVRSNB;
  const now      = new Date();
  const totalQty = items.reduce((s,i) => s + i.quantity, 0);
  const creditDue = payMode === 'credit' ? Math.max(0, finalTotal - (creditAmountPaid ?? 0)) : 0;

  const payLabel = payMode === 'credit'
    ? `Credit — Paid: ${fmt(creditAmountPaid ?? 0)} / Due: ${fmt(creditDue)}`
    : payMode === 'single'
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
              {isVRSNB ? (
                <>
                  <p style={{ fontFamily: 'sans-serif', fontWeight: 900, fontSize: 24, letterSpacing: 2, border: '2px solid #fff', display: 'inline-block', padding: '2px 12px', margin: '0 0 4px' }}>SNB</p>
                  <p style={{ color: '#aaa', fontSize: 9, margin: '2px 0', letterSpacing: 3 }}>SWEETS &amp; SNACKS</p>
                  <p style={{ fontWeight: 700, fontSize: 12, margin: '6px 0 2px', color: '#fff' }}>PAID</p>
                  <p style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: 0.5, margin: 0 }}>{VRSNB_INFO.name}</p>
                  {VRSNB_INFO.address.split('\n').map((l,i) => <p key={i} style={{ color: '#aaa', fontSize: 10, margin: '2px 0' }}>{l}</p>)}
                  <p style={{ color: '#aaa', fontSize: 10, margin: '2px 0' }}>GST NO:{VRSNB_INFO.gstin}</p>
                  <p style={{ color: '#aaa', fontSize: 10, margin: '2px 0' }}>FSSAI NO:{VRSNB_INFO.fssai}</p>
                </>
              ) : isSNB ? (
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
              {isVRSNB ? (
                /* VRSNB FOODS LLP summary — matches physical receipt */
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
                    <span style={{ color: '#555' }}>Sub Total</span>
                    <span style={{ fontWeight: 600 }}>{fmtNum(Math.round((subtotal - discount) * 100) / 100)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'sans-serif', fontWeight: 700, fontSize: 13, borderTop: '2px solid #111', marginTop: 5, paddingTop: 5 }}>
                    <span>Grand Total</span>
                    <span>₹{fmtNum(finalTotal)}</span>
                  </div>
                  {payMode === 'credit' ? (
                    <div style={{ marginTop: 4 }}>
                      {customerName && <div style={{ fontSize: 10, color: '#555' }}>Customer: <strong>{customerName}</strong></div>}
                      <div style={{ fontSize: 10, color: '#555' }}>Advance Paid: {fmtNum(creditAmountPaid ?? 0)}</div>
                      <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>Balance Due: {fmtNum(creditDue)}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
                      Paid via {payLabel}
                    </div>
                  )}
                </div>
              ) : isSNB ? (
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
                    {payMode === 'credit' ? (
                      <>
                        {customerName && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                          <span style={{ color: '#555' }}>Customer</span><span style={{ fontWeight: 700 }}>{customerName}</span></div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                          <span>Advance Paid</span><span>{fmtNum(creditAmountPaid ?? 0)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#dc2626', fontWeight: 700 }}>
                          <span>Balance Due</span><span>{fmtNum(creditDue)}</span>
                        </div>
                      </>
                    ) : payMode === 'single' ? (
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
                  {payMode === 'credit' ? (
                    <div style={{ borderTop: '1px dashed #ccc', marginTop: 6, paddingTop: 6 }}>
                      {customerName && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#555' }}>Customer</span><strong>{customerName}</strong></div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#555' }}>Advance Paid</span><span style={{ fontWeight: 600 }}>{fmt(creditAmountPaid ?? 0)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#dc2626', fontWeight: 700 }}>
                        <span>Balance Due</span><span>{fmt(creditDue)}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
                      Paid via {payLabel}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center px-4 pb-4" style={{ borderTop: '1px dashed #ccc' }}>
              <p style={{ fontWeight: 700, fontSize: 10, fontFamily: 'sans-serif', marginTop: 6 }}>
                {isVRSNB ? `Cashier: ${soldBy}` : `Staff Name: ${soldBy}`}
              </p>
              <p style={{ fontWeight: 700, fontSize: 11, fontFamily: 'sans-serif', marginTop: 5 }}>
                {isVRSNB ? 'Thank You & Visit Again...!!!' : isSNB ? 'Thank you, Visit Again' : 'Thank you for visiting!'}
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

// ─── Branch Advance Order Card ────────────────────────────────────────────────
function BranchAdvanceCard({ order, branch }: { order: BranchAdvanceOrder; branch: Branch }) {
  const { collectAdvanceBalance } = useBranchStore();
  const { currentUser } = useAuthStore();
  const [showCollect, setShowCollect] = useState(false);
  const [collectMethod, setCollectMethod] = useState<'cash' | 'upi' | 'card' | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const balance = order.balanceDue;
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const ICONS: Record<string, React.ReactNode> = {
    cash: <Banknote className="size-4" />,
    upi:  <Smartphone className="size-4" />,
    card: <CreditCard className="size-4" />,
  };

  const handleCollect = async () => {
    if (!collectMethod) return;
    setCollecting(true); setErr(null);
    const error = await collectAdvanceBalance(branch, order.id, collectMethod);
    setCollecting(false);
    if (error) { setErr(error); return; }
    setShowCollect(false);
  };

  return (
    <div className="bg-card rounded-2xl border-2 border-amber-400 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-amber-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-body font-bold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-800 border-amber-300 w-fit">
              ⏳ Advance Paid
            </span>
            {order.customerName && (
              <span className="text-xs font-body font-semibold text-foreground">{order.customerName}</span>
            )}
            <span className="text-[10px] font-body text-muted-foreground flex items-center gap-1">
              <Clock className="size-3" />
              {new Date(order.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)}
          className="size-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
          <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} />
        </button>
      </div>

      {/* Items (collapsible) */}
      {expanded && (
        <div className="px-4 py-3 space-y-1 border-b border-border/50">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-2">Items</p>
          {order.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="font-body text-foreground flex items-center gap-1">
                {item.isCustom && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700">CUSTOM</span>}
                {item.quantity}{item.sellUnit === 'kg' ? 'kg' : '×'} {item.itemName}
              </span>
              <span className="font-body font-bold text-primary tabular-nums">₹{item.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          ))}
        </div>
      )}

      {/* Payment summary */}
      <div className="px-4 py-3 space-y-2 border-b border-border/50 bg-muted/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-body text-muted-foreground">Total Bill</span>
          <span className="text-sm font-body font-bold tabular-nums">{fmt(order.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-body text-muted-foreground flex items-center gap-1">
            <Wallet className="size-3" /> Advance Paid
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold uppercase">{order.advanceMethod}</span>
          </span>
          <span className="text-sm font-body font-bold text-amber-600 tabular-nums">−{fmt(order.advanceAmount)}</span>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <span className="text-sm font-body font-bold text-foreground">Balance Due</span>
          <span className="text-lg font-display font-bold text-red-600 tabular-nums">{fmt(balance)}</span>
        </div>
      </div>

      {/* Collect action — only shown when there is an outstanding balance */}
      {balance > 0 && (!showCollect ? (
        <div className="px-4 py-3">
          <button onClick={() => setShowCollect(true)}
            className="w-full py-3 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all text-white"
            style={{ background: 'linear-gradient(135deg,#E07A3A,#C84B0A)', boxShadow: '0 4px 16px rgba(200,75,10,0.3)' }}>
            <IndianRupee className="size-4" />Collect Balance {fmt(balance)}
          </button>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs font-body font-bold text-foreground">Select payment method for balance:</p>
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'upi', 'card'] as const).map(m => (
              <button key={m} onClick={() => setCollectMethod(m)}
                className={cn('flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-body font-bold transition-all active:scale-95',
                  collectMethod === m ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground')}>
                {ICONS[m]}{m.toUpperCase()}
              </button>
            ))}
          </div>
          {err && <p className="text-xs font-body text-destructive flex items-center gap-1"><AlertCircle className="size-3" />{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setShowCollect(false); setCollectMethod(null); setErr(null); }}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-body font-semibold active:scale-95">
              Cancel
            </button>
            <button onClick={handleCollect} disabled={!collectMethod || collecting}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-body font-bold flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50">
              <CheckCircle2 className="size-4" />{collecting ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Branch Advance Panel (new order + pending list) ─────────────────────────
function BranchAdvancePanel({ branch, advanceOrders }: { branch: Branch; advanceOrders: BranchAdvanceOrder[] }) {
  const { recordAdvanceOrder } = useBranchStore();
  const { currentUser } = useAuthStore();
  const colors = BRANCH_COLORS[branch];
  const isSNB = (['SNB', 'Hosur', 'VRSNB'] as Branch[]).includes(branch);

  // Cart state (reuse CartItem type from billing)
  const [cart, setCart] = useState<CartItem[]>([]);

  // Custom items
  interface CustomLine { id: string; name: string; price: number; qty: number; }
  const [customItems, setCustomItems] = useState<CustomLine[]>([]);
  const [customName, setCustomName]   = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty]     = useState('1');
  const [customErr, setCustomErr]     = useState('');
  const [itemMode, setItemMode]       = useState<'items' | 'custom'>('items');

  // Order meta
  const [customerName, setCustomerName] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [advanceAmt, setAdvanceAmt]     = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<'cash' | 'upi' | 'card' | null>(null);
  const [advanceErr, setAdvanceErr]     = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [showSuccess, setShowSuccess]   = useState(false);

  // Item source — prices read from itemPriceStore (Supabase overrides) first
  const { getPrice: getPriceOverride, getName: getNameOverride, fetchOverrides: fetchPriceOverrides } = useItemPriceStore();
  const priceBranch = branch === 'VRSNB' ? 'VRSNB' : 'SNB';

  useEffect(() => { fetchPriceOverrides(priceBranch); }, [priceBranch]);

  const rawActiveItems = branch === 'VRSNB' ? VRSNB_ITEMS : SNB_ITEMS;
  const activeItems = useMemo(() =>
    rawActiveItems.map(i => ({
      ...i,
      name:  getNameOverride(priceBranch, i.barcode, i.name),
      price: getPriceOverride(priceBranch, i.barcode, i.price),
    })),
  [rawActiveItems, priceBranch, getPriceOverride, getNameOverride]);
  const activeCategories = branch === 'VRSNB' ? VRSNB_CATEGORIES : SNB_CATEGORIES;
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const filteredItems = useMemo(() => {
    let items = activeItems as Array<{ name: string; price: number; category: string; barcode?: string }>;
    if (activeCategory !== 'All') items = items.filter(i => i.category === activeCategory);
    if (search.trim()) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return items;
  }, [activeItems, activeCategory, search]);

  const getCartItem = (name: string) => cart.find(c => c.itemName === name);

  const addItemToCart = (name: string, price: number) => {
    setCart(prev => {
      const ex = prev.find(c => c.itemName === name);
      if (ex) return prev.map(c => c.itemName === name ? { ...c, quantity: c.quantity + 1, lineTotal: (c.quantity + 1) * price } : c);
      return [...prev, { itemName: name, quantity: 1, sellUnit: 'pcs' as SellUnit, price, lineTotal: price }];
    });
  };
  const removeFromCart = (name: string) => {
    setCart(prev => {
      const ex = prev.find(c => c.itemName === name);
      if (!ex) return prev;
      if (ex.quantity <= 1) return prev.filter(c => c.itemName !== name);
      return prev.map(c => c.itemName === name ? { ...c, quantity: c.quantity - 1, lineTotal: (c.quantity - 1) * (c.price ?? 0) } : c);
    });
  };
  const deleteFromCart = (name: string) => setCart(prev => prev.filter(c => c.itemName !== name));

  const handleAddCustom = () => {
    const n = customName.trim();
    const p = parseFloat(customPrice);
    const q = parseInt(customQty) || 1;
    if (!n) { setCustomErr('Enter item name'); return; }
    if (isNaN(p) || p <= 0) { setCustomErr('Enter a valid price'); return; }
    setCustomErr('');
    setCustomItems(prev => {
      const ex = prev.find(c => c.name.toLowerCase() === n.toLowerCase());
      if (ex) return prev.map(c => c.name.toLowerCase() === n.toLowerCase() ? { ...c, qty: c.qty + q } : c);
      return [...prev, { id: `c-${Date.now()}`, name: n, price: p, qty: q }];
    });
    setCustomName(''); setCustomPrice(''); setCustomQty('1');
  };
  const updateCustomQty = (id: string, qty: number) => {
    if (qty <= 0) setCustomItems(prev => prev.filter(c => c.id !== id));
    else setCustomItems(prev => prev.map(c => c.id === id ? { ...c, qty } : c));
  };

  const cartTotal   = cart.reduce((s, c) => s + (c.lineTotal ?? 0), 0);
  const customTotal = customItems.reduce((s, c) => s + c.price * c.qty, 0);
  const total       = cartTotal + customTotal;
  const allEmpty    = cart.length === 0 && customItems.length === 0;
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const handleSubmit = async () => {
    if (allEmpty || !currentUser) return;
    const amt = parseFloat(advanceAmt);
    if (isNaN(amt) || amt <= 0) { setAdvanceErr('Enter advance amount'); return; }
    if (amt > total) { setAdvanceErr('Advance cannot exceed total'); return; }
    if (!advanceMethod) { setAdvanceErr('Select payment method'); return; }
    if (!deliveryDate) { setAdvanceErr('Select a delivery date'); return; }
    setAdvanceErr(''); setSubmitting(true);

    const items: BranchAdvanceItem[] = [
      ...cart.map(c => ({ itemName: c.itemName, quantity: c.quantity, sellUnit: 'pcs' as const, price: c.price ?? 0, lineTotal: c.lineTotal ?? 0 })),
      ...customItems.map(c => ({ itemName: c.name, quantity: c.qty, sellUnit: 'pcs' as const, price: c.price, lineTotal: c.price * c.qty, isCustom: true })),
    ];

    const err = await recordAdvanceOrder(branch, {
      branch,
      customerName: customerName || null,
      items,
      subtotal: total,
      advanceAmount: amt,
      advanceMethod,
      balanceDue: Math.max(0, total - amt),
      deliveryDate: deliveryDate || null,
      soldBy: currentUser.displayName || currentUser.username || 'Staff',
    });

    setSubmitting(false);
    if (err) { setAdvanceErr(err); return; }

    setShowSuccess(true);
    setCart([]); setCustomItems([]); setCustomerName('');
    setDeliveryDate(''); setAdvanceAmt(''); setAdvanceMethod(null);
    setTimeout(() => setShowSuccess(false), 1800);
  };

  const PAYMENT_ICONS = {
    cash: <Banknote className="size-4" />,
    upi:  <Smartphone className="size-4" />,
    card: <CreditCard className="size-4" />,
  };

  const pendingOrders = advanceOrders.filter(o => o.status === 'pending');

  if (showSuccess) return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-4">
      <div className="size-20 rounded-3xl flex items-center justify-center bg-amber-50 border-2 border-amber-200">
        <Wallet className="size-10 text-amber-600" />
      </div>
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Advance Recorded!</h2>
        <p className="text-muted-foreground font-body mt-1 text-sm">Order saved. Balance pending collection.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-6">

      {/* ── New Advance Order ── */}
      <div className="bg-card border border-amber-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2 border-b border-amber-100" style={{ background: 'rgba(217,119,6,0.06)' }}>
          <Wallet className="size-4 text-amber-600" />
          <h3 className="font-display font-bold text-base text-foreground">New Advance Order</h3>
        </div>

        <div className="p-4 space-y-4">

          {/* Mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl bg-muted">
            <button onClick={() => setItemMode('items')}
              className={cn('flex-1 py-2 rounded-lg text-sm font-body font-semibold transition-all flex items-center justify-center gap-1.5',
                itemMode === 'items' ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
              <Package className="size-3.5" />Items
            </button>
            <button onClick={() => setItemMode('custom')}
              className={cn('flex-1 py-2 rounded-lg text-sm font-body font-semibold transition-all flex items-center justify-center gap-1.5',
                itemMode === 'custom' ? 'bg-card shadow text-foreground' : 'text-muted-foreground')}>
              <Pencil className="size-3.5" />Custom
            </button>
          </div>

          {itemMode === 'items' ? (
            <div className="space-y-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input type="text" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-muted/50 border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
                {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-3.5 text-muted-foreground" /></button>}
              </div>
              {/* Category pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {(['All', ...activeCategories] as string[]).map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={cn('shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold border transition whitespace-nowrap',
                      activeCategory === cat ? 'bg-amber-500 text-white border-transparent' : 'bg-card border-border text-muted-foreground')}>
                    {cat}
                  </button>
                ))}
              </div>
              {/* Item grid */}
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {filteredItems.map(item => {
                  const ci = getCartItem(item.name);
                  return (
                    <div key={item.name} className={cn('border rounded-xl p-3 flex flex-col gap-1.5 transition-all', ci ? 'border-amber-400 bg-amber-50' : 'border-border bg-card')}>
                      <p className="text-xs font-body font-semibold text-foreground truncate">{item.name}</p>
                      <p className="text-xs font-bold text-amber-600 tabular-nums">₹{item.price}</p>
                      <div className="flex items-center justify-between mt-auto">
                        {ci ? (
                          <div className="flex items-center gap-1 w-full">
                            <button onClick={() => removeFromCart(item.name)} className="size-6 rounded-lg bg-muted border border-border flex items-center justify-center active:scale-90"><Minus className="size-3" /></button>
                            <span className="flex-1 text-center text-xs font-bold">{ci.quantity}</span>
                            <button onClick={() => addItemToCart(item.name, item.price)} className="size-6 rounded-lg text-white flex items-center justify-center active:scale-90" style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)' }}><Plus className="size-3" /></button>
                          </div>
                        ) : (
                          <button onClick={() => addItemToCart(item.name, item.price)} className="w-full py-1 rounded-lg text-[11px] font-bold text-white active:scale-95" style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)' }}>Add</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <input type="text" placeholder="Item name *" value={customName} onChange={e => { setCustomName(e.target.value); setCustomErr(''); }}
                  className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                    <input type="number" placeholder="Price *" value={customPrice} onChange={e => { setCustomPrice(e.target.value); setCustomErr(''); }}
                      className="w-full pl-7 pr-2 py-2 rounded-lg bg-card border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCustomQty(q => String(Math.max(1, parseInt(q||'1') - 1)))} className="size-8 rounded-lg bg-muted border border-border flex items-center justify-center"><Minus className="size-3" /></button>
                    <input type="number" min="1" value={customQty} onChange={e => setCustomQty(e.target.value)} className="w-10 text-center py-2 rounded-lg bg-card border border-border text-sm font-body focus:outline-none" />
                    <button onClick={() => setCustomQty(q => String(parseInt(q||'1') + 1))} className="size-8 rounded-lg bg-muted border border-border flex items-center justify-center"><Plus className="size-3" /></button>
                  </div>
                </div>
                {customErr && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="size-3" />{customErr}</p>}
                <button onClick={handleAddCustom} className="w-full py-2 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-1.5 active:scale-95" style={{ background: 'linear-gradient(135deg,#b8860b,#d97706)' }}>
                  <Plus className="size-4" />Add to Bill
                </button>
              </div>
              {customItems.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  {customItems.map(ci => (
                    <div key={ci.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-body font-semibold truncate">{ci.name}</p>
                        <p className="text-[10px] text-amber-600 font-bold">₹{ci.price} × {ci.qty} = ₹{(ci.price * ci.qty).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateCustomQty(ci.id, ci.qty - 1)} className="size-6 rounded bg-muted border border-border flex items-center justify-center"><Minus className="size-3" /></button>
                        <span className="w-5 text-center text-xs font-bold">{ci.qty}</span>
                        <button onClick={() => updateCustomQty(ci.id, ci.qty + 1)} className="size-6 rounded text-white flex items-center justify-center" style={{ background: '#d97706' }}><Plus className="size-3" /></button>
                        <button onClick={() => updateCustomQty(ci.id, 0)} className="size-6 rounded bg-destructive/10 text-destructive flex items-center justify-center ml-0.5"><Trash2 className="size-3" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cart summary */}
          {!allEmpty && (
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between bg-muted/30 border-b border-border">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5"><ShoppingCart className="size-3.5" />Cart ({cart.length + customItems.length} items)</span>
                <button onClick={() => { setCart([]); setCustomItems([]); }} className="text-xs text-destructive font-semibold">Clear</button>
              </div>
              {[...cart.map(c => ({ name: c.itemName, qty: c.quantity, total: c.lineTotal ?? 0, custom: false })),
                ...customItems.map(c => ({ name: c.name, qty: c.qty, total: c.price * c.qty, custom: true }))
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-xs font-body text-foreground flex items-center gap-1">
                    {row.custom && <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-700">C</span>}
                    {row.qty}× {row.name}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-amber-600">{fmt(row.total)}</span>
                </div>
              ))}
              <div className="px-3 py-2 flex items-center justify-between bg-amber-50 border-t border-amber-200">
                <span className="text-sm font-bold">Total</span>
                <span className="text-base font-display font-bold text-amber-700 tabular-nums">{fmt(total)}</span>
              </div>
            </div>
          )}

          {/* Customer name */}
          {!allEmpty && (
            <input type="text" placeholder="Customer name (optional)" value={customerName} onChange={e => setCustomerName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-muted/50 border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
          )}

          {/* Delivery date + Advance amount + method */}
          {!allEmpty && (
            <div className="space-y-3 pt-2 border-t border-border">

              {/* BUGFIX: delivery_date is required by branch_advance_orders schema */}
              <div>
                <label className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-widest mb-1.5 block flex items-center gap-1">
                  <Calendar className="size-3" /> Delivery Date *
                </label>
                <input type="date" value={deliveryDate} onChange={e => { setDeliveryDate(e.target.value); setAdvanceErr(''); }}
                  min={new Date().toISOString().split('T')[0]}
                  className={cn('w-full px-3 py-2.5 rounded-xl bg-card border text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/50',
                    !deliveryDate ? 'border-amber-400' : 'border-border')} />
              </div>

              <div>
                <label className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-widest mb-1.5 block">Advance Amount (₹) *</label>
                {/* Toggle: click to fill full amount, click again to clear */}
                <div className="flex gap-2 mb-1.5">
                  <button onClick={() => { setAdvanceAmt(parseFloat(advanceAmt) === total ? '' : String(total)); setAdvanceErr(''); }}
                    className={cn('px-3 py-1 rounded-lg text-[11px] font-bold border transition active:scale-95 flex items-center gap-1.5',
                      parseFloat(advanceAmt) === total
                        ? 'bg-emerald-500 text-white border-transparent'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100')}>
                    {parseFloat(advanceAmt) === total ? <CheckCircle2 className="size-3" /> : null}
                    {parseFloat(advanceAmt) === total ? `Fully Paid ✓ (${fmt(total)})` : `Full Amount (${fmt(total)})`}
                  </button>
                </div>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input type="number" placeholder="Enter advance amount" value={advanceAmt} onChange={e => { setAdvanceAmt(e.target.value); setAdvanceErr(''); }}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-card border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
                </div>
                {advanceAmt && !isNaN(parseFloat(advanceAmt)) && parseFloat(advanceAmt) > 0 && (() => {
                  const paid = parseFloat(advanceAmt);
                  const balance = total - paid;
                  if (Math.abs(balance) < 0.01) return (
                    <div className="flex justify-between mt-1.5 px-1">
                      <span className="text-[11px] font-body text-emerald-600 font-semibold">✓ Full amount — no balance due</span>
                    </div>
                  );
                  if (balance > 0) return (
                    <div className="flex justify-between mt-1.5 px-1">
                      <span className="text-[11px] font-body text-muted-foreground">Balance due</span>
                      <span className="text-[11px] font-body font-bold text-red-600 tabular-nums">{fmt(balance)}</span>
                    </div>
                  );
                  return null;
                })()}
              </div>
              <div>
                <label className="text-[10px] font-body font-bold text-amber-700 uppercase tracking-widest mb-1.5 block">Payment Method *</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['cash', 'upi', 'card'] as const).map(m => (
                    <button key={m} onClick={() => { setAdvanceMethod(m); setAdvanceErr(''); }}
                      className={cn('flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-[11px] font-body font-bold transition-all active:scale-95',
                        advanceMethod === m ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-border bg-card text-muted-foreground')}>
                      {PAYMENT_ICONS[m]}{m.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {advanceErr && <p className="text-xs text-destructive flex items-center gap-1.5"><AlertCircle className="size-3" />{advanceErr}</p>}
              <button onClick={handleSubmit} disabled={submitting || allEmpty}
                className="w-full py-3.5 rounded-xl font-body font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-white"
                style={{ background: 'linear-gradient(135deg,#b8860b,#E07A3A)', boxShadow: '0 4px 16px rgba(184,134,11,0.35)' }}>
                <Wallet className="size-4" />{submitting ? 'Saving…' : '⏳ Record Advance Order'}
              </button>
            </div>
          )}

          {allEmpty && (
            <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
              <ShoppingCart className="size-8 opacity-20" />
              <p className="text-sm font-body">Add items to create an advance order</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Pending Balance Orders ── */}
      {pendingOrders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Clock className="size-4 text-amber-600" />
            <p className="text-xs font-body font-bold text-amber-800 uppercase">Pending Balance</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">{pendingOrders.length}</span>
          </div>
          <div className="space-y-3">
            {pendingOrders.map(o => <BranchAdvanceCard key={o.id} order={o} branch={branch} />)}
          </div>
        </div>
      )}

      {pendingOrders.length === 0 && !allEmpty === false && (
        <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
          <CheckCircle2 className="size-8 opacity-20" />
          <p className="text-sm font-body">No pending advance orders</p>
        </div>
      )}
    </div>
  );
}

// ─── Main BillTab ─────────────────────────────────────────────────────────────

// ─── BranchCreditPanel ────────────────────────────────────────────────────────
// Credit sale management panel — shared by VRSNB, SNB (and Hosur via HosurDashboard)

function BranchCreditPanel({ branch, creditSales }: {
  branch: Branch; creditSales: import('../branchStore').CreditSale[];
}) {
  const { settleCreditSale } = useBranchStore();
  const [filter, setFilter] = useState<'all' | 'pending' | 'partial' | 'settled'>('pending');
  const [settling, setSettling] = useState<string | null>(null);
  const [settleAmts, setSettleAmts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = creditSales.filter(cs => filter === 'all' || cs.status === filter);
  const totalDue = creditSales.filter(cs => cs.status !== 'settled').reduce((s, c) => s + c.creditAmount, 0);

  const handleSettle = async (cs: import('../branchStore').CreditSale) => {
    const amt = parseFloat(settleAmts[cs.id] || '0');
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return; }
    if (amt > cs.creditAmount) { setError('Amount exceeds balance due'); return; }
    setSettling(cs.id); setError('');
    const err = await settleCreditSale(branch, cs.id, amt);
    setSettling(null);
    if (err) setError(err);
    else setSettleAmts(prev => { const n = {...prev}; delete n[cs.id]; return n; });
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-red-100 text-red-700 border-red-200',
    partial: 'bg-amber-100 text-amber-700 border-amber-200',
    settled: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };

  return (
    <div className="p-3 space-y-3 pb-6">
      {/* Summary banner */}
      <div className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-orange-700 uppercase tracking-widest mb-1">Total Credit Outstanding</p>
        <p className="font-display text-3xl font-bold text-orange-600 tabular-nums">
          ₹{totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {creditSales.filter(cs => cs.status !== 'settled').length} open accounts · {branch}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-xl text-xs text-destructive">
          <AlertCircle className="size-3 shrink-0" />{error}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {(['all','pending','partial','settled'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-3 py-1.5 rounded-full text-[11px] font-bold border transition',
              filter === f ? 'bg-amber-500 text-white border-transparent' : 'bg-card border-border text-muted-foreground')}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && (
              <span className="ml-1 opacity-70">({creditSales.filter(cs => cs.status === f).length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Credit sale cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-2 text-muted-foreground">
          <Wallet className="size-8 opacity-20" />
          <p className="text-sm font-body">No {filter !== 'all' ? filter : ''} credit sales</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(cs => (
            <div key={cs.id} className="bg-card border-2 border-border rounded-2xl overflow-hidden">
              {/* Card header */}
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-body font-bold text-sm text-foreground truncate">{cs.customerName || '—'}</span>
                    <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border', statusColors[cs.status])}>
                      {cs.status.toUpperCase()}
                    </span>
                  </div>
                  {cs.customerPhone && <p className="text-xs text-muted-foreground mt-0.5">{cs.customerPhone}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Bill #{cs.billNo.split('-').pop()} · {new Date(cs.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })} · {cs.soldBy}
                  </p>
                  {cs.dueDate && (
                    <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                      Due: {new Date(cs.dueDate + 'T00:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                    </p>
                  )}
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className="text-[10px] text-muted-foreground">Due</p>
                  <p className="font-display font-bold text-lg text-red-600 tabular-nums">
                    ₹{cs.creditAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Expand/collapse */}
              <button onClick={() => setExpanded(prev => prev === cs.id ? null : cs.id)}
                className="w-full flex items-center justify-between px-4 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground">
                <span>Total: ₹{cs.subtotal.toLocaleString('en-IN', { minimumFractionDigits:2 })} · Paid: ₹{cs.amountPaid.toLocaleString('en-IN', { minimumFractionDigits:2 })}</span>
                {expanded === cs.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              </button>

              {expanded === cs.id && (
                <div className="px-4 py-3 border-t border-border/50 space-y-1.5">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Items</p>
                  {cs.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-foreground">{item.quantity}{item.sellUnit === 'kg' ? 'kg' : '×'} {item.itemName}</span>
                      <span className="font-bold tabular-nums">₹{item.lineTotal.toLocaleString('en-IN', { minimumFractionDigits:2 })}</span>
                    </div>
                  ))}
                  {cs.notes && <p className="text-xs text-muted-foreground italic mt-1">"{cs.notes}"</p>}
                </div>
              )}

              {/* Collect payment */}
              {cs.status !== 'settled' && (
                <div className="px-4 py-3 border-t border-border bg-muted/10 space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Collect Payment</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                      <input type="number" placeholder={`Max ₹${cs.creditAmount.toFixed(2)}`}
                        value={settleAmts[cs.id] || ''}
                        onChange={e => setSettleAmts(prev => ({...prev, [cs.id]: e.target.value}))}
                        className="w-full pl-7 pr-2 py-2 rounded-xl bg-card border border-border text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-400/40" />
                    </div>
                    <button onClick={() => handleSettle(cs)} disabled={settling === cs.id || !settleAmts[cs.id]}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-bold active:scale-95 disabled:opacity-50 transition">
                      {settling === cs.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                      {settling === cs.id ? '…' : 'Collect'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BillTab({ branch, branchStock, advanceOrders = [] }: Props) {
  const { recordSale, recordSnbSale, recordCreditSale } = useBranchStore();
  const { currentUser } = useAuthStore();
  const colors = BRANCH_COLORS[branch];
  const soldBy = currentUser?.displayName || currentUser?.username || 'Staff';
  const isVRSNB = branch === 'VRSNB';
  const isSNB   = SNB_BRANCHES.includes(branch);  // SNB + Hosur + VRSNB all use price list

  // Cart
  const [cart, setCart]     = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<SnbCategory | VrsnbCategory | 'All'>('All');
  const billNo = useRef<string>('…');
  // Fetch the first bill number on mount
  useEffect(() => { fetchNextBillNo().then(n => { billNo.current = n; }); }, []);

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'bill' | 'advance' | 'alert' | 'credit'>('bill');
  const pendingAdvance = advanceOrders.filter(o => o.status === 'pending');

  // Credit tab data — all branches
  const { creditSales: allCreditSales, settleCreditSale, fetchCreditSales } = useBranchStore();
  const branchCreditSales = (allCreditSales?.[branch] || []);
  const pendingCredit = branchCreditSales.filter(c => c.status !== 'settled').length;
  useEffect(() => { fetchCreditSales?.(branch); }, [branch]);

  // Alert tab — deliveries due today (VRSNB & SNB only)
  const isAlertBranch = branch === 'VRSNB' || branch === 'SNB';
  const todayStr = new Date().toISOString().split('T')[0];
  const todayDeliveries = useMemo(() =>
    advanceOrders.filter(o => o.deliveryDate === todayStr && o.status === 'pending'),
    [advanceOrders, todayStr]
  );
  const [alertPopupDismissed, setAlertPopupDismissed] = useState(false);
  const showAlertPopup = isAlertBranch && !alertPopupDismissed && todayDeliveries.length > 0 && activeTab === 'alert';

  // Discount
  const [discountType,  setDiscountType]  = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [showDiscount,  setShowDiscount]  = useState(false);

  // Payment
  const [payMode, setPayMode]           = useState<'single'|'split'|'credit'>('single');
  const [singleMethod, setSingle]       = useState<PaymentMethod|null>(null);
  const [splitMethods, setSplitMethods] = useState<[PaymentMethod|null,PaymentMethod|null]>([null,null]);
  const [splitAmounts, setSplitAmounts] = useState<[string,string]>(['','']);

  // Credit sale
  const [customerName, setCustomerName]   = useState('');
  const [creditAmountPaid, setCreditAmountPaid] = useState('');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [creditNotes, setCreditNotes]     = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // UI
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCancel,  setShowCancel]  = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const resetPayment = useCallback(() => {
    setPayMode('single'); setSingle(null);
    setSplitMethods([null,null]); setSplitAmounts(['','']);
    setCreditAmountPaid(''); setCreditDueDate(''); setCreditNotes(''); setCustomerPhone(''); setCustomerName('');
    setError('');
  }, []);

  const clearCart = useCallback(() => {
    setCart([]); resetPayment();
    setDiscountValue(''); setShowDiscount(false);
    fetchNextBillNo().then(n => { billNo.current = n; });
  }, [resetPayment]);

  useEffect(() => { clearCart(); setSearch(''); setActiveCategory('All'); }, [branch]);

  // ── Item source: price list (SNB/Hosur/VRSNB) or stock (Cafe) ─────────────
  // Prices are read from itemPriceStore (Supabase overrides) with static list as fallback.
  const { getPrice: getSnbPrice, getName: getSnbName, fetchOverrides: fetchSnbOverrides } = useItemPriceStore();
  const snbPriceBranch = isVRSNB ? 'VRSNB' : 'SNB';

  useEffect(() => { fetchSnbOverrides(snbPriceBranch); }, [snbPriceBranch]);

  const rawStaticItems = isVRSNB ? VRSNB_ITEMS : SNB_ITEMS;
  const activeItems = useMemo(() =>
    rawStaticItems.map(i => ({
      ...i,
      name:  getSnbName(snbPriceBranch, i.barcode, i.name),
      price: getSnbPrice(snbPriceBranch, i.barcode, i.price),
    })),
  [rawStaticItems, snbPriceBranch, getSnbPrice, getSnbName]);
  const activeCategories = isVRSNB ? VRSNB_CATEGORIES : SNB_CATEGORIES;

  const snbFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeItems.filter((item) => {
      // When searching: search ALL items regardless of selected category
      if (q) return item.name.toLowerCase().includes(q);
      // When browsing: filter by category
      return activeCategory === 'All' || item.category === activeCategory;
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

  const splitReady = payMode === 'credit'
    ? true // credit always "ready" — amount paid can be 0 (full credit)
    : payMode === 'split'
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
    const methodLabel = payMode === 'credit' ? 'credit' : buildMethodLabel();
    // BILL-FIX: wrap entire checkout in try/finally so setSubmitting(false) is
    // guaranteed even if recordSale/recordSnbSale throws unexpectedly.
    try {

    // ── Credit sale path ──────────────────────────────────────────────────────
    if (payMode === 'credit') {
      const amtPaid = parseFloat(creditAmountPaid) || 0;
      const creditItems = cart.map(c => ({
        itemName: c.itemName, quantity: c.quantity,
        sellUnit: (c.sellUnit ?? 'pcs') as 'kg' | 'pcs',
        price: c.price ?? 0, lineTotal: c.lineTotal ?? 0,
      }));
      const creditErr = await recordCreditSale(branch, {
        branch, customerName: customerName.trim() || 'Customer',
        customerPhone: customerPhone.trim() || null, items: creditItems,
        subtotal: finalTotal, amountPaid: amtPaid,
        creditAmount: Math.max(0, finalTotal - amtPaid),
        soldBy, dueDate: creditDueDate || null, notes: creditNotes.trim() || null,
        billNo: billNo.current,
      });
      if (creditErr) { setError(creditErr); return; }
      // Still record each sale for history/stock
      if (isSNB) {
        for (const item of cart) {
          await recordSnbSale(branch, item.itemName, item.quantity, soldBy, 'credit', item.price ?? 0, billNo.current);
        }
      } else {
        for (const item of cart) {
          await recordSale(branch, item.itemName, item.quantity, soldBy, 'credit', billNo.current, item.price ?? 0);
        }
      }
    } else if (isSNB) {
      // C-04 NOTE: items are committed one-by-one (no DB-level rollback).
      // TODO: replace with a single atomic complete_checkout() RPC once backend is ready.
      const snbSucceeded: string[] = [];
      for (const item of cart) {
        const { error: err } = await recordSnbSale(
          branch, item.itemName, item.quantity, soldBy, methodLabel, item.price ?? 0, billNo.current,
        );
        if (err) {
          setError(
            `Failed on "${item.itemName}": ${err}.` +
            (snbSucceeded.length > 0 ? ` Already saved: ${snbSucceeded.join(', ')} — notify manager to reverse.` : ''),
          );
          return;
        }
        snbSucceeded.push(item.itemName);
      }
    } else {
      // VRSNB — stock-gated sale
      const succeeded: string[] = [];
      for (const item of cart) {
        const err = await recordSale(branch, item.itemName, item.quantity, soldBy, methodLabel, billNo.current, item.price ?? 0);
        if (err) {
          setError(`Failed on "${item.itemName}": ${err}.${succeeded.length > 0 ? ` (Saved: ${succeeded.join(', ')})` : ''}`);
          return;
        }
        succeeded.push(item.itemName);
      }
    }

      setShowPreview(false); setShowSuccess(true);
      clearCart(); setTimeout(() => setShowSuccess(false), 2500);
      return true; // L-03 FIX: signal success so callers can gate printing
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed — please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintAndConfirm = async () => {
    // B6 FIX: guard against double-fire (submitting already true from direct checkout btn)
    if (submitting) return;
    // PRINT-FIX: snapshot all bill data BEFORE doCheckout() since clearCart() will
    // reset cart, discount, payment state — printBill must use the pre-checkout values.
    const printSnapshot = {
      items: [...cart], subtotal, discount, discountType, discountValue,
      roundOff, finalTotal, payMode, singleMethod,
      splitMethods: [...splitMethods] as [PaymentMethod|null, PaymentMethod|null],
      splitAmounts: [...splitAmounts] as [string, string],
      billNoSnapshot: billNo.current,
      customerNameSnapshot: customerName.trim() || 'Customer',
      creditAmountPaidSnapshot: parseFloat(creditAmountPaid) || 0,
    };
    // L-03 FIX: run checkout first; only print bill/KOT if it succeeds
    const success = await doCheckout();
    if (!success) return;
    printBill({ branch, billNo: printSnapshot.billNoSnapshot, items: printSnapshot.items,
      subtotal: printSnapshot.subtotal, discount: printSnapshot.discount,
      discountType: printSnapshot.discountType, discountValue: printSnapshot.discountValue,
      roundOff: printSnapshot.roundOff, finalTotal: printSnapshot.finalTotal,
      cgst: cafeCgst, sgst: cafeSgst,
      payMode: printSnapshot.payMode, singleMethod: printSnapshot.singleMethod,
      splitMethods: printSnapshot.splitMethods, splitAmounts: printSnapshot.splitAmounts, soldBy,
      customerName: printSnapshot.customerNameSnapshot,
      creditAmountPaid: printSnapshot.creditAmountPaidSnapshot,
    });
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
    // U-04 FIX: use flex-1 so this fills whatever space the parent leaves — no magic pixel values
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">

      {/* ── Tab switcher (compact top bar) ── */}
      <div className="flex gap-2 p-2 bg-slate-50 border-b border-slate-200 shrink-0 overflow-x-auto">
        <button onClick={() => setActiveTab('bill')}
          className={cn('flex-1 min-w-fit py-2.5 px-3 rounded-2xl text-sm font-body font-black transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]',
            activeTab === 'bill' ? 'bg-slate-950 shadow text-white' : 'text-slate-500 hover:bg-white active:scale-95')}>
          <Receipt className="size-3.5" />Bill
        </button>
        <button onClick={() => setActiveTab('advance')}
          className={cn('flex-1 min-w-fit py-2.5 px-3 rounded-2xl text-sm font-body font-black transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]',
            activeTab === 'advance' ? 'bg-amber-500 shadow text-white' : 'text-slate-500 hover:bg-white active:scale-95')}>
          <Wallet className="size-3.5" />Advance
          {pendingAdvance.length > 0 && (
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              activeTab === 'advance' ? 'bg-amber-500 text-white' : 'bg-amber-200 text-amber-800')}>
              {pendingAdvance.length}
            </span>
          )}
        </button>
        {/* Alert tab — VRSNB & SNB only */}
        {isAlertBranch && (
          <button onClick={() => setActiveTab('alert')}
            className={cn('flex-1 min-w-fit py-2.5 px-3 rounded-2xl text-sm font-body font-black transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]',
              activeTab === 'alert' ? 'bg-red-500 shadow text-white' : 'text-slate-500 hover:bg-white active:scale-95')}>
            <Bell className={cn("size-3.5", todayDeliveries.length > 0 && "text-red-500 animate-pulse")} />Alert
            {todayDeliveries.length > 0 && (
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                activeTab === 'alert' ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700')}>
                {todayDeliveries.length}
              </span>
            )}
          </button>
        )}
        {/* Credit tab — all branches */}
        <button onClick={() => setActiveTab('credit')}
          className={cn('flex-1 min-w-fit py-2.5 px-3 rounded-2xl text-sm font-body font-black transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]',
            activeTab === 'credit' ? 'bg-orange-500 shadow text-white' : 'text-slate-500 hover:bg-white active:scale-95')}>
          <IndianRupee className={cn("size-3.5", pendingCredit > 0 && "text-orange-500")} />Credit
          {pendingCredit > 0 && (
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
              activeTab === 'credit' ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-700')}>
              {pendingCredit}
            </span>
          )}
        </button>
      </div>

      {/* ── Advance tab ── */}
      <div className={cn('flex-1 overflow-y-auto', activeTab !== 'advance' && 'hidden')}>
        <div className="p-3">
          <BranchAdvancePanel branch={branch} advanceOrders={advanceOrders} />
        </div>
      </div>

      {/* ── Alert tab (today's deliveries) — VRSNB & SNB only ── */}
      {isAlertBranch && activeTab === 'alert' && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Bell className={cn("size-5", todayDeliveries.length > 0 ? "text-red-500" : "text-muted-foreground")} />
              <h2 className="font-display font-bold text-base text-foreground">Today's Deliveries</h2>
              <span className="text-xs text-muted-foreground ml-auto">
                {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
              </span>
            </div>
            {todayDeliveries.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
                <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
                  <CheckCircle2 className="size-8 opacity-30" />
                </div>
                <p className="text-sm font-body">No deliveries due today</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle className="size-4 text-red-500 shrink-0" />
                  <p className="text-xs font-body font-semibold text-red-700">
                    {todayDeliveries.length} order{todayDeliveries.length > 1 ? 's' : ''} must be delivered today!
                  </p>
                </div>
                {todayDeliveries.map(order => (
                  <div key={order.id} className="bg-card border-2 border-red-300 rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-red-50 px-4 py-3 flex items-center justify-between border-b border-red-100">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 w-fit">DELIVER TODAY</span>
                        {order.customerName && <span className="text-sm font-bold mt-0.5">{order.customerName}</span>}
                        <span className="text-[10px] text-muted-foreground">by {order.soldBy}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Balance</p>
                        <p className="text-base font-display font-bold text-red-600">₹{order.balanceDue.toLocaleString('en-IN', {minimumFractionDigits:2})}</p>
                      </div>
                    </div>
                    <div className="px-4 py-3 space-y-1">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span>{item.quantity}{item.sellUnit === 'kg' ? 'kg' : '×'} {item.itemName}</span>
                          <span className="font-bold">₹{item.lineTotal.toLocaleString('en-IN', {minimumFractionDigits:2})}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Popup */}
          {showAlertPopup && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
                <div className="bg-red-500 px-5 py-5 text-white text-center">
                  <Bell className="size-8 mx-auto mb-2" />
                  <h3 className="font-display text-xl font-bold">Delivery Alert!</h3>
                  <p className="text-red-100 text-sm mt-1">{todayDeliveries.length} order{todayDeliveries.length > 1 ? 's' : ''} due today</p>
                </div>
                <div className="px-5 py-4 max-h-56 overflow-y-auto space-y-2">
                  {todayDeliveries.map(order => (
                    <div key={order.id} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      <div>
                        <p className="text-sm font-bold">{order.customerName || 'Customer'}</p>
                        <p className="text-xs text-muted-foreground">Balance: ₹{order.balanceDue.toLocaleString('en-IN', {minimumFractionDigits:2})}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-5 pb-5 pt-2">
                  <button onClick={() => setAlertPopupDismissed(true)}
                    className="w-full py-3 rounded-xl bg-red-500 text-white font-bold text-sm">
                    Got it — I'll deliver these today
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Credit tab ── */}
      {activeTab === 'credit' && (
        <div className="flex-1 overflow-y-auto">
          <BranchCreditPanel branch={branch} creditSales={branchCreditSales} />
        </div>
      )}

      {/* ── Bill tab: 3-column POS layout ── */}
      {activeTab === 'bill' && (
        <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-50/70">

          {/* ═══ COL 1: Category sidebar — 25% of screen ══════════════════════ */}
          {isSNB && (
            <div className="w-[25%] shrink-0 flex flex-col border-r border-slate-200 bg-white overflow-y-auto">
              {(['All', ...activeCategories] as const).map((cat) => {
                const isActive = activeCategory === cat && !search.trim();
                const catCount = cat === 'All'
                  ? activeItems.length
                  : activeItems.filter(i => i.category === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => { setActiveCategory(cat as SnbCategory | VrsnbCategory | 'All'); setSearch(''); }}
                    className={cn(
                      'w-full text-left px-2.5 py-3 border-b border-border/50 transition-all',
                      isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground',
                    )}
                  >
                    <p className={cn('text-[11px] font-bold leading-tight', isActive ? 'text-primary-foreground' : 'text-foreground')}>
                      {cat === 'All' ? 'All Items' : cat}
                    </p>
                    <p className={cn('text-[10px] mt-0.5 tabular-nums', isActive ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                      {catCount} items
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* ═══ COL 2: Search + Item grid — 45% (flex-1 fills remaining after COL1+COL3) */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-slate-50/70">

            {/* Search bar — always at top, searches ALL items */}
            <div className="px-3 py-2.5 border-b border-border bg-background shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder={`Search all ${totalItemCount} items…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-muted/50 border border-border text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-card transition-all"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="size-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              {search.trim() ? (
                <p className="text-[11px] text-primary font-semibold mt-1.5 px-1">
                  {displayItems.length} result{displayItems.length !== 1 ? 's' : ''} across all categories
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
                  {isSNB
                    ? (activeCategory === 'All' ? `${totalItemCount} items` : `${displayItems.length} of ${totalItemCount} in ${activeCategory}`)
                    : `${totalItemCount} items in stock`}
                </p>
              )}
            </div>

            {/* Item grid — scrolls independently */}
            <div className="flex-1 overflow-y-auto p-4">
              {displayItems.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground bg-muted/30 rounded-2xl border border-dashed">
                  {totalItemCount === 0 ? 'No items in stock.' : 'No items match your search.'}
                </div>
              ) : isSNB ? (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
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
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
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

              {cart.length === 0 && totalItemCount > 0 && (
                <div className="flex items-center gap-2 mt-3 px-3 py-2.5 bg-muted/30 rounded-xl text-xs text-muted-foreground border border-dashed">
                  <ShoppingCart className="size-3.5 shrink-0" />
                  Tap any item to add to bill
                  <ChevronRight className="size-3.5 ml-auto shrink-0" />
                </div>
              )}
            </div>
          </div>

          {/* ═══ COL 3: Bill panel — 35% of screen ═══════════════════════════ */}
          <div className="w-[30%] shrink-0 flex flex-col border-l border-slate-200 bg-white overflow-hidden shadow-[-12px_0_30px_rgba(15,23,42,0.06)]">

            {/* Bill header */}
            <div className="px-4 py-3 bg-zinc-900 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Receipt className="size-4 text-amber-400" />
                  <span className="font-semibold text-base text-white">Bill</span>
                  <span className="text-[10px] font-mono text-zinc-400">{billNo.current}</span>
                </div>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', colors.badge)}>
                      {cart.length} {cart.length === 1 ? 'item' : 'items'}
                    </span>
                  )}
                  {cart.length > 0 && (
                    <button onClick={() => setShowCancel(true)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-900/30 hover:bg-red-900/50 px-2.5 py-1 rounded-lg transition">
                      <XCircle className="size-3" /> Cancel
                    </button>
                  )}
                </div>
              </div>
              {allPriced && cart.length > 0 && (
                <div className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2">
                  <span className="text-xs text-zinc-300">Total</span>
                  <span className="font-display text-xl font-bold text-amber-400 tabular-nums">{fmt(subtotal)}</span>
                </div>
              )}
              {cart.length === 0 && (
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                  <ShoppingCart className="size-3.5 text-zinc-500" />
                  <span className="text-xs text-zinc-500">No items added yet</span>
                </div>
              )}
            </div>

            {/* Cart line items — scroll independently */}
            {cart.length > 0 && (
              <div className="flex-1 overflow-y-auto divide-y min-h-0">
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
            )}

            {/* Totals + payment — fixed at bottom, own scroll if tall */}
            {cart.length > 0 && (
              <div className="border-t border-slate-200 px-4 py-4 space-y-3 bg-slate-50/70 flex-1 overflow-y-auto" style={{ minHeight: 0 }}>

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-semibold tabular-nums text-foreground">{allPriced ? fmt(subtotal) : '—'}</span>
                </div>

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

                {isSNB && allPriced && roundOff !== 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Round-Off</span>
                    <span className="font-semibold tabular-nums">{roundOff > 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
                  </div>
                )}

                <div className={cn('flex items-center justify-between rounded-xl px-4 py-3',
                  allPriced ? 'bg-primary text-primary-foreground' : 'bg-amber-50 border border-amber-100')}>
                  <div>
                    <p className={cn('text-sm font-bold', allPriced ? 'text-primary-foreground' : 'text-foreground')}>
                      {isSNB ? 'Net Bill' : 'Total'}
                      {discount > 0 && <span className="text-[10px] font-normal opacity-70 ml-1">(after discount)</span>}
                    </p>
                    {discount > 0 && allPriced && (
                      <p className="text-[10px] opacity-70 line-through tabular-nums">{fmt(subtotal)}</p>
                    )}
                  </div>
                  {allPriced
                    ? <span className="font-display text-3xl font-bold tabular-nums">{fmt(finalTotal)}</span>
                    : <span className="text-xs text-amber-600 font-medium">⚠ Enter prices</span>}
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payment</p>
                  <div className="grid grid-cols-4 gap-1.5">
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

                  {/* ── Credit payment button (row below) ── */}
                  <button onClick={() => { setPayMode('credit'); setSingle(null); setCreditAmountPaid(''); setError(''); }}
                    className={cn('w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border transition active:scale-95',
                      payMode === 'credit' ? 'bg-red-600 text-white border-transparent shadow-md' : 'bg-card border-border hover:bg-muted/50 text-muted-foreground')}>
                    <Wallet className="size-4" />Credit Sale
                  </button>

                  {/* ── Credit details panel ── */}
                  {payMode === 'credit' && (
                    <div className="rounded-2xl border-2 border-red-200 bg-red-50/60 overflow-hidden">
                      <div className="px-4 py-2 bg-red-600">
                        <p className="text-xs font-bold text-white uppercase tracking-wider text-center">Credit Sale</p>
                      </div>
                      <div className="p-3 space-y-2.5">
                        {/* Customer name */}
                        <input type="text" placeholder="Customer name (required)"
                          value={customerName} onChange={e => setCustomerName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-red-200 text-sm font-body focus:outline-none focus:ring-2 focus:ring-red-300" />

                        <div className="relative">
                          <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                          <input type="number" placeholder="Amount paid now (0 = full credit)"
                            value={creditAmountPaid} onChange={e => setCreditAmountPaid(e.target.value)}
                            className="w-full pl-7 pr-2 py-2 rounded-xl bg-white border border-red-200 text-sm font-body focus:outline-none focus:ring-2 focus:ring-red-300" />
                        </div>
                        {allPriced && (
                          <div className={cn('flex items-center justify-between rounded-xl px-3 py-2',
                            (finalTotal - (parseFloat(creditAmountPaid)||0)) > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>
                            <span className="text-xs font-bold">Credit Due</span>
                            <span className="text-sm font-bold tabular-nums">
                              ₹{Math.max(0, finalTotal - (parseFloat(creditAmountPaid)||0)).toLocaleString('en-IN', {minimumFractionDigits:2})}
                            </span>
                          </div>
                        )}
                        <input type="tel" placeholder="Customer phone (optional)"
                          value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-red-200 text-sm font-body focus:outline-none focus:ring-2 focus:ring-red-300" />
                        <input type="date" placeholder="Due date (optional)"
                          value={creditDueDate} onChange={e => setCreditDueDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-red-200 text-sm font-body focus:outline-none focus:ring-2 focus:ring-red-300" />
                        <input type="text" placeholder="Notes (optional)"
                          value={creditNotes} onChange={e => setCreditNotes(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-red-200 text-sm font-body focus:outline-none focus:ring-2 focus:ring-red-300" />
                        <p className="text-[10px] text-muted-foreground">Credit report will be sent to branch admin & main admin.</p>
                      </div>
                    </div>
                  )}

                  {payMode === 'split' && (
                    <div className="rounded-2xl border-2 border-violet-200 bg-violet-50/60 overflow-hidden">
                      <div className="px-4 py-2 bg-violet-600">
                        <p className="text-xs font-bold text-white uppercase tracking-wider text-center">Part Payment</p>
                      </div>
                      <div className="p-3 space-y-3">
                        {([0,1] as const).map((idx) => {
                          const other = splitMethods[idx === 0 ? 1 : 0];
                          const label = idx === 0 ? '1st Payment' : '2nd Payment';
                          return (
                            <div key={idx} className="space-y-2">
                              <p className="text-[11px] font-bold text-violet-700">{label}</p>
                              <div className="grid grid-cols-3 gap-1.5">
                                {PAYMENT_OPTIONS.map((m) => {
                                  const chosen  = splitMethods[idx] === m.key;
                                  const blocked = other === m.key;
                                  return (
                                    <button key={m.key}
                                      onClick={() => !blocked && selectSplitMethod(idx, m.key)}
                                      disabled={blocked}
                                      className={cn(
                                        'py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 border-2 transition active:scale-95',
                                        chosen  ? 'bg-violet-600 text-white border-violet-600 shadow-md'
                                        : blocked ? 'opacity-25 bg-muted border-muted cursor-not-allowed'
                                        : 'bg-white border-border hover:border-violet-300',
                                      )}>
                                      {m.icon}{m.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className={cn(
                                'flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 bg-white transition',
                                splitMethods[idx] ? 'border-violet-300' : 'border-border opacity-50',
                              )}>
                                <span className="text-lg font-bold text-muted-foreground">₹</span>
                                <input
                                  type="number" inputMode="decimal" min="0" step="1"
                                  value={splitAmounts[idx]}
                                  onChange={(e) => handleSplitAmount(idx, e.target.value)}
                                  disabled={!splitMethods[idx]}
                                  placeholder={splitMethods[idx] ? (allPriced ? String(Math.round(finalTotal / 2)) : '0') : 'Select first'}
                                  className="flex-1 text-lg font-bold tabular-nums bg-transparent focus:outline-none disabled:cursor-not-allowed placeholder:text-muted-foreground/40 placeholder:text-xs placeholder:font-normal"
                                />
                              </div>
                            </div>
                          );
                        })}
                        {allPriced && (splitTotal0 > 0 || splitTotal1 > 0) && (
                          <div className={cn(
                            'flex items-center justify-between rounded-xl px-3 py-2.5 font-bold',
                            Math.abs(splitPending) < 0.01 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
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

                <div className="pt-1">
                  <button
                    onClick={handlePrintAndConfirm}
                    disabled={cart.length === 0 || submitting || !splitReady}
                    className="w-full py-3.5 rounded-2xl bg-orange-500 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition shadow-lg shadow-orange-200">
                    {submitting
                      ? <><Loader2 className="size-4 animate-spin" /> Processing…</>
                      : <><Printer className="size-4" /> Bill &amp; Print</>}
                  </button>
                </div>
              </div>
            )}
          </div>
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
          customerName={customerName.trim() || undefined}
          creditAmountPaid={parseFloat(creditAmountPaid) || 0}
          onClose={() => setShowPreview(false)}
          onConfirmPrint={handlePrintAndConfirm} />
      )}
    </div>
  );
}
