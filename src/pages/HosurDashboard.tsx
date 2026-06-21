// src/pages/HosurDashboard.tsx
// Hosur branch workflow dashboard: shop master, shop-wise pricing, receiving,
// billing, credit, WhatsApp logs, reminders, disputes, daily closure and reports.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  BadgeCheck,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Download,
  FileSpreadsheet,
  IndianRupee,
  Loader2,
  MessageCircle,
  PackageCheck,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Store,
  WalletCards,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useBranchStore } from '@/branch/branchStore';
import { SNB_CATEGORIES, SNB_ITEMS } from '@/branch/snbItems';
import type { SnbItem } from '@/branch/snbItems';
import { HOSUR_VRSNB_PRICE_LIST } from '@/data/hosurVrsnbPriceList';

const BRANCH = 'Hosur' as const;
const TODAY_ISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const money = (value: number | null | undefined) =>
  `₹${Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const num = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cleanPhone = (value: string | null | undefined) => String(value ?? '').replace(/\D/g, '');
const toDateLabel = (value?: string | null) => {
  if (!value) return '—';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: dateOnly ? 'Asia/Kolkata' : undefined });
};
const toDateTimeLabel = (value?: string | null) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const daysBetween = (from: string, to = new Date()) => Math.floor((to.getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000);

type HosurTab =
  | 'shops'
  | 'newOrder'
  | 'receiving'
  | 'billing'
  | 'credit'
  | 'collection'
  | 'whatsapp'
  | 'reminders'
  | 'closure'
  | 'reports'
  | 'notifications';

type PaymentType = 'full' | 'credit' | 'partial';
type PaymentMode = 'cash' | 'upi' | 'card' | 'bank' | 'mixed';
type OrderStatus = 'draft' | 'pending_packing' | 'dispatched' | 'received_confirmed' | 'billing_draft' | 'billed' | 'cancelled';
type BillStatus = 'draft' | 'confirmed' | 'paid' | 'credit_open' | 'partial_credit' | 'settled' | 'cancelled';
type DisputeStatus = 'open' | 'approved' | 'rejected' | 'cleared' | 'resolved';

interface HosurShop {
  id: string;
  shopName: string;
  whatsappNumber: string;
  address: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string | null;
  /** Default discount % for items not in the shop's custom price list (0 = no discount) */
  discountPercent: number;
}

interface HosurShopPrice {
  id: string;
  shopId: string;
  itemName: string;
  itemUnit: 'pcs' | 'kg';
  unitPrice: number;
  isActive: boolean;
  updatedAt?: string | null;
}

interface HosurOrder {
  id: string;
  orderNumber: string;
  shopId: string;
  shopName: string;
  shopWhatsapp: string;
  shopAddress: string;
  status: OrderStatus;
  subtotal: number;
  createdBy: string;
  createdAt: string;
  receivedAt?: string | null;
  billId?: string | null;
  notes?: string | null;
}

interface HosurOrderItem {
  id: string;
  orderId: string;
  itemName: string;
  unit: 'pcs' | 'kg';
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
}

interface HosurBill {
  id: string;
  billNo: string;
  orderId: string | null;
  shopId: string;
  shopName: string;
  shopWhatsapp: string;
  subtotal: number;
  paidAmount: number;
  creditAmount: number;
  paymentType: PaymentType | null;
  paymentMode: PaymentMode | null;
  dueDate: string | null;
  status: BillStatus;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  whatsappStatus: 'pending' | 'queued' | 'sent' | 'failed' | null;
}

interface HosurBillItem {
  id: string;
  billId: string;
  itemName: string;
  unit: 'pcs' | 'kg';
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface HosurCreditLedger {
  id: string;
  billId: string;
  billNo: string;
  shopId: string;
  shopName: string;
  openingAmount: number;
  paidAmount: number;
  balanceAmount: number;
  dueDate: string | null;
  status: 'open' | 'partial' | 'cleared' | 'overdue';
  createdAt: string;
  clearedAt: string | null;
  // FIX (MD Bug #21): added to distinguish wholesale shop-supply credit from retail counter credit
  creditType: 'wholesale' | 'retail';
}

interface HosurCreditPayment {
  id: string;
  ledgerId: string;
  billId: string;
  shopId: string;
  amountCollected: number;
  paymentMode: PaymentMode;
  remarks: string | null;
  payment_purpose: 'credit_collection' | 'partial_at_billing' | string | null;
  collectedBy: string;
  collectedRole: string;
  createdAt: string;
}

interface HosurWhatsappLog {
  id: string;
  shopId: string | null;
  shopName: string;
  phone: string;
  billId: string | null;
  billNo: string | null;
  messageType: 'bill' | 'reminder' | 'manual';
  messageBody: string;
  status: 'queued' | 'sent' | 'failed';
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface HosurReminder {
  id: string;
  ledgerId: string;
  billId: string;
  shopId: string;
  shopName: string;
  pendingAmount: number;
  dueDate: string;
  reminderNo: number;
  status: 'queued' | 'sent' | 'failed';
  whatsappLogId: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface HosurDispute {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  itemName: string;
  expectedQuantity: number;
  receivedQuantity: number;
  unit: 'pcs' | 'kg';
  raisedBy: string;
  status: DisputeStatus;
  adminRemarks: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  refId?: string | null;
  refLabel?: string | null;
  isRead: boolean;
  createdAt: string;
}

interface DraftOrderItem {
  itemName: string;
  unit: 'pcs' | 'kg';
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  category: string;
}

interface HosurCatalogItem {
  barcode: number;
  name: string;
  price: number;
  uom: 'Nos' | 'Kgs';
  category: SnbItem['category'];
  source: 'master' | 'shop';
}

interface PaymentDraft {
  paidAmount: string;
  dueDate: string;
  paymentMode: PaymentMode;
  remarks: string;
}

const EMPTY_PAYMENT: PaymentDraft = { paidAmount: '', dueDate: '', paymentMode: 'cash', remarks: '' };
const HOSUR_TABS: HosurTab[] = ['shops', 'newOrder', 'receiving', 'billing', 'credit', 'collection', 'whatsapp', 'reminders', 'closure', 'reports', 'notifications'];
const KG_ITEM_HINTS = ['biscuit', 'cake', 'chips', 'mixture', 'murk', 'nippat', 'boondhi'];

function parseHosurTab(value: string | null): HosurTab {
  return HOSUR_TABS.includes(value as HosurTab) ? value as HosurTab : 'newOrder';
}

function masterItemFor(itemName: string) {
  return SNB_ITEMS.find((item) => normalize(item.name) === normalize(itemName));
}

function inferHosurItemUnit(itemName: string, price: number): 'Nos' | 'Kgs' {
  const master = masterItemFor(itemName);
  if (master) return master.uom;
  const key = normalize(itemName);
  return price >= 200 || KG_ITEM_HINTS.some((hint) => key.includes(hint)) ? 'Kgs' : 'Nos';
}

function inferHosurItemCategory(itemName: string): SnbItem['category'] {
  const master = masterItemFor(itemName);
  if (master) return master.category;
  const key = normalize(itemName);
  if (key.includes('bread') || key.includes('bun')) return 'Bread & Buns';
  if (key.includes('cake')) return 'Cakes (by kg)';
  if (key.includes('biscuit') || key.includes('rusk')) return 'Biscuits & Cookies';
  if (key.includes('mixture') || key.includes('murk') || key.includes('nippat') || key.includes('boondhi')) return 'Namkeens & Mixtures';
  if (key.includes('chips') || key.includes('pori')) return 'Packaged Snacks';
  return 'Buns & Pastries';
}

function buildHosurCatalogItems(prices: HosurShopPrice[], shopId?: string): HosurCatalogItem[] {
  const shopRows = shopId ? prices.filter((price) => price.shopId === shopId) : [];
  const hidden = new Set(shopRows.filter((price) => !price.isActive).map((price) => normalize(price.itemName)));
  const rows = new Map<string, HosurCatalogItem>();

  SNB_ITEMS.forEach((item) => {
    const key = normalize(item.name);
    if (!hidden.has(key)) rows.set(key, { ...item, source: 'master' });
  });

  shopRows.filter((price) => price.isActive).forEach((price, index) => {
    const key = normalize(price.itemName);
    const master = masterItemFor(price.itemName);
    rows.set(key, {
      barcode: master?.barcode ?? 90_000 + index,
      name: price.itemName,
      price: price.unitPrice,
      uom: price.itemUnit === 'kg' ? 'Kgs' : 'Nos',
      category: master?.category ?? inferHosurItemCategory(price.itemName),
      source: master ? 'master' : 'shop',
    });
  });

  return Array.from(rows.values()).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function mapShop(row: any): HosurShop {
  return {
    id: row.id,
    shopName: row.shop_name ?? '',
    whatsappNumber: row.whatsapp_number ?? '',
    address: row.address ?? '',
    isActive: row.is_active !== false,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? null,
    discountPercent: Number(row.discount_percent ?? 0),
  };
}

function mapPrice(row: any): HosurShopPrice {
  return {
    id: row.id,
    shopId: row.shop_id,
    itemName: row.item_name,
    itemUnit: row.item_unit === 'kg' ? 'kg' : 'pcs',
    unitPrice: Number(row.unit_price ?? 0),
    isActive: row.is_active !== false,
    updatedAt: row.updated_at ?? null,
  };
}

function mapOrder(row: any): HosurOrder {
  return {
    id: row.id,
    orderNumber: row.order_number ?? row.id?.slice(0, 8),
    shopId: row.shop_id,
    shopName: row.shop_name ?? '',
    shopWhatsapp: row.shop_whatsapp ?? '',
    shopAddress: row.shop_address ?? '',
    status: (row.status ?? 'pending_packing') as OrderStatus,
    subtotal: Number(row.subtotal ?? 0),
    createdBy: row.created_by ?? 'Staff',
    createdAt: row.created_at ?? new Date().toISOString(),
    receivedAt: row.received_at ?? null,
    billId: row.bill_id ?? null,
    notes: row.notes ?? null,
  };
}

function mapOrderItem(row: any): HosurOrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    itemName: row.item_name,
    unit: row.unit === 'kg' ? 'kg' : 'pcs',
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    lineTotal: Number(row.line_total ?? 0),
    dispatchedQuantity: Number(row.dispatched_quantity ?? row.quantity ?? 0),
    receivedQuantity: Number(row.received_quantity ?? 0),
  };
}

function mapBill(row: any): HosurBill {
  return {
    id: row.id,
    billNo: row.bill_no ?? '',
    orderId: row.order_id ?? null,
    shopId: row.shop_id,
    shopName: row.shop_name ?? '',
    shopWhatsapp: row.shop_whatsapp ?? '',
    subtotal: Number(row.subtotal ?? 0),
    paidAmount: Number(row.paid_amount ?? 0),
    creditAmount: Number(row.credit_amount ?? 0),
    paymentType: row.payment_type ?? null,
    paymentMode: row.payment_mode ?? null,
    dueDate: row.due_date ?? null,
    status: (row.status ?? 'draft') as BillStatus,
    confirmedBy: row.confirmed_by ?? null,
    confirmedAt: row.confirmed_at ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    whatsappStatus: row.whatsapp_status ?? null,
  };
}

function mapBillItem(row: any): HosurBillItem {
  return {
    id: row.id,
    billId: row.bill_id,
    itemName: row.item_name,
    unit: row.unit === 'kg' ? 'kg' : 'pcs',
    quantity: Number(row.quantity ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    lineTotal: Number(row.line_total ?? 0),
  };
}

function mapCredit(row: any): HosurCreditLedger {
  return {
    id: row.id,
    billId: row.source_id ?? row.id,
    billNo: row.bill_no ?? '',
    shopId: row.customer_ref ?? '',
    shopName: row.customer_name ?? '',
    openingAmount: Number(row.subtotal ?? 0),
    paidAmount: Number(row.amount_paid ?? 0),
    balanceAmount: Number(row.credit_amount ?? 0),
    dueDate: row.due_date ?? null,
    status: row.status === 'settled' ? 'cleared' : row.status === 'partial' ? 'partial' : 'open',
    createdAt: row.created_at ?? new Date().toISOString(),
    clearedAt: row.settled_at ?? null,
    // FIX (MD Bug #21): map credit_type from DB column; fall back to shopId heuristic for pre-migration rows
    creditType: (row.credit_type as 'wholesale' | 'retail') ?? (row.source === 'hosur' ? 'wholesale' : 'retail'),
  };
}

function mapPayment(row: any): HosurCreditPayment {
  const linked = Array.isArray(row.branch_credit_sales) ? row.branch_credit_sales[0] : row.branch_credit_sales;
  return {
    id: row.id,
    ledgerId: row.credit_sale_id,
    billId: linked?.source_id ?? row.credit_sale_id,
    shopId: linked?.customer_ref ?? '',
    amountCollected: Number(row.amount ?? 0),
    paymentMode: row.payment_mode ?? 'cash',
    remarks: row.remarks ?? null,
    payment_purpose: row.payment_purpose ?? null,
    collectedBy: row.collected_by ?? 'Staff',
    collectedRole: row.collected_role ?? 'branch_hosur',
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapWhatsapp(row: any): HosurWhatsappLog {
  return {
    id: row.id,
    shopId: row.shop_id ?? null,
    shopName: row.shop_name ?? '',
    phone: row.phone ?? '',
    billId: row.bill_id ?? null,
    billNo: row.bill_no ?? null,
    messageType: row.message_type ?? 'manual',
    messageBody: row.message_body ?? '',
    status: row.status ?? 'queued',
    errorMessage: row.error_message ?? null,
    sentAt: row.sent_at ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapReminder(row: any): HosurReminder {
  return {
    id: row.id,
    ledgerId: row.credit_sale_id ?? row.ledger_id,
    billId: row.bill_id,
    shopId: row.shop_id,
    shopName: row.shop_name ?? '',
    pendingAmount: Number(row.pending_amount ?? 0),
    dueDate: row.due_date,
    reminderNo: Number(row.reminder_no ?? 1),
    status: row.status ?? 'queued',
    whatsappLogId: row.whatsapp_log_id ?? null,
    sentAt: row.sent_at ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapDispute(row: any): HosurDispute {
  return {
    id: row.id,
    orderId: row.order_id ?? null,
    orderNumber: row.order_number ?? null,
    itemName: row.item_name ?? '',
    expectedQuantity: Number(row.expected_quantity ?? 0),
    receivedQuantity: Number(row.received_quantity ?? 0),
    unit: row.unit === 'kg' ? 'kg' : 'pcs',
    raisedBy: row.raised_by ?? 'Branch',
    status: row.status ?? 'open',
    adminRemarks: row.admin_remarks ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    resolvedAt: row.resolved_at ?? null,
  };
}

function mapNotification(row: any): AdminNotification {
  return {
    id: row.id,
    type: row.type ?? 'hosur',
    title: row.title ?? '',
    body: row.body ?? '',
    refId: row.ref_id ?? null,
    refLabel: row.ref_label ?? null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

async function notifyAdmin(title: string, body: string, refId?: string, refLabel?: string, meta: Record<string, unknown> = {}) {
  const { error } = await supabase.from('admin_notifications').insert({
    type: 'hosur_branch',
    title,
    body,
    ref_id: refId ?? null,
    ref_label: refLabel ?? null,
    meta,
    recipient_role: 'admin',
    is_read: false,
  });
  if (error) throw new Error(`Admin notification failed: ${error.message}`);
}

async function notifyBranch(title: string, body: string, refId?: string, refLabel?: string, meta: Record<string, unknown> = {}) {
  const { error } = await supabase.from('admin_notifications').insert({
    type: 'hosur_branch',
    title,
    body,
    ref_id: refId ?? null,
    ref_label: refLabel ?? null,
    meta,
    recipient_role: 'branch_hosur',
    is_read: false,
  });
  if (error) throw new Error(`Branch notification failed: ${error.message}`);
}

function buildBillMessage(bill: HosurBill, items: HosurBillItem[]) {
  const lines = items.map((item, idx) =>
    `${idx + 1}. ${item.itemName} - ${num(item.quantity)} ${item.unit} × ${money(item.unitPrice)} = ${money(item.lineTotal)}`,
  ).join('\n');
  return [
    `Sri Nanjundeshwara Bakery - Hosur Branch`,
    `Shop: ${bill.shopName}`,
    `Bill No: ${bill.billNo}`,
    `Date: ${toDateTimeLabel(bill.confirmedAt ?? bill.createdAt)}`,
    '',
    lines,
    '',
    `Total Amount: ${money(bill.subtotal)}`,
    `Paid Amount: ${money(bill.paidAmount)}`,
    `Credit Amount: ${money(bill.creditAmount)}`,
    bill.dueDate ? `Due Date: ${toDateLabel(bill.dueDate)}` : '',
    '',
    `Please keep this bill for your records. Thank you.`,
  ].filter(Boolean).join('\n');
}

function buildReminderMessage(ledger: HosurCreditLedger) {
  return [
    `Sri Nanjundeshwara Bakery - Hosur Branch`,
    `Payment Reminder`,
    '',
    `Shop: ${ledger.shopName}`,
    `Pending Bill No: ${ledger.billNo}`,
    `Pending Amount: ${money(ledger.balanceAmount)}`,
    `Due Date: ${toDateLabel(ledger.dueDate)}`,
    '',
    `Kindly clear the pending payment at the earliest. Thank you.`,
  ].join('\n');
}

function printBill(bill: HosurBill, items: HosurBillItem[], duplicate = false) {
  const rows = items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(item.itemName)}</td>
      <td class="num">${num(item.quantity)} ${item.unit}</td>
      <td class="num">${money(item.unitPrice)}</td>
      <td class="num">${money(item.lineTotal)}</td>
    </tr>
  `).join('');

  const html = `<!doctype html><html><head><title>${bill.billNo}</title>
  <style>
    @page{size:80mm auto;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#111;max-width:310px;margin:auto}.center{text-align:center}.bold{font-weight:700}.muted{color:#555}.num{text-align:right;white-space:nowrap}hr{border:0;border-top:1px dashed #777;margin:7px 0}table{width:100%;border-collapse:collapse}td{padding:2px 1px;vertical-align:top}.stamp{border:2px solid #111;padding:4px;margin:6px 0;text-align:center;font-size:13px;font-weight:800}.total{font-size:14px;font-weight:800}.credit{border:1px solid #111;padding:5px;margin-top:6px}
  </style></head><body>
    <div class="center bold">SRI NANJUNDESHWARA BAKERY</div>
    <div class="center bold">HOSUR BRANCH</div>
    <div class="stamp">${duplicate ? 'DUPLICATE BILL' : 'ORIGINAL BILL'}</div>
    <table>
      <tr><td>Bill No</td><td class="num bold">${escapeHtml(bill.billNo)}</td></tr>
      <tr><td>Date</td><td class="num">${toDateTimeLabel(bill.confirmedAt ?? bill.createdAt)}</td></tr>
      <tr><td>Shop</td><td class="num bold">${escapeHtml(bill.shopName)}</td></tr>
    </table>
    <hr/>
    <table><thead><tr><td>#</td><td>Item</td><td class="num">Qty</td><td class="num">Rate</td><td class="num">Amt</td></tr></thead><tbody>${rows}</tbody></table>
    <hr/>
    <table>
      <tr><td class="total">Total</td><td class="num total">${money(bill.subtotal)}</td></tr>
      <tr><td>Paid</td><td class="num">${money(bill.paidAmount)}</td></tr>
      <tr><td>Credit</td><td class="num">${money(bill.creditAmount)}</td></tr>
      ${bill.dueDate ? `<tr><td>Due Date</td><td class="num bold">${toDateLabel(bill.dueDate)}</td></tr>` : ''}
    </table>
    ${bill.creditAmount > 0 ? `<div class="credit"><b>Credit Balance:</b> ${money(bill.creditAmount)}</div>` : ''}
    <hr/>
    <div class="center bold">Thank You!</div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
  const w = window.open('', '_blank', 'width=380,height=650');
  if (w) { w.document.write(html); w.document.close(); }
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fallbackBillNo() {
  const now = new Date();
  const prefix = `HSR${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase()}`;
}

async function nextBillNo() {
  const { data, error } = await supabase.rpc('get_next_hosur_bill_number');
  return error || !data ? fallbackBillNo() : String(data);
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'emerald' | 'amber' | 'red' | 'blue' | 'violet' | 'slate' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', tones[tone])}>{children}</span>;
}

function statusTone(status: string): 'emerald' | 'amber' | 'red' | 'blue' | 'violet' | 'slate' {
  if (['paid', 'settled', 'cleared', 'sent', 'received_confirmed', 'resolved', 'approved'].includes(status)) return 'emerald';
  if (['draft', 'queued', 'pending_packing', 'partial', 'partial_credit'].includes(status)) return 'amber';
  if (['failed', 'open', 'overdue', 'rejected'].includes(status)) return 'red';
  if (['billed', 'confirmed', 'credit_open'].includes(status)) return 'blue';
  return 'slate';
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-3xl border border-border bg-card p-4 shadow-sm', className)}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5"><span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>;
}

const inputClass = 'w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-emerald-400/30';
const buttonBase = 'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
const primaryButton = `${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700`;
const softButton = `${buttonBase} border border-border bg-card hover:bg-muted`;

function SectionTitle({ icon, title, subtitle, action }: { icon: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">{icon}</div>
        <div>
          <h2 className="font-display text-xl font-black text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function Metric({ label, value, icon, tone = 'emerald' }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: 'emerald' | 'amber' | 'red' | 'blue' | 'violet' | 'slate' }) {
  const toneMap = {
    emerald: 'from-emerald-50 to-white text-emerald-700',
    amber: 'from-amber-50 to-white text-amber-700',
    red: 'from-red-50 to-white text-red-700',
    blue: 'from-blue-50 to-white text-blue-700',
    violet: 'from-violet-50 to-white text-violet-700',
    slate: 'from-slate-50 to-white text-slate-700',
  };
  return (
    <Card className={cn('bg-gradient-to-br p-3', toneMap[tone])}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="mt-1 font-display text-2xl font-black tabular-nums text-foreground">{value}</p>
    </Card>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center">
      <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-card text-muted-foreground shadow-sm">{icon}</div>
      <p className="font-bold text-foreground">{title}</p>
      {subtitle && <p className="mt-1 max-w-md text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export default function HosurDashboard() {
  const { currentUser } = useAuthStore();
  const userName = currentUser?.displayName || currentUser?.username || 'Hosur User';
  const userRole = currentUser?.role || 'branch_hosur';
  const isAdmin = ['admin', 'owner', 'branch_hosur'].includes(userRole);

  const {
    incoming,
    fetchBranchData,
    syncIncomingFromDispatches,
    confirmIncoming,
    fetchCreditSales,
  } = useBranchStore();

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTabState] = useState<HosurTab>(() => parseHosurTab(searchParams.get('tab')));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(''), 4000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const [shops, setShops] = useState<HosurShop[]>([]);
  const [prices, setPrices] = useState<HosurShopPrice[]>([]);
  const [orders, setOrders] = useState<HosurOrder[]>([]);
  const [orderItems, setOrderItems] = useState<Record<string, HosurOrderItem[]>>({});
  const [bills, setBills] = useState<HosurBill[]>([]);
  const [billItems, setBillItems] = useState<Record<string, HosurBillItem[]>>({});
  const [credits, setCredits] = useState<HosurCreditLedger[]>([]);
  const [payments, setPayments] = useState<HosurCreditPayment[]>([]);
  const [whatsappLogs, setWhatsappLogs] = useState<HosurWhatsappLog[]>([]);
  const [reminders, setReminders] = useState<HosurReminder[]>([]);
  const [disputes, setDisputes] = useState<HosurDispute[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);

  const branchIncoming = incoming[BRANCH] || [];

  const isAdminRef = useRef(isAdmin);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [
        shopsRes,
        pricesRes,
        ordersRes,
        orderItemsRes,
        billsRes,
        billItemsRes,
        creditsRes,
        paymentsRes,
        logsRes,
        remindersRes,
        disputesRes,
        notificationsRes,
      ] = await Promise.all([
        supabase.from('hosur_shops').select('*').eq('is_active', true).order('shop_name', { ascending: true }),
        supabase.from('hosur_shop_price_lists').select('*').eq('is_active', true),
        supabase.from('hosur_orders').select('*').order('created_at', { ascending: false }).limit(250),
        supabase.from('hosur_order_items').select('*').order('created_at', { ascending: true }).limit(10000),
        supabase.from('hosur_bills').select('*').order('created_at', { ascending: false }).limit(250),
        supabase.from('hosur_bill_items').select('*').order('created_at', { ascending: true }).limit(10000),
        // FIX (MD Bug #21): now that branch_credit_sales has a credit_type column
        // (added by migration 20260613_0004_hosur_credit_type.sql), fetch all rows.
        // The HosurCreditTab already shows wholesale (shop-supply) and retail separately
        // by filtering on credit_type. The Owner Dashboard SalesOverviewTab similarly
        // uses credit_type to prevent double-counting wholesale revenue already in hosur_bills.
        supabase.from('branch_credit_sales').select('*').eq('branch', BRANCH).order('created_at', { ascending: false }).limit(500),
        supabase.from('branch_credit_payments').select('*, branch_credit_sales!inner(source_id, customer_ref)').eq('branch', BRANCH).order('created_at', { ascending: false }).limit(500),
        supabase.from('hosur_whatsapp_logs').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('hosur_payment_reminders').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('hosur_disputes').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('admin_notifications').select('*').in('recipient_role', [isAdminRef.current ? 'admin' : 'branch_hosur']).order('created_at', { ascending: false }).limit(100),
      ]);

      const firstError = [shopsRes, pricesRes, ordersRes, orderItemsRes, billsRes, billItemsRes, creditsRes, paymentsRes, logsRes, remindersRes, disputesRes]
        .find((res) => res.error)?.error;
      if (firstError) {
        setError(`Hosur tables are not ready yet: ${firstError.message}. Apply the included Supabase migration first.`);
      }

      setShops((shopsRes.data ?? []).map(mapShop));
      setPrices((pricesRes.data ?? []).map(mapPrice));
      const mappedOrders = (ordersRes.data ?? []).map(mapOrder);
      setOrders(mappedOrders);

      const itemsByOrder: Record<string, HosurOrderItem[]> = {};
      (orderItemsRes.data ?? []).map(mapOrderItem).forEach((item) => {
        if (!itemsByOrder[item.orderId]) itemsByOrder[item.orderId] = [];
        itemsByOrder[item.orderId].push(item);
      });
      setOrderItems(itemsByOrder);

      setBills((billsRes.data ?? []).map(mapBill));
      const itemsByBill: Record<string, HosurBillItem[]> = {};
      (billItemsRes.data ?? []).map(mapBillItem).forEach((item) => {
        if (!itemsByBill[item.billId]) itemsByBill[item.billId] = [];
        itemsByBill[item.billId].push(item);
      });
      setBillItems(itemsByBill);

      setCredits((creditsRes.data ?? []).map(mapCredit));
      setPayments((paymentsRes.data ?? []).map(mapPayment));
      setWhatsappLogs((logsRes.data ?? []).map(mapWhatsapp));
      setReminders((remindersRes.data ?? []).map(mapReminder));
      setDisputes((disputesRes.data ?? []).map(mapDispute));
      setNotifications((notificationsRes.data ?? []).map(mapNotification));

      await Promise.all([
        fetchBranchData(BRANCH),
        fetchCreditSales?.(BRANCH),
        syncIncomingFromDispatches(BRANCH),
      ]);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load Hosur dashboard data.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchBranchData, fetchCreditSales, syncIncomingFromDispatches]);

  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    void refreshRef.current();
    const id = window.setInterval(() => void refreshRef.current(), 45_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const nextTab = parseHosurTab(searchParams.get('tab'));
    setTabState((current) => current === nextTab ? current : nextTab);
  }, [searchParams]);

  const setTab = (nextTab: HosurTab) => {
    setTabState(nextTab);
    setSearchParams(nextTab === 'newOrder' ? {} : { tab: nextTab });
  };

  const activeShops = shops.filter((shop) => shop.isActive);
  // FIX (MD Bug #21): separate wholesale and retail open credits using creditType column
  const openCredits = credits.filter((credit) => credit.status !== 'cleared' && credit.balanceAmount > 0);
  const overdueCredits = openCredits.filter((credit) => credit.dueDate && daysBetween(credit.dueDate) > 0);
  const draftBills = bills.filter((bill) => bill.status === 'draft');
  const openDisputes = disputes.filter((dispute) => dispute.status === 'open');
  const failedWhatsapp = whatsappLogs.filter((log) => log.status === 'failed');
  const unreadNotifications = notifications.filter((n) => !n.isRead).length;

  const priceFor = useCallback((shopId: string, item: SnbItem | HosurCatalogItem | string) => {
    const itemName = typeof item === 'string' ? item : item.name;
    const exact = prices.find((price) => price.shopId === shopId && normalize(price.itemName) === normalize(itemName) && price.isActive);
    if (exact) return exact.unitPrice;
    const master = typeof item === 'string' ? SNB_ITEMS.find((x) => normalize(x.name) === normalize(itemName)) : item;
    const basePrice = Number(master?.price ?? 0);
    const shop = shops.find((s) => s.id === shopId);
    const disc = shop?.discountPercent ?? 0;
    if (disc > 0 && basePrice > 0) return Math.round(basePrice * (1 - disc / 100) * 100) / 100;
    return basePrice;
  }, [prices, shops]);

  const tabs: { id: HosurTab; label: string; icon: React.ElementType; badge?: number; adminOnly?: boolean }[] = [
    { id: 'shops', label: 'Shop Master', icon: Store },
    { id: 'newOrder', label: 'New Order', icon: ShoppingCart },
    { id: 'receiving', label: 'Received From Packing', icon: PackageCheck, badge: branchIncoming.filter((i) => !i.confirmed).length + orders.filter((o) => ['pending_packing', 'dispatched'].includes(o.status)).length },
    { id: 'billing', label: 'Billing', icon: Receipt, badge: draftBills.length },
    { id: 'credit', label: 'Credit Ledger', icon: CreditCard, badge: openCredits.length },
    { id: 'collection', label: 'Payment Collection', icon: WalletCards },
    { id: 'whatsapp', label: 'WhatsApp Logs', icon: MessageCircle, badge: failedWhatsapp.length },
    { id: 'reminders', label: 'Reminder History', icon: Bell, badge: overdueCredits.length },
    { id: 'closure', label: 'Daily Closure', icon: CalendarDays },
    { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
    { id: 'notifications', label: 'Notifications', icon: ShieldCheck, badge: unreadNotifications },
  ];

  const filteredTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  const withBusy = async (fn: () => Promise<void>, successMessage?: string) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await fn();
      if (successMessage) setSuccess(successMessage);
      await refresh();
    } catch (err: any) {
      setError(err?.message ?? 'Action failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendWhatsapp = async ({
    shopId,
    shopName,
    phone,
    billId,
    billNo,
    messageType,
    body,
    retryLogId,
  }: {
    shopId?: string | null;
    shopName: string;
    phone: string;
    billId?: string | null;
    billNo?: string | null;
    messageType: HosurWhatsappLog['messageType'];
    body: string;
    retryLogId?: string;
  }) => {
    const normalizedPhone = cleanPhone(phone);
    let status: HosurWhatsappLog['status'] = 'sent';
    let errorMessage: string | null = null;
    try {
      const { error: fnError } = await supabase.functions.invoke('send-hosur-whatsapp', {
        body: { phone: normalizedPhone, message: body, shopId, billId, billNo, messageType },
      });
      if (fnError) throw fnError;
    } catch (err: any) {
      status = 'failed';
      errorMessage = err?.message || 'WhatsApp Edge Function not configured or sending failed.';
    }

    const payload = {
      shop_id: shopId ?? null,
      shop_name: shopName,
      phone: normalizedPhone,
      bill_id: billId ?? null,
      bill_no: billNo ?? null,
      message_type: messageType,
      message_body: body,
      status,
      error_message: errorMessage,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    };

    let logId = retryLogId;
    if (retryLogId) {
      await supabase.from('hosur_whatsapp_logs').update(payload).eq('id', retryLogId);
    } else {
      const { data, error: logError } = await supabase.from('hosur_whatsapp_logs').insert(payload).select('id').single();
      if (logError) throw logError;
      logId = data?.id;
    }

    if (billId && messageType === 'bill') {
      await supabase.from('hosur_bills').update({ whatsapp_status: status }).eq('id', billId);
    }

    return { status, logId, errorMessage };
  };

  const createDraftBill = async (order: HosurOrder, items: HosurOrderItem[]) => {
    const existing = bills.find((bill) => bill.orderId === order.id && bill.status !== 'cancelled');
    if (existing) return existing.id;
    const { data: serverExisting, error: lookupError } = await supabase.from('hosur_bills').select('id').eq('order_id', order.id).neq('status', 'cancelled').maybeSingle();
    if (lookupError) throw lookupError;
    if (serverExisting?.id) return serverExisting.id;
    const billNo = await nextBillNo();
    const subtotal = Math.round(items.reduce((sum, item) => sum + (item.receivedQuantity ?? item.quantity) * item.unitPrice, 0) * 100) / 100;
    const { data: billData, error: billError } = await supabase.from('hosur_bills').insert({
      bill_no: billNo,
      order_id: order.id,
      shop_id: order.shopId,
      shop_name: order.shopName,
      shop_whatsapp: order.shopWhatsapp,
      subtotal,
      paid_amount: 0,
      credit_amount: 0,
      status: 'draft',
      whatsapp_status: 'pending',
    }).select('*').single();
    if (billError) {
      if (billError.code === '23505') {
        const { data: existingBill } = await supabase.from('hosur_bills').select('id').eq('order_id', order.id).neq('status', 'cancelled').maybeSingle();
        if (existingBill?.id) return existingBill.id;
      }
      throw billError;
    }

    const rows = items.map((item) => ({
      bill_id: billData.id,
      item_name: item.itemName,
      unit: item.unit,
      // FIX (MD Bug #20): use receivedQuantity if it has been explicitly set (even if 0 —
      // a genuinely received-zero quantity means nothing was received and should bill 0, not
      // silently fall back to the requested quantity). The || operator was wrong here because
      // it treats 0 as falsy and substitutes item.quantity, overstating the billed amount.
      // Only fall back to item.quantity if receivedQuantity was never recorded (null/undefined).
      quantity: item.receivedQuantity != null ? item.receivedQuantity : item.quantity,
      unit_price: item.unitPrice,
      line_total: Math.round((item.receivedQuantity != null ? item.receivedQuantity : item.quantity) * item.unitPrice * 100) / 100,
    }));
    const { error: itemsError } = await supabase.from('hosur_bill_items').insert(rows);
    if (itemsError) {
      await supabase.from('hosur_bills').delete().eq('id', billData.id);
      throw itemsError;
    }
    const { error: orderUpdateError } = await supabase.from('hosur_orders').update({ status: 'billing_draft', bill_id: billData.id }).eq('id', order.id);
    if (orderUpdateError) {
      await supabase.from('hosur_bill_items').delete().eq('bill_id', billData.id);
      await supabase.from('hosur_bills').delete().eq('id', billData.id);
      throw orderUpdateError;
    }
    return billData.id;
  };

  const confirmBill = async (bill: HosurBill, paymentType: PaymentType, draft: PaymentDraft) => {
    const total = bill.subtotal;
    let paid = 0;
    let credit = 0;
    if (paymentType === 'full') {
      paid = total;
      credit = 0;
    } else if (paymentType === 'credit') {
      paid = 0;
      credit = total;
    } else {
      paid = Math.max(0, Math.min(total, Number(draft.paidAmount || 0)));
      credit = Math.max(0, total - paid);
    }
    if ((paymentType === 'credit' || paymentType === 'partial') && !draft.dueDate) {
      throw new Error('Due date is mandatory for Credit and Partial Payment bills.');
    }
    if (paymentType === 'partial' && paid <= 0) throw new Error('Enter paid amount for partial payment.');
    if (paymentType === 'partial' && paid >= total) throw new Error('Partial payment paid amount must be less than bill total.');

    const status: BillStatus = credit <= 0 ? 'paid' : paymentType === 'credit' ? 'credit_open' : 'partial_credit';
    const now = new Date().toISOString();

    const { error: billError } = await supabase.from('hosur_bills').update({
      paid_amount: paid,
      credit_amount: credit,
      payment_type: paymentType,
      payment_mode: draft.paymentMode,
      due_date: credit > 0 ? draft.dueDate : null,
      status,
      confirmed_by: userName,
      confirmed_at: now,
    }).eq('id', bill.id);
    if (billError) throw billError;

    if (bill.orderId) await supabase.from('hosur_orders').update({ status: 'billed' }).eq('id', bill.orderId);

    const items = billItems[bill.id] ?? [];
    if (credit > 0) {
      const { data: creditSale, error: ledgerError } = await supabase.from('branch_credit_sales').insert({
        branch: BRANCH,
        source: 'hosur',
        source_id: bill.id,
        customer_ref: bill.shopId,
        customer_name: bill.shopName,
        customer_phone: bill.shopWhatsapp,
        items: items.map((item) => ({
          itemName: item.itemName,
          quantity: item.quantity,
          sellUnit: item.unit,
          price: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        subtotal: total,
        amount_paid: paid,
        credit_amount: credit,
        sold_by: userName,
        bill_no: bill.billNo,
        due_date: draft.dueDate,
        status: paid > 0 ? 'partial' : 'pending',
        notes: 'Hosur credit bill',
      }).select('id').single();
      if (ledgerError) throw ledgerError;
      if (paid > 0 && creditSale?.id) {
        const { error: paymentError } = await supabase.from('branch_credit_payments').insert({
          credit_sale_id: creditSale.id,
          branch: BRANCH,
          bill_no: bill.billNo,
          amount: paid,
          payment_mode: draft.paymentMode,
          remarks: 'Hosur partial payment at billing',
          collected_by: userName,
          collected_role: userRole,
          created_at: now,
        });
        if (paymentError) throw paymentError;
      }
      await notifyAdmin('Hosur credit bill created', `${bill.shopName} has ${money(credit)} credit on bill ${bill.billNo}. Due ${toDateLabel(draft.dueDate)}.`, bill.id, bill.billNo, { billId: bill.id, amount: credit });
    }

    // FIX (MD Bug #19): Write branch_sales rows for the PAID portion of this bill so that
    // Hosur wholesale revenue appears in Owner Dashboard SalesOverviewTab, BranchOverviewTab,
    // and Admin dashboards (all of which aggregate branch_sales for revenue KPIs).
    // Previously only credit bills wrote to branch_credit_sales — full-payment and the paid
    // portion of partial bills wrote NOTHING, making the entire wholesale revenue stream invisible.
    // Each item gets a branch_sales row proportionally tagged with the payment method.
    if (paid > 0 && items.length > 0) {
      const salesRows = items.map(item => ({
        branch: BRANCH,
        item_name: item.itemName,
        quantity_sold: item.quantity,
        sold_at: now,
        sold_by: userName,
        payment_method: draft.paymentMode,
        unit_price: item.unitPrice,
        bill_no: bill.billNo,
        source: 'hosur_wholesale',  // distinguishes from retail counter sales
      }));
      // Best-effort — don't block bill confirmation on a sales-mirror failure
      supabase.from('branch_sales').insert(salesRows).then(({ error }) => {
        if (error) console.warn('[confirmBill] branch_sales mirror failed:', error.message);
      });
    }

    const finalBill = { ...bill, paidAmount: paid, creditAmount: credit, paymentType, paymentMode: draft.paymentMode, dueDate: credit > 0 ? draft.dueDate : null, status, confirmedAt: now, confirmedBy: userName } as HosurBill;
    const body = buildBillMessage(finalBill, items);
    const whatsapp = await sendWhatsapp({ shopId: bill.shopId, shopName: bill.shopName, phone: bill.shopWhatsapp, billId: bill.id, billNo: bill.billNo, messageType: 'bill', body });
    if (whatsapp.status === 'failed') {
      await notifyAdmin('Hosur WhatsApp bill failed', `${bill.billNo} for ${bill.shopName} could not be sent. Retry from WhatsApp Logs.`, bill.id, bill.billNo, { error: whatsapp.errorMessage });
    }
    printBill(finalBill, items, false);
  };

  const collectCredit = async (ledger: HosurCreditLedger, draft: PaymentDraft) => {
    const amount = Math.max(0, Number(draft.paidAmount || 0));
    if (amount <= 0) throw new Error('Enter amount collected.');
    if (amount > ledger.balanceAmount) throw new Error('Collected amount cannot be greater than pending balance.');

    const newPaid = ledger.paidAmount + amount;
    const newBalance = Math.max(0, ledger.balanceAmount - amount);
    const cleared = newBalance <= 0.01;
    const now = new Date().toISOString();

    const { error: paymentError } = await supabase.from('branch_credit_payments').insert({
      credit_sale_id: ledger.id,
      branch: BRANCH,
      bill_no: ledger.billNo,
      amount,
      payment_mode: draft.paymentMode,
      reference: null,
      remarks: draft.remarks || null,
      collected_by: userName,
      collected_role: userRole,
      created_at: now,
    });
    if (paymentError) throw paymentError;

    const { error: ledgerError } = await supabase.from('branch_credit_sales').update({
      amount_paid: newPaid,
      credit_amount: newBalance,
      status: cleared ? 'settled' : 'partial',
      settled_at: cleared ? now : null,
    }).eq('id', ledger.id);
    if (ledgerError) throw ledgerError;

    const { error: billError } = await supabase.from('hosur_bills').update({
      paid_amount: newPaid,
      credit_amount: newBalance,
      status: cleared ? 'settled' : 'partial_credit',
    }).eq('id', ledger.billId);
    if (billError) throw billError;

    const notificationBody = `${ledger.shopName} credit payment ${money(amount)} collected by ${userName}. Balance: ${money(newBalance)}.`;
    if (isAdmin) await notifyBranch('Hosur credit cleared by Admin', notificationBody, ledger.billId, ledger.billNo, { ledgerId: ledger.id, amount });
    else await notifyAdmin('Hosur credit payment collected', notificationBody, ledger.billId, ledger.billNo, { ledgerId: ledger.id, amount });
  };

  const runDueReminders = async () => {
    const due = openCredits.filter((ledger) => {
      if (!ledger.dueDate || daysBetween(ledger.dueDate) <= 0) return false;
      const history = reminders.filter((reminder) => reminder.ledgerId === ledger.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (history.length === 0) return true;
      return daysBetween(history[0].createdAt.slice(0, 10)) >= 10;
    });
    if (due.length === 0) throw new Error('No due reminders are eligible today. Reminders repeat every 10 days after due date.');

    for (const ledger of due) {
      const shop = shops.find((s) => s.id === ledger.shopId);
      const reminderNo = reminders.filter((r) => r.ledgerId === ledger.id).length + 1;
      const body = buildReminderMessage(ledger);
      const whatsapp = await sendWhatsapp({ shopId: ledger.shopId, shopName: ledger.shopName, phone: shop?.whatsappNumber || '', billId: ledger.billId, billNo: ledger.billNo, messageType: 'reminder', body });
      const { error: reminderError } = await supabase.from('hosur_payment_reminders').insert({
        credit_sale_id: ledger.id,
        ledger_id: null,
        bill_id: ledger.billId,
        shop_id: ledger.shopId,
        shop_name: ledger.shopName,
        pending_amount: ledger.balanceAmount,
        due_date: ledger.dueDate,
        reminder_no: reminderNo,
        status: whatsapp.status,
        whatsapp_log_id: whatsapp.logId ?? null,
        sent_at: whatsapp.status === 'sent' ? new Date().toISOString() : null,
      });
      if (reminderError) throw reminderError;
    }
  };

  const stats = {
    todayBills: bills.filter((bill) => bill.confirmedAt?.slice(0, 10) === TODAY_ISO()).length,
    todayCollection: bills.filter((bill) => bill.confirmedAt?.slice(0, 10) === TODAY_ISO()).reduce((sum, bill) => sum + bill.paidAmount, 0)
      + payments
        .filter((p) => p.createdAt.slice(0, 10) === TODAY_ISO() && p.remarks !== 'Hosur partial payment at billing')
        .reduce((sum, p) => sum + p.amountCollected, 0),
    pendingCredit: openCredits.reduce((sum, credit) => sum + credit.balanceAmount, 0),
    overdue: overdueCredits.reduce((sum, credit) => sum + credit.balanceAmount, 0),
  };

  return (
    <div className="min-h-[calc(100dvh-88px)] bg-slate-50/50">
      <div className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="flex items-center justify-end gap-3 px-4 py-3 md:px-5 xl:px-6">
          <button className={softButton} disabled={loading || busy} onClick={() => void refresh()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 pb-3 md:grid-cols-4 md:px-5 xl:px-6">
          <Metric label="Today Bills" value={stats.todayBills} icon={<Receipt className="size-4" />} tone="emerald" />
          <Metric label="Today Collection" value={money(stats.todayCollection)} icon={<IndianRupee className="size-4" />} tone="blue" />
          <Metric label="Pending Credit" value={money(stats.pendingCredit)} icon={<CreditCard className="size-4" />} tone="amber" />
          <Metric label="Overdue" value={money(stats.overdue)} icon={<AlertTriangle className="size-4" />} tone="red" />
        </div>
      </div>

      <div className="min-h-[calc(100dvh-230px)]">
        <main className="p-3 sm:p-4 md:p-5 xl:p-6">
          <div className="mb-4 rounded-3xl bg-slate-950 p-3 text-white">
            <Sidebar tabs={filteredTabs} active={tab} setActive={setTab} />
          </div>

          {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"><AlertCircle className="mr-2 inline size-4" />{error}</div>}
          {success && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"><CheckCircle2 className="mr-2 inline size-4" />{success}<button type="button" className="float-right" onClick={() => setSuccess('')} aria-label="Dismiss success message"><X className="size-4" /></button></div>}
          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="size-8 animate-spin text-emerald-600" /></div>
          ) : (
            <div className="space-y-4">
              {tab === 'shops' && <ShopMasterTab shops={shops} prices={prices} busy={busy} withBusy={withBusy} priceFor={priceFor} />}
              {tab === 'newOrder' && <NewOrderTab shops={activeShops} prices={prices} busy={busy} withBusy={withBusy} priceFor={priceFor} userName={userName} />}
              {tab === 'receiving' && <ReceivingTab orders={orders} orderItems={orderItems} branchIncoming={branchIncoming} busy={busy} withBusy={withBusy} confirmIncoming={confirmIncoming} createDraftBill={createDraftBill} userName={userName} />}
              {tab === 'billing' && <BillingTab bills={bills} billItems={billItems} busy={busy} withBusy={withBusy} confirmBill={confirmBill} />}
              {tab === 'credit' && <CreditLedgerTab credits={credits} payments={payments} shops={shops} />}
              {tab === 'collection' && <PaymentCollectionTab credits={openCredits} busy={busy} withBusy={withBusy} collectCredit={collectCredit} />}
              {tab === 'whatsapp' && <WhatsappLogsTab logs={whatsappLogs} busy={busy} withBusy={withBusy} sendWhatsapp={sendWhatsapp} />}
              {tab === 'reminders' && <ReminderHistoryTab reminders={reminders} credits={openCredits} busy={busy} withBusy={withBusy} runDueReminders={runDueReminders} />}
              {tab === 'closure' && <DailyClosureTab orders={orders} bills={bills} credits={credits} payments={payments} disputes={disputes} logs={whatsappLogs} />}
              {tab === 'reports' && <ReportsTab shops={shops} bills={bills} billItems={billItems} credits={credits} logs={whatsappLogs} reminders={reminders} disputes={disputes} />}
              {tab === 'notifications' && <NotificationsTab notifications={notifications} busy={busy} withBusy={withBusy} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Sidebar({ tabs, active, setActive }: { tabs: { id: HosurTab; label: string; icon: React.ElementType; badge?: number }[]; active: HosurTab; setActive: (id: HosurTab) => void }) {
  return (
    <nav className="space-y-1">
      {tabs.map((item) => (
        <button key={item.id} onClick={() => setActive(item.id)}
          className={cn('group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-black transition', active === item.id ? 'bg-emerald-600 text-white shadow-md' : 'bg-white/5 text-white/70 ring-1 ring-white/10 hover:bg-white/10 hover:text-white')}>
          <item.icon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {(item.badge ?? 0) > 0 && <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active === item.id ? 'bg-white text-emerald-700' : 'bg-red-100 text-red-700')}>{item.badge}</span>}
          <ChevronRight className={cn('size-3 opacity-0 transition group-hover:opacity-100', active === item.id && 'opacity-100')} />
        </button>
      ))}
    </nav>
  );
}

function ShopMasterTab({ shops, prices, busy, withBusy, priceFor }: {
  shops: HosurShop[];
  prices: HosurShopPrice[];
  busy: boolean;
  withBusy: (fn: () => Promise<void>, success?: string) => Promise<void>;
  priceFor: (shopId: string, item: SnbItem | HosurCatalogItem | string) => number;
}) {
  const [form, setForm] = useState({ shopName: '', whatsappNumber: '', address: '', discountPercent: '' });
  const [selectedShopId, setSelectedShopId] = useState('');
  const [priceSearch, setPriceSearch] = useState('');
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [customItem, setCustomItem] = useState({ itemName: '', unit: 'pcs' as 'pcs' | 'kg', unitPrice: '' });
  const selectedShop = shops.find((s) => s.id === selectedShopId) ?? shops[0];

  useEffect(() => { if (!selectedShopId && shops[0]) setSelectedShopId(shops[0].id); }, [shops, selectedShopId]);

  const catalogItems = buildHosurCatalogItems(prices, selectedShop?.id);
  const filteredItems = catalogItems.filter((item) => normalize(item.name).includes(normalize(priceSearch))).slice(0, 120);

  const saveShop = async () => {
    if (!form.shopName.trim()) throw new Error('Shop name is required.');
    if (!cleanPhone(form.whatsappNumber)) throw new Error('WhatsApp number is required.');
    const { error } = await supabase.from('hosur_shops').insert({
      shop_name: form.shopName.trim(),
      whatsapp_number: cleanPhone(form.whatsappNumber),
      address: form.address.trim(),
      discount_percent: Number(form.discountPercent) || 0,
      is_active: true,
    });
    if (error) throw error;
    setForm({ shopName: '', whatsappNumber: '', address: '', discountPercent: '' });
  };

  const importVrsnbPriceList = async () => {
    const shopIdByPhone = new Map(shops.filter((shop) => cleanPhone(shop.whatsappNumber)).map((shop) => [cleanPhone(shop.whatsappNumber), shop.id]));
    const shopIdByName = new Map(shops.map((shop) => [normalize(shop.shopName), shop.id]));
    const insertedShops: Record<string, string> = {};

    for (const sourceShop of HOSUR_VRSNB_PRICE_LIST) {
      const key = normalize(`${sourceShop.shopName} ${sourceShop.whatsappNumber}`);
      let shopId = shopIdByPhone.get(cleanPhone(sourceShop.whatsappNumber)) ?? shopIdByName.get(normalize(sourceShop.shopName));
      if (!shopId) {
        const { data, error } = await supabase.from('hosur_shops').insert({
          shop_name: sourceShop.shopName,
          whatsapp_number: sourceShop.whatsappNumber,
          address: '',
          is_active: true,
        }).select('id').single();
        if (error) throw error;
        shopId = data.id;
        shopIdByPhone.set(cleanPhone(sourceShop.whatsappNumber), shopId);
        shopIdByName.set(normalize(sourceShop.shopName), shopId);
      }
      insertedShops[key] = shopId;
    }

    const rows = HOSUR_VRSNB_PRICE_LIST.flatMap((sourceShop) => {
      const shopId = insertedShops[normalize(`${sourceShop.shopName} ${sourceShop.whatsappNumber}`)];
      return sourceShop.items.map((item) => ({
        shop_id: shopId,
        item_name: item.itemName,
        item_unit: inferHosurItemUnit(item.itemName, item.unitPrice) === 'Kgs' ? 'kg' : 'pcs',
        unit_price: item.unitPrice,
        is_active: true,
        updated_at: new Date().toISOString(),
      }));
    });

    if (rows.length > 0) {
      const { error } = await supabase.from('hosur_shop_price_lists').upsert(rows, { onConflict: 'shop_id,item_name' });
      if (error) throw error;
    }
  };

  const savePrice = async (item: HosurCatalogItem) => {
    if (!selectedShop) throw new Error('Select a shop first.');
    const edited = Number(priceEdits[item.name] ?? priceFor(selectedShop.id, item));
    if (!edited || edited <= 0) throw new Error('Enter a valid item price.');
    const { error } = await supabase.from('hosur_shop_price_lists').upsert({
      shop_id: selectedShop.id,
      item_name: item.name,
      item_unit: item.uom === 'Kgs' ? 'kg' : 'pcs',
      unit_price: edited,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'shop_id,item_name' });
    if (error) throw error;
    setPriceEdits((prev) => ({ ...prev, [item.name]: String(edited) }));
  };

  const addCustomItem = async () => {
    if (!selectedShop) throw new Error('Select a shop first.');
    const name = customItem.itemName.trim();
    const price = Number(customItem.unitPrice);
    if (!name) throw new Error('Item name is required.');
    if (!price || price <= 0) throw new Error('Enter a valid price.');
    const { error } = await supabase.from('hosur_shop_price_lists').upsert({
      shop_id: selectedShop.id,
      item_name: name,
      item_unit: customItem.unit,
      unit_price: price,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'shop_id,item_name' });
    if (error) throw error;
    setCustomItem({ itemName: '', unit: 'pcs', unitPrice: '' });
  };

  const deletePrice = async (item: HosurCatalogItem) => {
    if (!selectedShop) throw new Error('Select a shop first.');
    const { error } = await supabase.from('hosur_shop_price_lists').upsert({
      shop_id: selectedShop.id,
      item_name: item.name,
      item_unit: item.uom === 'Kgs' ? 'kg' : 'pcs',
      unit_price: Number(priceEdits[item.name] ?? priceFor(selectedShop.id, item)),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'shop_id,item_name' });
    if (error) throw error;
    setPriceEdits((prev) => {
      const next = { ...prev };
      delete next[item.name];
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <SectionTitle icon={<Store className="size-5" />} title="Shop Master / Customer Master" subtitle="Maintain shop WhatsApp number, address, and shop-wise price list." />
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card className="space-y-3">
            <h3 className="font-black">Add Shop</h3>
            <Field label="Shop name"><input className={inputClass} value={form.shopName} onChange={(e) => setForm({ ...form, shopName: e.target.value })} placeholder="Example: Sri Lakshmi Bakery" /></Field>
            <Field label="WhatsApp number"><input className={inputClass} value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} placeholder="10 digit mobile number" /></Field>
            <Field label="Address"><textarea className={cn(inputClass, 'min-h-24 resize-none')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Shop address" /></Field>
            <Field label="Default Discount % (optional)">
              <input
                className={inputClass}
                type="number"
                min="0"
                max="100"
                value={form.discountPercent}
                onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                placeholder="e.g. 10 for 10% off"
              />
            </Field>
            <button className={primaryButton} disabled={busy} onClick={() => withBusy(saveShop, 'Shop saved.')}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Save Shop</button>
          </Card>
          <Card className="space-y-2">
            <h3 className="font-black">Shops</h3>
            {shops.length === 0 ? <EmptyState icon={<Store className="size-6" />} title="No shops added" subtitle="Add shop details here. You can update the full shop list later." /> : shops.map((shop) => (
              <button key={shop.id} onClick={() => setSelectedShopId(shop.id)} className={cn('w-full rounded-2xl border p-3 text-left transition', selectedShop?.id === shop.id ? 'border-emerald-300 bg-emerald-50' : 'border-border hover:bg-muted/50')}>
                <div className="flex items-start justify-between gap-2"><p className="font-black">{shop.shopName}</p><Badge tone={shop.isActive ? 'emerald' : 'slate'}>{shop.isActive ? 'active' : 'inactive'}</Badge></div>
                <p className="mt-0.5 text-xs text-muted-foreground">{shop.whatsappNumber}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{shop.address || 'No address'}</p>
                {shop.discountPercent > 0 && (
                  <p className="mt-1 text-xs font-semibold text-emerald-700">{shop.discountPercent}% discount applied to non-custom items</p>
                )}
              </button>
            ))}
          </Card>
        </div>
        <Card className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="font-black">Shop-wise Item Price List</h3><p className="text-sm text-muted-foreground">{selectedShop ? `Editing prices for ${selectedShop.shopName}` : 'Select a shop to edit prices.'}</p></div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input className={cn(inputClass, 'pl-9')} value={priceSearch} onChange={(e) => setPriceSearch(e.target.value)} placeholder="Search item" /></div>
            </div>
          </div>
          <div className="grid gap-2 rounded-2xl border bg-muted/20 p-3 md:grid-cols-[1fr_120px_140px_auto]">
            <input className={inputClass} value={customItem.itemName} onChange={(e) => setCustomItem((prev) => ({ ...prev, itemName: e.target.value }))} placeholder="Add custom item name" />
            <select className={inputClass} value={customItem.unit} onChange={(e) => setCustomItem((prev) => ({ ...prev, unit: e.target.value as 'pcs' | 'kg' }))}><option value="pcs">pcs</option><option value="kg">kg</option></select>
            <input className={inputClass} type="number" value={customItem.unitPrice} onChange={(e) => setCustomItem((prev) => ({ ...prev, unitPrice: e.target.value }))} placeholder="Price" />
            <button className={primaryButton} disabled={!selectedShop || busy} onClick={() => withBusy(addCustomItem, 'Item added to shop list.')}>Add Item</button>
          </div>
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Default</th><th className="px-3 py-2">Shop Price</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
              <tbody className="divide-y">
                {filteredItems.map((item) => {
                  const custom = selectedShop ? prices.find((p) => p.shopId === selectedShop.id && normalize(p.itemName) === normalize(item.name)) : null;
                  const current = selectedShop ? priceFor(selectedShop.id, item) : item.price;
                  return <tr key={`${item.source}-${item.name}`} className="bg-card"><td className="px-3 py-2 font-semibold">{item.name}<p className="text-[10px] text-muted-foreground">{item.category} · {item.source === 'shop' ? 'shop item' : 'master item'}</p></td><td className="px-3 py-2">{item.uom === 'Kgs' ? 'kg' : 'pcs'}</td><td className="px-3 py-2">{item.source === 'master' ? money(item.price) : '—'}</td><td className="px-3 py-2"><input className="w-28 rounded-xl border px-2 py-1.5 text-sm" type="number" value={priceEdits[item.name] ?? String(current)} onChange={(e) => setPriceEdits((prev) => ({ ...prev, [item.name]: e.target.value }))} /></td><td className="px-3 py-2 text-right"><div className="flex justify-end gap-2"><button className={softButton} disabled={!selectedShop || busy} onClick={() => withBusy(() => savePrice(item), 'Price updated.')}>{custom?.isActive ? 'Update' : 'Save'}</button><button className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100" disabled={!selectedShop || busy} onClick={() => withBusy(() => deletePrice(item), 'Item removed from this shop list.')}>Delete</button></div></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function NewOrderTab({ shops, prices, busy, withBusy, priceFor, userName }: {
  shops: HosurShop[];
  prices: HosurShopPrice[];
  busy: boolean;
  withBusy: (fn: () => Promise<void>, success?: string) => Promise<void>;
  priceFor: (shopId: string, item: SnbItem | HosurCatalogItem | string) => number;
  userName: string;
}) {
  const [shopId, setShopId] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [cart, setCart] = useState<Record<string, DraftOrderItem>>({});
  const [notes, setNotes] = useState('');
  const [orderSubTab, setOrderSubTab] = useState<'catalog' | 'custom'>('catalog');
  const [customLine, setCustomLine] = useState({ itemName: '', unit: 'pcs' as 'pcs' | 'kg', unitPrice: '', qty: '' });
  const shop = shops.find((s) => s.id === shopId) ?? shops[0];

  useEffect(() => { if (!shopId && shops[0]) setShopId(shops[0].id); }, [shops, shopId]);

  const shopOnlyPrices = prices.filter((p) => p.shopId === shop?.id && p.isActive);
  const hasShopPriceList = shopOnlyPrices.length > 0;
  const catalogItems: HosurCatalogItem[] = hasShopPriceList
    ? shopOnlyPrices.map((p, index) => {
        const master = masterItemFor(p.itemName);
        return {
          barcode: master?.barcode ?? 90_000 + index,
          name: p.itemName,
          price: p.unitPrice,
          uom: p.itemUnit === 'kg' ? 'Kgs' : 'Nos',
          category: master?.category ?? inferHosurItemCategory(p.itemName),
          source: (master ? 'master' : 'shop') as 'master' | 'shop',
        };
      })
    : SNB_ITEMS.map((item) => ({ ...item, source: 'master' as const }));
  const filteredItems = catalogItems.filter((item) => {
    if (search.trim()) return normalize(item.name).includes(normalize(search));
    return category === 'All' || item.category === category;
  });
  const cartItems = Object.values(cart);
  const subtotal = cartItems.reduce((sum, item) => sum + item.lineTotal, 0);

  const setQty = (item: HosurCatalogItem, qty: number) => {
    if (!shop) return;
    const unit: 'pcs' | 'kg' = item.uom === 'Kgs' ? 'kg' : 'pcs';
    const safeQty = Math.max(0, Math.round(qty * 1000) / 1000);
    const unitPrice = priceFor(shop.id, item);
    setCart((prev) => {
      const next = { ...prev };
      if (safeQty <= 0) delete next[item.name];
      else next[item.name] = { itemName: item.name, unit, quantity: safeQty, unitPrice, lineTotal: Math.round(safeQty * unitPrice * 100) / 100, category: item.category };
      return next;
    });
  };

  const saveOrder = async () => {
    if (!shop) throw new Error('Select a shop.');
    if (cartItems.length === 0) throw new Error('Add at least one item.');
    const orderNumber = `HSR-ORD-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const { data: order, error: orderError } = await supabase.from('hosur_orders').insert({
      order_number: orderNumber,
      shop_id: shop.id,
      shop_name: shop.shopName,
      shop_whatsapp: shop.whatsappNumber,
      shop_address: shop.address,
      status: 'pending_packing',
      subtotal,
      created_by: userName,
      notes: notes.trim() || null,
    }).select('id').single();
    if (orderError) throw orderError;
    const rows = cartItems.map((item) => ({
      order_id: order.id,
      item_name: item.itemName,
      unit: item.unit,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      line_total: item.lineTotal,
      dispatched_quantity: 0,
      received_quantity: 0,
    }));
    const { error: itemsError } = await supabase.from('hosur_order_items').insert(rows);
    if (itemsError) {
      // FIX (MD Bug #22): if hosur_order_items insert fails after the hosur_orders row was
      // created, clean up the orphaned order row so it doesn't appear as a ghost pending order.
      await supabase.from('hosur_orders').delete().eq('id', order.id);
      throw itemsError;
    }
    await notifyAdmin('New Hosur shop order', `${shop.shopName} order ${orderNumber} created by ${userName}. Total ${money(subtotal)}.`, order.id, orderNumber, { shopId: shop.id, subtotal });
    setCart({});
    setNotes('');
  };

  return (
    <div className="space-y-4">
      <SectionTitle icon={<ShoppingCart className="size-5" />} title="New Order" subtitle="Select shop first. Item prices automatically come from that shop’s assigned price list." />
      {shops.length === 0 ? <EmptyState icon={<Store className="size-6" />} title="Add shops before creating orders" subtitle="Go to Shop Master and add the shop name, WhatsApp number, address and item prices." /> : (
        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
              <Field label="Shop"><select className={inputClass} value={shop?.id ?? ''} onChange={(e) => setShopId(e.target.value)}>{shops.map((s) => <option key={s.id} value={s.id}>{s.shopName}</option>)}</select></Field>
              <Field label="Search item"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input className={cn(inputClass, 'pl-9')} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item name" /></div></Field>
            </div>
            {shop && <div className="rounded-2xl bg-emerald-50 p-3 text-sm"><b>{shop.shopName}</b><span className="mx-2 text-muted-foreground">•</span>{shop.whatsappNumber}<p className="mt-1 text-xs text-muted-foreground">{shop.address}</p></div>}
            <div className="flex gap-2">
              {(['catalog', 'custom'] as const).map((t) => (
                <button key={t} onClick={() => setOrderSubTab(t)}
                  className={cn('rounded-full border px-4 py-1.5 text-xs font-black transition',
                    orderSubTab === t ? 'border-emerald-600 bg-emerald-600 text-white' : 'bg-card'
                  )}>
                  {t === 'catalog' ? '📦 Shop Items' : '✏️ Custom Items'}
                </button>
              ))}
            </div>
            {orderSubTab === 'custom' ? (
              <div className="space-y-3 rounded-2xl border bg-card p-4">
                <h3 className="font-black text-sm">Add Custom Item to Order</h3>
                <div className="grid gap-2 md:grid-cols-[1fr_100px_110px_90px_auto]">
                  <input className={inputClass} value={customLine.itemName} onChange={(e) => setCustomLine((p) => ({ ...p, itemName: e.target.value }))} placeholder="Item name" />
                  <select className={inputClass} value={customLine.unit} onChange={(e) => setCustomLine((p) => ({ ...p, unit: e.target.value as 'pcs' | 'kg' }))}>
                    <option value="pcs">pcs</option>
                    <option value="kg">kg</option>
                  </select>
                  <input className={inputClass} type="number" value={customLine.unitPrice} onChange={(e) => setCustomLine((p) => ({ ...p, unitPrice: e.target.value }))} placeholder="Price" />
                  <input className={inputClass} type="number" value={customLine.qty} onChange={(e) => setCustomLine((p) => ({ ...p, qty: e.target.value }))} placeholder="Qty" />
                  <button className={primaryButton} onClick={() => {
                    const name = customLine.itemName.trim();
                    const price = Number(customLine.unitPrice);
                    const qty = Number(customLine.qty);
                    if (!name || !price || !qty) return;
                    const lineTotal = Math.round(qty * price * 100) / 100;
                    setCart((prev) => ({
                      ...prev,
                      [name]: { itemName: name, unit: customLine.unit, quantity: qty, unitPrice: price, lineTotal, category: 'Custom' },
                    }));
                    setCustomLine({ itemName: '', unit: 'pcs', unitPrice: '', qty: '' });
                  }}>Add</button>
                </div>
                <p className="text-xs text-muted-foreground">Custom items added here will appear in the Order Summary alongside shop items.</p>
              </div>
            ) : (
              <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['All', ...SNB_CATEGORIES].map((cat) => <button key={cat} onClick={() => { setCategory(cat); setSearch(''); }} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-black', category === cat && !search ? 'border-emerald-600 bg-emerald-600 text-white' : 'bg-card')}>{cat}</button>)}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filteredItems.slice(0, 120).map((item) => {
                const current = cart[item.name]?.quantity ?? 0;
                const step = item.uom === 'Kgs' ? 0.25 : 1;
                const basePrice = typeof item.price === 'number' ? item.price : 0;
                const shopPrice = shop ? priceFor(shop.id, item) : basePrice;
                const hasDiscount = shopPrice < basePrice && basePrice > 0;
                return <div key={item.barcode} className={cn('rounded-2xl border p-3', current > 0 ? 'border-emerald-300 bg-emerald-50' : 'bg-card')}>
                  <div className="min-h-12">
                    <p className="line-clamp-2 text-sm font-black">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.uom === 'Kgs' ? 'kg' : 'pcs'} ·{' '}
                      {hasDiscount ? (
                        <>
                          <span className="line-through text-muted-foreground/60">{money(basePrice)}</span>{' '}
                          <span className="font-bold text-emerald-700">{money(shopPrice)}</span>
                        </>
                      ) : (
                        money(shopPrice)
                      )}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2"><button className="size-9 rounded-xl border bg-white font-black" onClick={() => setQty(item, current - step)}>-</button><input className="h-9 min-w-0 flex-1 rounded-xl border text-center text-sm font-black" type="number" step={step} value={current || ''} onChange={(e) => setQty(item, Number(e.target.value))} placeholder="0" /><button className="size-9 rounded-xl bg-emerald-600 font-black text-white" onClick={() => setQty(item, current + step)}>+</button></div>
                </div>;
              })}
            </div>
              </>
            )}
          </Card>
          <Card className="h-fit space-y-4 2xl:sticky 2xl:top-36">
            <h3 className="font-black">Order Summary</h3>
            {cartItems.length === 0 ? <EmptyState icon={<ShoppingCart className="size-6" />} title="No items added" /> : <div className="max-h-[48dvh] space-y-2 overflow-auto pr-1">{cartItems.map((item) => <div key={item.itemName} className="rounded-2xl border bg-muted/20 p-3"><div className="flex justify-between gap-2"><p className="text-sm font-black">{item.itemName}</p><button className="text-red-600" onClick={() => setCart((prev) => { const next = { ...prev }; delete next[item.itemName]; return next; })}><X className="size-4" /></button></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{num(item.quantity)} {item.unit} × {money(item.unitPrice)}</span><b className="text-foreground">{money(item.lineTotal)}</b></div></div>)}</div>}
            <Field label="Order notes"><textarea className={cn(inputClass, 'min-h-20 resize-none')} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for packing/branch" /></Field>
            <div className="flex items-center justify-between rounded-2xl bg-emerald-700 px-4 py-3 text-white"><span className="font-black">Total</span><span className="font-display text-2xl font-black">{money(subtotal)}</span></div>
            <button className={primaryButton} disabled={busy || cartItems.length === 0} onClick={() => withBusy(saveOrder, 'Order created and sent to packing workflow.')}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Create Order</button>
          </Card>
        </div>
      )}
    </div>
  );
}

function ReceivingTab({ orders, orderItems, branchIncoming, busy, withBusy, confirmIncoming, createDraftBill, userName }: {
  orders: HosurOrder[];
  orderItems: Record<string, HosurOrderItem[]>;
  branchIncoming: { id: string; itemName: string; quantity: number; unit: 'pcs' | 'kg'; receivedAt: string; dispatchedBy: string; confirmed: boolean }[];
  busy: boolean;
  withBusy: (fn: () => Promise<void>, success?: string) => Promise<void>;
  confirmIncoming: (branch: typeof BRANCH, incomingId: string) => Promise<string | null>;
  createDraftBill: (order: HosurOrder, items: HosurOrderItem[]) => Promise<string>;
  userName: string;
}) {
  const pendingOrders = orders.filter((o) => ['pending_packing', 'dispatched'].includes(o.status));
  const [receivedQty, setReceivedQty] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [disputeRemarks, setDisputeRemarks] = useState<Record<string, string>>({});

  const confirmOrder = async (order: HosurOrder) => {
    const items = orderItems[order.id] ?? [];
    if (items.length === 0) throw new Error('Order items not found.');
    let hasMismatch = false;
    for (const item of items) {
      const qty = Number(receivedQty[item.id] ?? item.quantity);
      const expected = item.dispatchedQuantity > 0 ? item.dispatchedQuantity : item.quantity;
      await supabase.from('hosur_order_items').update({ dispatched_quantity: expected, received_quantity: qty }).eq('id', item.id);
      if (Math.abs(qty - expected) > 0.001) {
        hasMismatch = true;
        await supabase.from('hosur_disputes').insert({
          order_id: order.id,
          order_number: order.orderNumber,
          item_name: item.itemName,
          expected_quantity: expected,
          received_quantity: qty,
          unit: item.unit,
          raised_by: userName,
          status: 'open',
          admin_remarks: remarks[item.id] || null,
        });
      }
    }
    await supabase.from('hosur_orders').update({ status: 'received_confirmed', received_at: new Date().toISOString() }).eq('id', order.id);
    const freshItems = items.map((item) => { const receivedQuantity = Number(receivedQty[item.id] ?? item.quantity); return { ...item, receivedQuantity, dispatchedQuantity: item.dispatchedQuantity > 0 ? item.dispatchedQuantity : item.quantity, lineTotal: Math.round(receivedQuantity * item.unitPrice * 100) / 100 }; });
    await createDraftBill(order, freshItems);
    if (hasMismatch) {
      await notifyAdmin('Hosur receiving mismatch raised', `${order.shopName} order ${order.orderNumber} has received quantity mismatch.`, order.id, order.orderNumber, { orderId: order.id });
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle icon={<PackageCheck className="size-5" />} title="Received From Packing" subtitle="Confirm stock/order receipt. Raise dispute if received quantity is different from dispatched quantity." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <h3 className="font-black">Shop Orders Waiting For Branch Confirmation</h3>
          {pendingOrders.length === 0 ? <EmptyState icon={<PackageCheck className="size-6" />} title="No pending shop orders" subtitle="Orders created for shops will appear here after packing/dispatch." /> : pendingOrders.map((order) => {
            const items = orderItems[order.id] ?? [];
            return <div key={order.id} className="rounded-3xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{order.shopName}</p><p className="text-xs text-muted-foreground">{order.orderNumber} · {toDateTimeLabel(order.createdAt)}</p></div><Badge tone={statusTone(order.status)}>{order.status.replace(/_/g, ' ')}</Badge></div>
              <div className="mt-3 space-y-2">{items.map((item) => {
                const expected = item.dispatchedQuantity > 0 ? item.dispatchedQuantity : item.quantity;
                return <div key={item.id} className="rounded-2xl bg-muted/30 p-3">
                  <div className="grid gap-2 md:grid-cols-[1fr_120px_1fr]"><div><p className="text-sm font-black">{item.itemName}</p><p className="text-xs text-muted-foreground">Expected {num(expected)} {item.unit}</p></div><input className="rounded-xl border px-2 py-2 text-sm" type="number" step={item.unit === 'kg' ? 0.25 : 1} value={receivedQty[item.id] ?? String(expected)} onChange={(e) => setReceivedQty((p) => ({ ...p, [item.id]: e.target.value }))} /><input className="rounded-xl border px-2 py-2 text-sm" value={remarks[item.id] ?? ''} onChange={(e) => setRemarks((p) => ({ ...p, [item.id]: e.target.value }))} placeholder="Mismatch remarks" /></div>
                  <div className="mt-2 flex gap-2">
                    <input
                      className={cn(inputClass, 'flex-1 text-xs')}
                      value={disputeRemarks[item.id] ?? ''}
                      onChange={(e) => setDisputeRemarks((p) => ({ ...p, [item.id]: e.target.value }))}
                      placeholder="Raise dispute — describe the issue (optional)"
                    />
                    <button
                      className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-100 border border-amber-200"
                      disabled={busy || !disputeRemarks[item.id]?.trim()}
                      onClick={() => withBusy(async () => {
                        const remark = disputeRemarks[item.id]?.trim();
                        if (!remark) throw new Error('Enter a dispute reason.');
                        const received = Number(receivedQty[item.id] ?? expected);
                        const { error } = await supabase.from('hosur_disputes').insert({
                          order_id: order.id,
                          order_number: order.orderNumber,
                          item_name: item.itemName,
                          expected_quantity: expected,
                          received_quantity: received,
                          unit: item.unit,
                          raised_by: userName,
                          status: 'open',
                          admin_remarks: remark,
                        });
                        if (error) throw error;
                        await notifyAdmin(
                          'Hosur dispute raised',
                          `${order.shopName} · ${item.itemName} · ${remark}`,
                          order.id,
                          order.orderNumber,
                          { orderId: order.id }
                        );
                        setDisputeRemarks((p) => { const n = { ...p }; delete n[item.id]; return n; });
                      }, 'Dispute raised and sent to Admin.')}
                    >
                      <AlertTriangle className="size-3 inline mr-1" />Raise Dispute
                    </button>
                  </div>
                </div>;
              })}</div>
              <button className={primaryButton} disabled={busy || items.length === 0} onClick={() => withBusy(() => confirmOrder(order), 'Order received. Bill draft calculated using shop price list.')}>{busy ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />} Confirm Received & Create Bill</button>
            </div>;
          })}
        </Card>
        <Card className="space-y-3">
          <h3 className="font-black">Packing Dispatch Bridge</h3>
          <p className="text-sm text-muted-foreground">Existing packing dispatch rows from the bakery workflow are shown here. Confirming adds them to Hosur branch stock.</p>
          {branchIncoming.filter((i) => !i.confirmed).length === 0 ? <EmptyState icon={<PackageCheck className="size-6" />} title="No unconfirmed dispatch rows" /> : branchIncoming.filter((i) => !i.confirmed).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3"><div><p className="font-black">{item.itemName}</p><p className="text-xs text-muted-foreground">{num(item.quantity)} {item.unit} · {item.dispatchedBy} · {toDateTimeLabel(item.receivedAt)}</p></div><button className={softButton} disabled={busy} onClick={() => withBusy(async () => { const err = await confirmIncoming(BRANCH, item.id); if (err) throw new Error(err); }, 'Incoming stock confirmed.')}>Confirm Stock</button></div>)}
        </Card>
      </div>
    </div>
  );
}

function BillingTab({ bills, billItems, busy, withBusy, confirmBill }: {
  bills: HosurBill[];
  billItems: Record<string, HosurBillItem[]>;
  busy: boolean;
  withBusy: (fn: () => Promise<void>, success?: string) => Promise<void>;
  confirmBill: (bill: HosurBill, paymentType: PaymentType, draft: PaymentDraft) => Promise<void>;
}) {
  const draftBills = bills.filter((bill) => bill.status === 'draft');
  const recentBills = bills.filter((bill) => bill.status !== 'draft').slice(0, 25);
  const [paymentType, setPaymentType] = useState<Record<string, PaymentType>>({});
  const [draft, setDraft] = useState<Record<string, PaymentDraft>>({});
  const getDraft = (id: string) => draft[id] ?? EMPTY_PAYMENT;

  return (
    <div className="space-y-4">
      <SectionTitle icon={<Receipt className="size-5" />} title="Billing" subtitle="Review item-wise bill calculation, select payment type, due date, then confirm and send WhatsApp bill." />
      {draftBills.length === 0 ? <EmptyState icon={<Receipt className="size-6" />} title="No bill drafts" subtitle="Confirm received shop orders to generate bill drafts automatically." /> : draftBills.map((bill) => {
        const items = billItems[bill.id] ?? [];
        const pType = paymentType[bill.id] ?? 'full';
        const d = getDraft(bill.id);
        const paid = pType === 'full' ? bill.subtotal : pType === 'credit' ? 0 : Number(d.paidAmount || 0);
        const credit = Math.max(0, bill.subtotal - paid);
        return <Card key={bill.id} className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-display text-xl font-black">{bill.shopName}</p><p className="text-sm text-muted-foreground">Bill {bill.billNo} · {toDateTimeLabel(bill.createdAt)}</p></div><Badge tone="amber">Draft</Badge></div>
          <div className="overflow-x-auto rounded-2xl border"><table className="min-w-full text-sm"><thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Rate</th><th className="px-3 py-2 text-right">Total</th></tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.id}><td className="px-3 py-2 font-semibold">{item.itemName}</td><td className="px-3 py-2">{num(item.quantity)} {item.unit}</td><td className="px-3 py-2">{money(item.unitPrice)}</td><td className="px-3 py-2 text-right font-black">{money(item.lineTotal)}</td></tr>)}</tbody></table></div>
          <div className="grid gap-3 md:grid-cols-4">
            {(['full', 'credit', 'partial'] as PaymentType[]).map((type) => <button key={type} className={cn('rounded-2xl border p-3 text-left font-black', pType === type ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'bg-card')} onClick={() => setPaymentType((prev) => ({ ...prev, [bill.id]: type }))}>{type === 'full' ? 'Full Payment' : type === 'credit' ? 'Credit' : 'Partial Payment'}</button>)}
            <Field label="Payment mode"><select className={inputClass} value={d.paymentMode} onChange={(e) => setDraft((prev) => ({ ...prev, [bill.id]: { ...getDraft(bill.id), paymentMode: e.target.value as PaymentMode } }))}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option><option value="mixed">Mixed</option></select></Field>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {pType === 'partial' && <Field label="Paid amount"><input className={inputClass} type="number" value={d.paidAmount} onChange={(e) => setDraft((prev) => ({ ...prev, [bill.id]: { ...getDraft(bill.id), paidAmount: e.target.value } }))} placeholder="Enter paid amount" /></Field>}
            {(pType === 'credit' || pType === 'partial') && <Field label="Due date mandatory"><input className={inputClass} type="date" min={TODAY_ISO()} value={d.dueDate} onChange={(e) => setDraft((prev) => ({ ...prev, [bill.id]: { ...getDraft(bill.id), dueDate: e.target.value } }))} /></Field>}
            <div className="rounded-2xl bg-slate-900 p-3 text-white"><p className="text-xs font-black uppercase text-white/60">Bill Total</p><p className="font-display text-3xl font-black">{money(bill.subtotal)}</p><p className="mt-1 text-xs">Paid {money(paid)} · Credit {money(credit)}</p></div>
          </div>
          <div className="flex flex-wrap gap-2"><button className={primaryButton} disabled={busy} onClick={() => withBusy(() => confirmBill(bill, pType, d), 'Bill confirmed, printed, and WhatsApp send attempted.')}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Confirm Bill & Send WhatsApp</button></div>
        </Card>;
      })}
      <Card className="space-y-3"><h3 className="font-black">Recent Bills</h3>{recentBills.length === 0 ? <p className="text-sm text-muted-foreground">No confirmed bills yet.</p> : recentBills.map((bill) => <div key={bill.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3"><div><p className="font-black">{bill.billNo} · {bill.shopName}</p><p className="text-xs text-muted-foreground">Paid {money(bill.paidAmount)} · Credit {money(bill.creditAmount)} · {toDateTimeLabel(bill.confirmedAt)}</p></div><div className="flex items-center gap-2"><Badge tone={statusTone(bill.status)}>{bill.status.replace(/_/g, ' ')}</Badge><button className={softButton} onClick={() => printBill(bill, billItems[bill.id] ?? [], true)}><Printer className="size-4" /> Duplicate Bill</button></div></div>)}</Card>
    </div>
  );
}

function CreditLedgerTab({ credits, payments, shops }: { credits: HosurCreditLedger[]; payments: HosurCreditPayment[]; shops: HosurShop[] }) {
  const open = credits.filter((c) => c.status !== 'cleared' && c.balanceAmount > 0);
  const total = open.reduce((s, c) => s + c.balanceAmount, 0);
  return (
    <div className="space-y-4">
      <SectionTitle icon={<CreditCard className="size-5" />} title="Credit Ledger" subtitle="Track shop-wise credit, due dates, overdue amounts, and payment history." />
      <div className="grid gap-3 md:grid-cols-3"><Metric label="Open Credits" value={open.length} icon={<CreditCard className="size-4" />} tone="amber" /><Metric label="Pending Amount" value={money(total)} icon={<IndianRupee className="size-4" />} tone="red" /><Metric label="Payments Recorded" value={payments.length} icon={<WalletCards className="size-4" />} tone="emerald" /></div>
      <Card className="space-y-2">{credits.length === 0 ? <EmptyState icon={<CreditCard className="size-6" />} title="No credit records" /> : credits.map((credit) => <div key={credit.id} className="rounded-2xl border p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{credit.shopName}</p><p className="text-xs text-muted-foreground">Bill {credit.billNo} · Due {toDateLabel(credit.dueDate)} · WhatsApp {shops.find((s) => s.id === credit.shopId)?.whatsappNumber ?? '—'}</p></div><Badge tone={statusTone(credit.status)}>{credit.status}</Badge></div><div className="mt-3 grid gap-2 text-sm md:grid-cols-3"><div className="rounded-xl bg-muted p-2">Opening <b>{money(credit.openingAmount)}</b></div><div className="rounded-xl bg-muted p-2">Paid <b>{money(credit.paidAmount)}</b></div><div className="rounded-xl bg-red-50 p-2 text-red-700">Balance <b>{money(credit.balanceAmount)}</b></div></div></div>)}</Card>
    </div>
  );
}

function PaymentCollectionTab({ credits, busy, withBusy, collectCredit }: {
  credits: HosurCreditLedger[];
  busy: boolean;
  withBusy: (fn: () => Promise<void>, success?: string) => Promise<void>;
  collectCredit: (ledger: HosurCreditLedger, draft: PaymentDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, PaymentDraft>>({});
  const getDraft = (id: string) => draft[id] ?? EMPTY_PAYMENT;
  return (
    <div className="space-y-4">
      <SectionTitle icon={<WalletCards className="size-5" />} title="Payment Collection" subtitle="Hosur Branch and Admin can clear credit. Partial credit settlement is supported." />
      {credits.length === 0 ? <EmptyState icon={<WalletCards className="size-6" />} title="No pending credit to collect" /> : credits.map((credit) => {
        const d = getDraft(credit.id);
        return <Card key={credit.id} className="space-y-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{credit.shopName}</p><p className="text-xs text-muted-foreground">Bill {credit.billNo} · Balance {money(credit.balanceAmount)} · Due {toDateLabel(credit.dueDate)}</p></div><Badge tone={credit.dueDate && daysBetween(credit.dueDate) > 0 ? 'red' : 'amber'}>{credit.dueDate && daysBetween(credit.dueDate) > 0 ? 'overdue' : 'pending'}</Badge></div><div className="grid gap-3 md:grid-cols-4"><Field label="Amount collected"><input className={inputClass} type="number" value={d.paidAmount} onChange={(e) => setDraft((p) => ({ ...p, [credit.id]: { ...getDraft(credit.id), paidAmount: e.target.value } }))} placeholder="Amount" /></Field><Field label="Payment mode"><select className={inputClass} value={d.paymentMode} onChange={(e) => setDraft((p) => ({ ...p, [credit.id]: { ...getDraft(credit.id), paymentMode: e.target.value as PaymentMode } }))}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option><option value="mixed">Mixed</option></select></Field><Field label="Remarks"><input className={inputClass} value={d.remarks} onChange={(e) => setDraft((p) => ({ ...p, [credit.id]: { ...getDraft(credit.id), remarks: e.target.value } }))} placeholder="Optional" /></Field><div className="flex items-end"><button className={primaryButton} disabled={busy} onClick={() => withBusy(() => collectCredit(credit, d), 'Credit payment recorded.')}>{busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Collect</button></div></div></Card>;
      })}
    </div>
  );
}

function WhatsappLogsTab({ logs, busy, withBusy, sendWhatsapp }: {
  logs: HosurWhatsappLog[];
  busy: boolean;
  withBusy: (fn: () => Promise<void>, success?: string) => Promise<void>;
  sendWhatsapp: (args: { shopId?: string | null; shopName: string; phone: string; billId?: string | null; billNo?: string | null; messageType: HosurWhatsappLog['messageType']; body: string; retryLogId?: string }) => Promise<{ status: HosurWhatsappLog['status']; logId?: string; errorMessage?: string | null }>;
}) {
  return (
    <div className="space-y-4">
      <SectionTitle icon={<MessageCircle className="size-5" />} title="WhatsApp Logs" subtitle="Success/failure status for bill and payment reminder messages. Failed messages can be retried." />
      <Card className="space-y-2">{logs.length === 0 ? <EmptyState icon={<MessageCircle className="size-6" />} title="No WhatsApp logs yet" /> : logs.map((log) => <div key={log.id} className="rounded-2xl border p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{log.shopName} · {log.billNo ?? log.messageType}</p><p className="text-xs text-muted-foreground">{log.phone} · {toDateTimeLabel(log.sentAt ?? log.createdAt)}</p>{log.errorMessage && <p className="mt-1 text-xs font-semibold text-red-600">{log.errorMessage}</p>}</div><div className="flex items-center gap-2"><Badge tone={statusTone(log.status)}>{log.status}</Badge>{log.status === 'failed' && <button className={softButton} disabled={busy} onClick={() => withBusy(() => sendWhatsapp({ shopId: log.shopId, shopName: log.shopName, phone: log.phone, billId: log.billId, billNo: log.billNo, messageType: log.messageType, body: log.messageBody, retryLogId: log.id }).then(() => undefined), 'WhatsApp retry completed.')}>Retry</button>}</div></div><details className="mt-2"><summary className="cursor-pointer text-xs font-black text-muted-foreground">View message</summary><pre className="mt-2 whitespace-pre-wrap rounded-xl bg-muted p-3 text-xs">{log.messageBody}</pre></details></div>)}</Card>
    </div>
  );
}

function ReminderHistoryTab({ reminders, credits, busy, withBusy, runDueReminders }: {
  reminders: HosurReminder[];
  credits: HosurCreditLedger[];
  busy: boolean;
  withBusy: (fn: () => Promise<void>, success?: string) => Promise<void>;
  runDueReminders: () => Promise<void>;
}) {
  const eligible = credits.filter((c) => c.dueDate && daysBetween(c.dueDate) > 0).length;
  return (
    <div className="space-y-4">
      <SectionTitle icon={<Bell className="size-5" />} title="Payment Reminder History" subtitle="Reminder repeats every 10 days after due date until credit is cleared." action={<button className={primaryButton} disabled={busy || eligible === 0} onClick={() => withBusy(runDueReminders, 'Due reminders processed.')}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send Due Reminders Now</button>} />
      <Card className="space-y-2">{reminders.length === 0 ? <EmptyState icon={<Bell className="size-6" />} title="No reminders sent yet" /> : reminders.map((reminder) => <div key={reminder.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3"><div><p className="font-black">{reminder.shopName} · Reminder #{reminder.reminderNo}</p><p className="text-xs text-muted-foreground">Pending {money(reminder.pendingAmount)} · Due {toDateLabel(reminder.dueDate)} · Sent {toDateTimeLabel(reminder.sentAt ?? reminder.createdAt)}</p></div><Badge tone={statusTone(reminder.status)}>{reminder.status}</Badge></div>)}</Card>
    </div>
  );
}

function DailyClosureTab({ orders, bills, credits, payments, disputes, logs }: {
  orders: HosurOrder[];
  bills: HosurBill[];
  credits: HosurCreditLedger[];
  payments: HosurCreditPayment[];
  disputes: HosurDispute[];
  logs: HosurWhatsappLog[];
}) {
  const [date, setDate] = useState(TODAY_ISO());

  const dayBills = bills.filter((b) => (b.confirmedAt ?? b.createdAt).slice(0, 10) === date);
  const dayOrders = orders.filter((o) => o.createdAt.slice(0, 10) === date);
  const dayPayments = payments.filter((p) => p.createdAt.slice(0, 10) === date);
  const dayDisputes = disputes.filter((d) => d.createdAt.slice(0, 10) === date);
  const dayLogs = logs.filter((l) => l.createdAt.slice(0, 10) === date);

  const fullPayments = dayBills.filter((b) => b.paymentType === 'full').reduce((s, b) => s + b.paidAmount, 0);
  const creditBills = dayBills.filter((b) => b.paymentType === 'credit').reduce((s, b) => s + b.creditAmount, 0);
  const partialPaid = dayBills.filter((b) => b.paymentType === 'partial').reduce((s, b) => s + b.paidAmount, 0);
  const partialCredit = dayBills.filter((b) => b.paymentType === 'partial').reduce((s, b) => s + b.creditAmount, 0);
  const clearedCredit = dayPayments.filter((p) =>
    p.payment_purpose === 'credit_collection'
  ).reduce((s, p) => s + p.amountCollected, 0);

  const totalCollection = fullPayments + partialPaid + clearedCredit;
  const totalCredit = creditBills + partialCredit;

  const waSent = dayLogs.filter((l) => l.status === 'sent').length;
  const waFailed = dayLogs.filter((l) => l.status === 'failed').length;

  return (
    <div className="space-y-5 print:bg-white">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black text-foreground">Daily Closure</h2>
          <p className="text-sm text-muted-foreground">Handover summary for Hosur Branch</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          <button className={softButton} onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </button>
        </div>
      </div>

      {/* Top KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Orders Placed" value={dayOrders.length} icon={<ShoppingCart className="size-4" />} tone="blue" />
        <Metric label="Bills Raised" value={dayBills.length} icon={<Receipt className="size-4" />} tone="emerald" />
        <Metric label="Cash Collected" value={money(totalCollection)} icon={<IndianRupee className="size-4" />} tone="emerald" />
        <Metric label="Credit Given" value={money(totalCredit)} icon={<CreditCard className="size-4" />} tone="red" />
      </div>

      {/* Payment Breakdown */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <h3 className="font-black text-sm uppercase tracking-wide text-muted-foreground">Payment Breakdown</h3>
        <div className="grid gap-2 md:grid-cols-3">
          {[
            { label: 'Full Payments', value: money(fullPayments), color: 'text-emerald-700 bg-emerald-50' },
            { label: 'Partial — Paid Now', value: money(partialPaid), color: 'text-blue-700 bg-blue-50' },
            { label: 'Credit Cleared Today', value: money(clearedCredit), color: 'text-teal-700 bg-teal-50' },
            { label: 'Full Credit Bills', value: money(creditBills), color: 'text-red-700 bg-red-50' },
            { label: 'Partial — Credit Balance', value: money(partialCredit), color: 'text-orange-700 bg-orange-50' },
          ].map(({ label, value, color }) => (
            <div key={label} className={cn('rounded-2xl p-3', color)}>
              <p className="text-xs font-bold uppercase opacity-70">{label}</p>
              <p className="mt-1 font-display text-xl font-black">{value}</p>
            </div>
          ))}
          <div className="rounded-2xl p-3 bg-slate-900 text-white">
            <p className="text-xs font-bold uppercase opacity-70">Total Collected</p>
            <p className="mt-1 font-display text-xl font-black">{money(totalCollection)}</p>
          </div>
        </div>
      </div>

      {/* Activity Summary */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <h3 className="font-black text-sm uppercase tracking-wide text-muted-foreground">Activity Summary</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            { label: 'Disputes Raised', value: dayDisputes.length, tone: dayDisputes.length > 0 ? 'text-amber-700' : 'text-foreground' },
            { label: 'WhatsApp Sent', value: waSent, tone: 'text-emerald-700' },
            { label: 'WhatsApp Failed', value: waFailed, tone: waFailed > 0 ? 'text-red-700' : 'text-foreground' },
            { label: 'Payments Received', value: dayPayments.length, tone: 'text-blue-700' },
          ].map(({ label, value, tone }) => (
            <div key={label} className="rounded-2xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground font-semibold">{label}</p>
              <p className={cn('mt-1 font-display text-2xl font-black', tone)}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bill List */}
      {dayBills.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <h3 className="font-black text-sm uppercase tracking-wide text-muted-foreground">Bills for {toDateLabel(date)}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Bill No</th>
                  <th className="px-3 py-2">Shop</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dayBills.map((b) => (
                  <tr key={b.id} className="bg-card">
                    <td className="px-3 py-2 font-semibold">{b.billNo}</td>
                    <td className="px-3 py-2">{b.shopName}</td>
                    <td className="px-3 py-2 font-black">{money(b.subtotal)}</td>
                    <td className="px-3 py-2 capitalize">{b.paymentType ?? '—'}</td>
                    <td className="px-3 py-2"><Badge tone={statusTone(b.status)}>{b.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportsTab({ shops, bills, billItems, credits, logs, reminders, disputes }: {
  shops: HosurShop[];
  bills: HosurBill[];
  billItems: Record<string, HosurBillItem[]>;
  credits: HosurCreditLedger[];
  logs: HosurWhatsappLog[];
  reminders: HosurReminder[];
  disputes: HosurDispute[];
}) {
  const [from, setFrom] = useState(TODAY_ISO().slice(0, 8) + '01');
  const [to, setTo] = useState(TODAY_ISO());
  const [reportTab, setReportTab] = useState<'sales' | 'credit' | 'items' | 'whatsapp' | 'disputes'>('sales');

  const inRange = (date: string) => date.slice(0, 10) >= from && date.slice(0, 10) <= to;
  const rangeBills = bills.filter((b) => inRange(b.confirmedAt ?? b.createdAt));

  const shopSales = shops
    .map((s) => ({
      shop: s.shopName,
      bills: rangeBills.filter((b) => b.shopId === s.id).length,
      total: rangeBills.filter((b) => b.shopId === s.id).reduce((sum, b) => sum + b.subtotal, 0),
      credit: credits.filter((c) => c.shopId === s.id && c.balanceAmount > 0).reduce((sum, c) => sum + c.balanceAmount, 0),
    }))
    .filter((r) => r.total > 0 || r.credit > 0)
    .sort((a, b) => b.total - a.total);

  const itemMap = new Map<string, { qty: number; total: number }>();
  rangeBills.forEach((bill) => (billItems[bill.id] ?? []).forEach((item) => {
    const row = itemMap.get(item.itemName) ?? { qty: 0, total: 0 };
    row.qty += item.quantity;
    row.total += item.lineTotal;
    itemMap.set(item.itemName, row);
  }));
  const itemSales = Array.from(itemMap.entries())
    .map(([item, row]) => ({ item, ...row }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 60);

  const openCredits = credits.filter((c) => c.balanceAmount > 0).sort((a, b) => b.balanceAmount - a.balanceAmount);
  const rangeDisputes = disputes.filter((d) => inRange(d.createdAt));
  const rangeLogs = logs.filter((l) => inRange(l.createdAt));

  const totalSales = shopSales.reduce((s, r) => s + r.total, 0);
  const totalCredit = openCredits.reduce((s, c) => s + c.balanceAmount, 0);

  const exportCsv = () => {
    const lines = [
      ['Report', 'Name', 'Amount/Count'],
      ...shopSales.map((r) => ['Shop Sales', r.shop, String(r.total)]),
      ...itemSales.map((r) => ['Item Sales', r.item, String(r.total)]),
      ...openCredits.map((c) => ['Open Credit', c.shopName, String(c.balanceAmount)]),
    ];
    const blob = new Blob([lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hosur-reports-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reportTabs = [
    { id: 'sales', label: '🏪 Shop Sales' },
    { id: 'items', label: '📦 Item Sales' },
    { id: 'credit', label: '💳 Credit Due' },
    { id: 'whatsapp', label: '💬 WhatsApp' },
    { id: 'disputes', label: '⚠️ Disputes' },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black">Reports</h2>
          <p className="text-sm text-muted-foreground">Shop-wise sales, credit, items, WhatsApp & disputes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className={inputClass} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="self-center text-muted-foreground text-sm">to</span>
          <input className={inputClass} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className={softButton} onClick={exportCsv}><Download className="size-4" /> CSV</button>
          <button className={softButton} onClick={() => window.print()}><Printer className="size-4" /> Print</button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Total Sales" value={money(totalSales)} icon={<IndianRupee className="size-4" />} tone="emerald" />
        <Metric label="Bills Count" value={rangeBills.length} icon={<Receipt className="size-4" />} tone="blue" />
        <Metric label="Open Credit" value={money(totalCredit)} icon={<CreditCard className="size-4" />} tone="red" />
        <Metric label="Shops Served" value={shopSales.length} icon={<Store className="size-4" />} tone="slate" />
      </div>

      {/* Sub-tab pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {reportTabs.map((t) => (
          <button key={t.id} onClick={() => setReportTab(t.id)}
            className={cn('shrink-0 rounded-full border px-4 py-1.5 text-xs font-black whitespace-nowrap transition',
              reportTab === t.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'bg-card hover:bg-muted'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Shop Sales */}
      {reportTab === 'sales' && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 border-b">
            <h3 className="font-black text-sm">Shop-wise Sales — {toDateLabel(from)} to {toDateLabel(to)}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Shop</th>
                  <th className="px-4 py-2 text-right">Bills</th>
                  <th className="px-4 py-2 text-right">Sales</th>
                  <th className="px-4 py-2 text-right">Credit Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shopSales.length === 0
                  ? <tr><td className="px-4 py-6 text-center text-muted-foreground" colSpan={4}>No sales in this period</td></tr>
                  : shopSales.map((r) => (
                    <tr key={r.shop} className="bg-card hover:bg-muted/20">
                      <td className="px-4 py-2 font-semibold">{r.shop}</td>
                      <td className="px-4 py-2 text-right">{r.bills}</td>
                      <td className="px-4 py-2 text-right font-black text-emerald-700">{money(r.total)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-red-600">{r.credit > 0 ? money(r.credit) : '—'}</td>
                    </tr>
                  ))}
              </tbody>
              {shopSales.length > 0 && (
                <tfoot className="bg-muted/60 font-black text-sm">
                  <tr>
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right">{rangeBills.length}</td>
                    <td className="px-4 py-2 text-right text-emerald-700">{money(totalSales)}</td>
                    <td className="px-4 py-2 text-right text-red-600">{money(totalCredit)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Item Sales */}
      {reportTab === 'items' && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 border-b">
            <h3 className="font-black text-sm">Item-wise Sales — Top {itemSales.length} items</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {itemSales.length === 0
                  ? <tr><td className="px-4 py-6 text-center text-muted-foreground" colSpan={4}>No items in this period</td></tr>
                  : itemSales.map((r, i) => (
                    <tr key={r.item} className="bg-card hover:bg-muted/20">
                      <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2 font-semibold">{r.item}</td>
                      <td className="px-4 py-2 text-right">{num(r.qty)}</td>
                      <td className="px-4 py-2 text-right font-black text-emerald-700">{money(r.total)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Credit Due */}
      {reportTab === 'credit' && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 border-b">
            <h3 className="font-black text-sm">Open Credit Dues (all time)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Shop</th>
                  <th className="px-4 py-2">Bill No</th>
                  <th className="px-4 py-2">Due Date</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {openCredits.length === 0
                  ? <tr><td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>No open credit dues</td></tr>
                  : openCredits.map((c) => (
                    <tr key={c.id} className="bg-card hover:bg-muted/20">
                      <td className="px-4 py-2 font-semibold">{c.shopName}</td>
                      <td className="px-4 py-2">{c.billNo}</td>
                      <td className="px-4 py-2">{toDateLabel(c.dueDate)}</td>
                      <td className="px-4 py-2 text-right font-black text-red-600">{money(c.balanceAmount)}</td>
                      <td className="px-4 py-2"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* WhatsApp */}
      {reportTab === 'whatsapp' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-4 py-3 bg-muted/40 border-b"><h3 className="font-black text-sm">WhatsApp Log</h3></div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Count</th></tr>
                </thead>
                <tbody className="divide-y">
                  {(['sent', 'failed', 'queued'] as const).map((s) => (
                    <tr key={s} className="bg-card">
                      <td className="px-4 py-2 capitalize font-semibold">{s}</td>
                      <td className="px-4 py-2 text-right font-black">{rangeLogs.filter((l) => l.status === s).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-4 py-3 bg-muted/40 border-b"><h3 className="font-black text-sm">Reminder History</h3></div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2">Shop</th><th className="px-4 py-2 text-right">Pending</th><th className="px-4 py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y">
                  {reminders.filter((r) => inRange(r.createdAt)).length === 0
                    ? <tr><td className="px-4 py-6 text-center text-muted-foreground" colSpan={3}>No reminders in this period</td></tr>
                    : reminders.filter((r) => inRange(r.createdAt)).map((r) => (
                      <tr key={r.id} className="bg-card">
                        <td className="px-4 py-2 font-semibold">{r.shopName}</td>
                        <td className="px-4 py-2 text-right">{money(r.pendingAmount)}</td>
                        <td className="px-4 py-2"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Disputes */}
      {reportTab === 'disputes' && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 border-b">
            <h3 className="font-black text-sm">Disputes — {toDateLabel(from)} to {toDateLabel(to)}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2 text-right">Expected</th>
                  <th className="px-4 py-2 text-right">Received</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rangeDisputes.length === 0
                  ? <tr><td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>No disputes in this period</td></tr>
                  : rangeDisputes.map((d) => (
                    <tr key={d.id} className="bg-card hover:bg-muted/20">
                      <td className="px-4 py-2 font-semibold">{d.orderNumber ?? '—'}</td>
                      <td className="px-4 py-2">{d.itemName}</td>
                      <td className="px-4 py-2 text-right">{num(d.expectedQuantity)} {d.unit}</td>
                      <td className="px-4 py-2 text-right">{num(d.receivedQuantity)} {d.unit}</td>
                      <td className="px-4 py-2"><Badge tone={statusTone(d.status)}>{d.status}</Badge></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationsTab({ notifications, busy, withBusy }: {
  notifications: AdminNotification[];
  busy: boolean;
  withBusy: (fn: () => Promise<void>, success?: string) => Promise<void>;
}) {
  const markRead = async (id: string) => {
    const { error } = await supabase.from('admin_notifications').update({ is_read: true }).eq('id', id);
    if (error) throw error;
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length === 0) return;
    const { error } = await supabase.from('admin_notifications').update({ is_read: true }).in('id', unreadIds);
    if (error) throw error;
  };

  const unread = notifications.filter((n) => !n.isRead);
  const read = notifications.filter((n) => n.isRead);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            {unread.length > 0 ? `${unread.length} unread notification${unread.length > 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        {unread.length > 0 && (
          <button className={softButton} disabled={busy} onClick={() => withBusy(markAllRead, 'All notifications marked as read.')}>
            <BadgeCheck className="size-4" /> Mark All Read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={<Bell className="size-6" />} title="No notifications" subtitle="Workflow events, credit alerts and WhatsApp failures will appear here." />
      ) : (
        <div className="space-y-4">
          {/* Unread */}
          {unread.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-wider text-amber-700 px-1">Unread ({unread.length})</p>
              {unread.map((n) => (
                <div key={n.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 size-2 shrink-0 rounded-full bg-amber-500" />
                      <div>
                        <p className="font-black text-sm">{n.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {toDateTimeLabel(n.createdAt)}{n.refLabel ? ` · ${n.refLabel}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    className="shrink-0 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-black text-amber-700 hover:bg-amber-100"
                    disabled={busy}
                    onClick={() => withBusy(() => markRead(n.id), 'Marked as read.')}
                  >
                    Mark Read
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Read */}
          {read.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">Earlier ({read.length})</p>
              {read.map((n) => (
                <div key={n.id} className="rounded-2xl border bg-card p-4">
                  <p className="font-semibold text-sm text-muted-foreground">{n.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {toDateTimeLabel(n.createdAt)}{n.refLabel ? ` · ${n.refLabel}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
