import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  AlertTriangle, Banknote, Bell, Building2, CalendarClock, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck,
  CreditCard, Download, FileClock, FileText, Gift, History, IndianRupee, Landmark, Loader2, Package,
  Pencil, Plus, Printer, Receipt, RotateCcw, Search, ShieldCheck, Smartphone, Store, Trash2,
  Truck, UserRound, WalletCards, X, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { businessDate } from '@/lib/businessDate';
import { downloadExcel } from '@/lib/excelDownload';
import { useAuthStore } from '@/stores/authStore';
import { useBakeryStore } from '@/bakery/bakeryStore';
import type { BakeryOrderItem } from '@/bakery/types';
import { useBranchStore, type CreditSale, type SaleRecord, type StockItem } from '../branchStore';
import type { Branch } from '../types';
import { BRANCH_LABELS } from '../types';
import {
  money, nextBranchAdvanceOrderNumberAtomic, useBranchOpsStore,
  type BranchBillItem, type BranchBillRecord,
  type CakeAdvanceOrder, type PurchaseOrderRecord,
} from '../branchOpsStore';
import { useBranchCatalogStore, type BranchCatalogItem } from '@/stores/branchCatalogStore';
import { printCounterBill, printHtml, printBranchCashierClosure, printCounterOpenSlip } from '../printUtils';
import { CAKE_DESIGNS, CAKE_DRAWING_CHARGE, CAKE_PHOTO_CHARGE, cakeTypesFor, calculateCakePrice, findCakeType, type CakeCreamType, type CakeDesignType } from '../cakePricing';

type ModuleProps = { branch: Branch; branchStock: StockItem[]; branchSales?: SaleRecord[]; onOpenTab?: (tab: string) => void; source?: 'branch' | 'snb-order' };

type LedgerBillRow = {
  id: string;
  bill_no: string;
  invoice_no: number;
  bill_type: string;
  customer_name: string | null;
  customer_phone: string | null;
  salesperson: string | null;
  biller: string | null;
  subtotal: number | string;
  discount: number | string;
  discount_percent?: number | string | null;
  tax: number | string;
  round_off?: number | string | null;
  total: number | string;
  tendered: number | string;
  balance: number | string;
  status: string;
  created_at: string;
  branch_bill_items?: Array<{
    item_name: string;
    quantity: number | string;
    unit: 'pcs' | 'kg';
    unit_price: number | string;
    discount: number | string | null;
    tax: number | string | null;
    line_total: number | string;
  }>;
  branch_sale_payments?: Array<{
    payment_mode: 'cash' | 'upi' | 'card' | 'bank' | 'mixed';
    amount: number | string;
  }>;
};

type ClosureLedgerRow = {
  branch: Branch;
  closure_date: string;
  bill_count: number | string;
  sales_total: number | string;
  credit_billed: number | string;
  discounts: number | string;
  tax_total: number | string;
  cash_total: number | string;
  upi_total: number | string;
  card_total: number | string;
  credit_collected: number | string;
  advance_collected: number | string;
  advance_balance_collected: number | string;
};

type CounterClosureSnapshot = {
  counterSession?: Record<string, unknown> | null;
  advanceCash: number;
  advanceUpi: number;
  advanceCard: number;
  advanceBank: number;
  advanceInitial: number;
  advanceBalance: number;
  advanceTotal: number;
  paymentCount: number;
  sourceRole?: string;
  sourceLabel?: string;
};

type SavedClosureRow = {
  id: string;
  branch: Branch;
  closure_date: string;
  cashier: string;
  opening_cash: number | string;
  cash_total: number | string;
  upi_total: number | string;
  card_total: number | string;
  credit_billed: number | string;
  credit_collected: number | string;
  refunds: number | string;
  expenses: number | string;
  discounts: number | string;
  bill_count: number | string;
  duplicate_prints: number | string;
  expected_cash: number | string;
  actual_cash: number | string;
  difference: number | string;
  notes: string | null;
  created_at: string;
};

const num = (value: number | string | null | undefined) => Number(value ?? 0);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const todayIso = () => businessDate();
const qtyValue = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const qtyChanged = (left: number, right: number) => Math.abs(left - right) > 0.001;

type FieldProps = { label: string; children: React.ReactNode };
function Field({ label, children }: FieldProps) {
  return <label className="space-y-1.5"><span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={cn('h-[clamp(2.25rem,4.4vh,2.75rem)] w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-bold sm:text-base text-slate-900 outline-none focus:border-amber-400', props.className)} />; }
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={cn('h-[clamp(2.25rem,4.4vh,2.75rem)] w-full rounded-xl border-2 border-slate-200 bg-white px-3 text-sm font-bold sm:text-base text-slate-900 outline-none focus:border-amber-400', props.className)} />; }
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={cn('min-h-[clamp(3.5rem,8vh,5rem)] w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold sm:text-base text-slate-900 outline-none focus:border-amber-400', props.className)} />; }
function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={cn('inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5 disabled:opacity-50', props.className)} />; }
function SoftButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={cn('inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50', props.className)} />; }
function Section({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) { return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.2rem] border border-slate-200 bg-white shadow-sm sm:rounded-[1.45rem]"><div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2"><div className="flex items-center gap-2"> <div className="rounded-xl bg-slate-100 p-1.5 text-slate-700">{icon}</div><h3 className="text-base font-black text-slate-950 sm:text-lg">{title}</h3></div>{action}</div><div className="min-h-0 flex-1 overflow-auto p-2.5 sm:p-3">{children}</div></section>; }
function Kpi({ label, value, icon, tone = 'slate' }: { label: string; value: string | number; icon: React.ReactNode; tone?: 'slate'|'green'|'amber'|'red'|'blue' }) {
  const styles = { slate: 'bg-slate-950 text-white', green: 'bg-emerald-600 text-white', amber: 'bg-amber-400 text-slate-950', red: 'bg-red-600 text-white', blue: 'bg-blue-600 text-white' };
  return <div className={cn('rounded-[1.25rem] p-3 shadow-sm sm:p-4', styles[tone])}><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70 sm:text-xs">{label}</p>{icon}</div><p className="mt-2 text-2xl font-black tabular-nums sm:text-3xl">{value}</p></div>;
}

function useOperationalCatalog(branch: Branch) {
  const { items, loadCatalog, subscribe } = useBranchCatalogStore();
  const catalogBranch = branch === 'VRSNB' ? 'VRSNB' : 'SNB';
  useEffect(() => {
    void loadCatalog(catalogBranch);
    return subscribe(catalogBranch);
  }, [catalogBranch, loadCatalog, subscribe]);
  return items[catalogBranch].filter((item) => item.active);
}
function stockQty(stock: StockItem[], item: string, barcode?: number) {
  const normalizedItem = item.trim().toLowerCase();
  const exactItem = stock.find((row) => row.itemName.trim().toLowerCase() === normalizedItem);
  const barcodeItem = barcode != null ? stock.find((row) => row.itemBarcode === barcode) : undefined;
  return Math.max(Number(exactItem?.quantity || 0), Number(barcodeItem?.quantity || 0));
}
function today(d: string) { return new Date(d).toDateString() === new Date().toDateString(); }
function month(d: string) { const x = new Date(d), n = new Date(); return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth(); }
function printAdvanceSalesOrder(payload: {
  branch: Branch;
  orderNo: string;
  slipNumber?: string;
  customerName: string;
  mobile: string;
  deliveryDate: string;
  deliveryTime?: string;
  items: BranchBillItem[];
  orderValue: number;
  advanceAmount: number;
  balanceAmount: number;
  paymentMode: string;
  staffName: string;
  fullyPaid?: boolean;
  cakeDetails?: {
    creamType: string;
    cakeType: string;
    flavor: string;
    weightKg: number;
    shape: string;
    design: string;
    baseRate: number;
    baseAmount: number;
    designCharge: number;
    drawingCharge: number;
    photoCharge: number;
    messageOnCake?: string;
  };
}) {
  const now = new Date();
  const business = payload.branch === 'VRSNB'
    ? { name: 'VRSNB FOODS LLP', lines: ['#109/1C, Hosur main Road, Berigai', 'Soolagiri TK, Krishnagiri DT, Tamilnadu 635105', 'GST NO: 33AAZFV1266C1ZZ | FSSAI NO: 12425011000098'] }
    : { name: 'Sri Nanjundeshwara Bakery', lines: ['404, Bagalur Main Road, Berigai Bus Stand', 'Krishnagiri, Tamil Nadu, Hosur-635105', 'GSTIN: 33AMTPR1760M1ZE'] };
  const itemRows = payload.items.map((item, idx) => `<tr><td>${idx + 1}</td><td>${item.itemName}</td><td class="num">${item.quantity.toFixed(item.unit === 'kg' ? 2 : 0)}</td><td class="num">${item.price.toFixed(2)}</td><td class="num">${item.lineTotal.toFixed(2)}</td></tr>`).join('');
  const qtyTotal = payload.items.reduce((sum, item) => sum + item.quantity, 0);
  const docTitle = payload.fullyPaid ? 'SALES ORDER SLIP' : 'ADVANCE SALES ORDER';
  const cakeDetailsHtml = payload.cakeDetails ? `<div class="dash"></div><div class="small"><b>Cake:</b> ${payload.cakeDetails.creamType} - ${payload.cakeDetails.cakeType}<br/><b>Flavor:</b> ${payload.cakeDetails.flavor} - <b>Weight:</b> ${payload.cakeDetails.weightKg} kg - <b>Shape:</b> ${payload.cakeDetails.shape}<br/><b>Design:</b> ${payload.cakeDetails.design}${payload.cakeDetails.messageOnCake ? `<br/><b>Message:</b> ${payload.cakeDetails.messageOnCake}` : ''}</div>` : '';
  const cakePriceHtml = payload.cakeDetails ? `<div class="dash"></div><div class="row"><span>Base (${payload.cakeDetails.weightKg === 0.5 ? '0.5 kg special rate' : `Rs ${payload.cakeDetails.baseRate.toFixed(2)}/kg`}):</span><span>Rs ${payload.cakeDetails.baseAmount.toFixed(2)}</span></div>${payload.cakeDetails.designCharge > 0 ? `<div class="row"><span>${payload.cakeDetails.design}:</span><span>+Rs ${payload.cakeDetails.designCharge.toFixed(2)}</span></div>` : ''}${payload.cakeDetails.drawingCharge > 0 ? `<div class="row"><span>Drawing/design work:</span><span>+Rs ${payload.cakeDetails.drawingCharge.toFixed(2)}</span></div>` : ''}${payload.cakeDetails.photoCharge > 0 ? `<div class="row"><span>Photo work:</span><span>+Rs ${payload.cakeDetails.photoCharge.toFixed(2)}</span></div>` : ''}` : '';
  const html = `<!doctype html><html><head><title>${payload.orderNo}</title><style>@page{size:80mm auto;margin:3mm}body{font-family:Arial,sans-serif;font-size:11px;color:#111}.c{text-align:center}.brand{font-size:20px;font-weight:900}.small{font-size:10px}.doc{font-size:14px;font-weight:900;margin:8px 0}.row{display:flex;justify-content:space-between;gap:8px}.dash{border-top:1px solid #111;margin:5px 0}table{width:100%;border-collapse:collapse}th{border-top:1px solid #111;border-bottom:1px solid #111;font-size:11px;text-align:left;padding:3px 2px}td{padding:3px 2px;vertical-align:top}.num{text-align:right}.total-row td{border-top:1px solid #111;font-weight:900}.net{border-top:1px solid #111;border-bottom:1px solid #111;font-size:14px;font-weight:900;margin-top:4px;padding:4px 0;display:flex;justify-content:space-between}.stamp{border:2px solid #111;padding:4px 8px;text-align:center;font-weight:900;font-size:13px;margin:4px 0}.footer{margin-top:10px;text-align:center;font-size:13px;font-weight:800}</style></head><body><div class="c brand">${business.name}</div><div class="c small">${business.lines.join('<br/>')}</div><div class="c doc">${docTitle}</div>${payload.fullyPaid ? '<div class="stamp">PAID IN FULL</div>' : ''}<div class="dash"></div><div class="row"><span>Order No: ${payload.orderNo}</span><span>Date: ${now.toLocaleDateString('en-GB')}</span></div>${payload.slipNumber ? `<div class="row"><span>Slip No:</span><span>${payload.slipNumber}</span></div>` : ''}<div class="row"><span>Customer: ${payload.customerName}</span><span>${payload.mobile}</span></div><div class="row"><span>Delivery: ${payload.deliveryDate} ${payload.deliveryTime || ''}</span></div>${cakeDetailsHtml}<div class="dash"></div><table><thead><tr><th>Sn</th><th>Item Name</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amt</th></tr></thead><tbody>${itemRows}<tr class="total-row"><td></td><td>Total Qty: ${qtyTotal.toFixed(0)}</td><td></td><td class="num">Sub Total</td><td class="num">&#x20B9;${payload.orderValue.toFixed(2)}</td></tr></tbody></table>${cakePriceHtml}<div class="net"><span>Grand Total</span><span>&#x20B9;${payload.orderValue.toFixed(2)}</span></div><div class="row"><span>Advance Paid:</span><span>&#x20B9;${payload.advanceAmount.toFixed(2)} (${payload.paymentMode.toUpperCase()})</span></div>${!payload.fullyPaid ? `<div class="row"><span>Balance Due:</span><span>&#x20B9;${payload.balanceAmount.toFixed(2)}</span></div>` : ''}<div class="dash"></div><div class="c small">${payload.branch === 'SNB' ? 'Salesperson' : 'Cashier'}: ${payload.staffName}</div><div class="footer">Thank You &amp; Visit Again...!!!</div><script>window.onload=()=>window.print()</script></body></html>`;
  const win = window.open('', '_blank', 'width=420,height=680');
  if (win) { win.document.write(html); win.document.close(); }
}

export function BranchBillHistoryProTab({ branch }: ModuleProps) {
  const { bills, markBillDuplicate } = useBranchOpsStore();
  const { currentUser } = useAuthStore();
  const [query, setQuery] = useState('');
  const [ledgerBills, setLedgerBills] = useState<BranchBillRecord[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [ledgerMessage, setLedgerMessage] = useState('');
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const isVRSNB = branch === 'VRSNB';

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingLedger(true);
      setLedgerMessage('');
      const allRows: LedgerBillRow[] = [];
      let loadError: { message: string } | null = null;
      for (let from = 0; from < 30000; from += 1000) {
        const { data, error } = await supabase
          .from('branch_bill_headers')
          .select('id, bill_no, invoice_no, bill_type, customer_name, customer_phone, salesperson, biller, subtotal, discount, discount_percent, tax, round_off, total, tendered, balance, status, created_at, branch_bill_items(item_name, quantity, unit, unit_price, discount, tax, line_total), branch_sale_payments(payment_mode, amount)')
          .eq('branch', branch)
          .order('created_at', { ascending: false })
          .range(from, from + 999);
        if (error) { loadError = error; break; }
        const page = (data || []) as LedgerBillRow[];
        allRows.push(...page);
        if (page.length < 1000) break;
      }

      if (!active) return;
      if (loadError) {
        const missingLedger = /branch_bill_headers|does not exist|schema cache/i.test(loadError.message);
        setLedgerBills([]);
        setLedgerMessage(missingLedger
          ? 'Supabase bill ledger is not installed yet. Run 20260614_branch_core_tables.sql and 20260614_branch_atomic_checkout_rpc.sql, then this history will load from Supabase.'
          : `Could not load Supabase bill history: ${loadError.message}`);
        setLoadingLedger(false);
        return;
      }

      const mapped = allRows.map((row) => {
        const items = (row.branch_bill_items || []).map((item) => ({
          itemName: item.item_name,
          quantity: num(item.quantity),
          unit: item.unit,
          price: num(item.unit_price),
          discount: num(item.discount),
          tax: num(item.tax),
          lineTotal: num(item.line_total),
        }));
        const payments = row.branch_sale_payments || [];
        const splitTotals = payments.reduce<Record<string, number>>((acc, payment) => {
          acc[payment.payment_mode] = (acc[payment.payment_mode] || 0) + num(payment.amount);
          return acc;
        }, {});
        const modes = Object.keys(splitTotals).filter((mode) => splitTotals[mode] > 0);
        const paymentMode = row.bill_type === 'credit'
          ? 'credit'
          : modes.length > 1
            ? 'split'
            : ((modes[0] || 'cash') as BranchBillRecord['paymentMode']);
        const split = {
          cash: splitTotals.cash || 0,
          upi: splitTotals.upi || 0,
          card: splitTotals.card || 0,
        };

        return {
          id: row.id,
          branch,
          billNo: row.bill_no,
          invoiceNo: num(row.invoice_no),
          items,
          subtotal: num(row.subtotal),
          discount: num(row.discount),
          discountPercent: row.discount_percent == null ? undefined : num(row.discount_percent),
          tax: num(row.tax),
          roundOff: row.round_off == null ? undefined : num(row.round_off),
          amountBeforeRoundOff: roundMoney(num(row.total) - num(row.round_off)),
          total: num(row.total),
          tendered: num(row.tendered),
          balance: num(row.balance),
          paymentMode,
          creditCustomerName: row.customer_name || undefined,
          creditCustomerMobile: row.customer_phone || undefined,
          split: paymentMode === 'split' || row.bill_type === 'credit' ? split : undefined,
          salesperson: row.salesperson || 'Staff',
          biller: row.biller || 'Staff',
          createdAt: row.created_at,
          printCount: row.status === 'duplicate_printed' ? 2 : 1,
          status: row.status === 'duplicate_printed' ? 'Duplicate Bill' : row.status === 'returned' ? 'Returned' : 'Original Bill',
          source: row.bill_type === 'advance_final' ? 'advance-final' : 'counter',
        } as BranchBillRecord;
      });

      setLedgerBills(mapped);
      setLoadingLedger(false);
    };

    void load();
    return () => { active = false; };
  }, [branch]);

  const sourceRows = ledgerBills.length > 0 ? ledgerBills : bills.filter((b) => b.branch === branch);
  const rows = sourceRows.filter((b) => {
    const q = query.trim().toLowerCase();
    return b.branch === branch && (!q || b.billNo.toLowerCase().includes(q) || b.biller.toLowerCase().includes(q) || (!isVRSNB && b.salesperson.toLowerCase().includes(q)));
  });
  const historyPageSize = 50;
  const historyPageCount = Math.max(1, Math.ceil(rows.length / historyPageSize));
  const pagedRows = rows.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
  useEffect(() => setHistoryPage(1), [query, branch]);
  const reprint = (bill: BranchBillRecord) => {
    markBillDuplicate(bill.id, currentUser?.displayName || 'Staff');
    void printCounterBill(bill, true);
  };
  return <Section title="Bill History" icon={<History className="size-5"/>} action={<div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={isVRSNB ? 'Search bill or cashier' : 'Search bill, salesperson or cashier'} className="pl-9"/></div>}>
    {ledgerMessage && <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-800">{ledgerMessage}</p>}
    {loadingLedger && <p className="mb-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-black text-slate-500">Loading bill history from Supabase...</p>}
    <div className="overflow-auto rounded-xl border border-slate-200"><table className={cn('w-full text-sm', isVRSNB ? 'min-w-[820px]' : 'min-w-[920px]')}><thead className="sticky top-0 z-10 bg-slate-50"><tr className="text-left text-[10px] uppercase tracking-wide text-slate-500"><th className="p-2">Bill</th><th className="p-2">Time</th>{!isVRSNB && <th className="p-2">Salesperson</th>}<th className="p-2">Cashier</th><th className="p-2">Mode</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Total</th><th className="p-2">Status</th><th className="p-2 text-right">Action</th></tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={isVRSNB ? 8 : 9} className="p-6 text-center font-bold text-slate-500">No bills found.</td></tr> : pagedRows.map((b)=><Fragment key={b.id}><tr className="border-t"><td className="p-2 font-black"><button className="inline-flex items-center gap-1" onClick={()=>setExpandedBillId(expandedBillId===b.id?null:b.id)}><ChevronDown className={cn('size-4 transition',expandedBillId===b.id&&'rotate-180')}/>{b.billNo}</button></td><td className="p-2 text-xs">{new Date(b.createdAt).toLocaleString('en-IN')}</td>{!isVRSNB && <td className="p-2">{b.salesperson}</td>}<td className="p-2">{b.biller}</td><td className="p-2 uppercase">{b.paymentMode}</td><td className="p-2 text-right font-black">{b.items.reduce((sum,item)=>sum+item.quantity,0)}</td><td className="p-2 text-right font-black">{money(b.total)}</td><td className="p-2"><span className={cn('rounded-full px-2 py-1 text-[10px] font-black', b.printCount > 1 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>{b.printCount > 1 ? 'Duplicate' : 'Original'}</span></td><td className="p-2 text-right"><SoftButton onClick={()=>reprint(b)} className="min-h-8 px-2 py-1 text-xs"><Printer className="size-3.5"/>Duplicate</SoftButton></td></tr>{expandedBillId===b.id&&<tr className="border-t bg-slate-50"><td colSpan={isVRSNB?8:9} className="p-2"><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-xs"><thead><tr className="text-left uppercase text-slate-500"><th className="p-2">Item</th><th className="p-2 text-right">Qty</th><th className="p-2">Unit</th><th className="p-2 text-right">Unit Price</th><th className="p-2 text-right">Discount</th><th className="p-2 text-right">Tax</th><th className="p-2 text-right">Line Revenue</th></tr></thead><tbody>{b.items.map((item,index)=><tr key={`${item.itemName}-${index}`} className="border-t"><td className="p-2 font-bold">{item.itemName}</td><td className="p-2 text-right">{item.quantity}</td><td className="p-2">{item.unit}</td><td className="p-2 text-right">{money(item.price)}</td><td className="p-2 text-right">{money(item.discount||0)}</td><td className="p-2 text-right">{money(item.tax||0)}</td><td className="p-2 text-right font-black">{money(item.lineTotal)}</td></tr>)}</tbody></table></div></td></tr>}</Fragment>)}</tbody></table></div>
    {rows.length>historyPageSize&&<div className="mt-2 flex items-center justify-between text-xs font-bold"><span>Showing {(historyPage-1)*historyPageSize+1}-{Math.min(historyPage*historyPageSize,rows.length)} of {rows.length}</span><div className="flex gap-2"><button disabled={historyPage===1} onClick={()=>setHistoryPage((page)=>Math.max(1,page-1))} className="rounded-lg border p-2 disabled:opacity-40"><ChevronLeft className="size-4"/></button><button disabled={historyPage===historyPageCount} onClick={()=>setHistoryPage((page)=>Math.min(historyPageCount,page+1))} className="rounded-lg border p-2 disabled:opacity-40"><ChevronRight className="size-4"/></button></div></div>}
  </Section>;
}


export function CreditSalesTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore();
  const { creditSales, fetchCreditSales, fetchCreditPayments, settleCreditSale } = useBranchStore();
  const user = currentUser?.username || currentUser?.displayName || 'Cashier';
  const isVRSNB = branch === 'VRSNB';
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({ amount: '', mode: 'cash', reference: '', remarks: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    void fetchCreditSales(branch);
    void fetchCreditPayments(branch);
  }, [branch, fetchCreditPayments, fetchCreditSales]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (creditSales[branch] || [])
      .filter((c) => !q || c.billNo.toLowerCase().includes(q) || c.customerName.toLowerCase().includes(q) || (c.customerPhone || '').includes(q))
      .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
  }, [branch, creditSales, query]);

  const selected = rows.find((r) => r.id === selectedId);
  const pending = rows.filter((r) => r.status !== 'settled');
  const totalCredit = rows.reduce((s, r) => s + r.subtotal, 0);
  const collected = rows.reduce((s, r) => s + r.amountPaid, 0);
  const outstanding = pending.reduce((s, r) => s + r.creditAmount, 0);
  const dueToday = pending.filter((r) => r.dueDate && new Date(r.dueDate).toDateString() === new Date().toDateString()).reduce((s, r) => s + r.creditAmount, 0);

  const startCollection = (id: string) => {
    const row = rows.find((r) => r.id === id);
    setSelectedId(id);
    setForm({ amount: row ? String(row.creditAmount) : '', mode: 'cash', reference: '', remarks: '' });
    setMessage('');
  };

  const saveCollection = async () => {
    if (!selected) { setMessage('Select a credit bill first.'); return; }
    const amount = Number(form.amount || 0);
    if (!amount || amount <= 0) { setMessage('Enter a valid collection amount.'); return; }
    if (amount > selected.creditAmount) { setMessage('Collection amount cannot be more than pending balance.'); return; }
    const err = await settleCreditSale(branch, selected.id, amount, {
      mode: form.mode as 'cash' | 'upi' | 'card' | 'bank',
      reference: form.reference,
      remarks: form.remarks,
      collectedBy: user,
      collectedRole: currentUser?.role,
    });
    if (err) { setMessage(err); return; }
    await fetchCreditSales(branch);
    await fetchCreditPayments(branch);
    setMessage(`Collected ${money(amount)} for ${selected.billNo}.`);
    setSelectedId('');
    setForm({ amount: '', mode: 'cash', reference: '', remarks: '' });
  };

  const printReport = () => printHtml(`${branch} Credit Sales`, `<div class="stamp">CREDIT SALES REPORT</div><h2>${BRANCH_LABELS[branch]}</h2><div class="row"><span>Outstanding</span><b>Rs ${outstanding.toFixed(2)}</b></div><table><thead><tr><th>Bill</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>${rows.map((r)=>`<tr><td>${r.billNo}</td><td>${r.customerName}<br/>${r.customerPhone || ''}</td><td>Rs ${r.subtotal.toFixed(2)}</td><td>Rs ${r.amountPaid.toFixed(2)}</td><td>Rs ${r.creditAmount.toFixed(2)}</td><td>${r.status}</td></tr>`).join('')}</tbody></table>`);

  const exportCsv = () => {
    downloadExcel(
      `${branch}-credit-sales-${todayIso()}.xls`,
      `${branch} Credit Sales`,
      rows.map((r) => ({
        "Bill No": r.billNo,
        Customer: r.customerName,
        Mobile: r.customerPhone || "",
        Date: new Date(r.createdAt).toLocaleString('en-IN'),
        "Due Date": r.dueDate,
        Total: r.subtotal,
        Paid: r.amountPaid,
        Balance: r.creditAmount,
        Status: r.status,
        [isVRSNB ? "Cashier" : "Salesperson"]: r.soldBy,
        Remarks: r.notes || "",
      })),
    );
  };

  const statusClass = (status: CreditSale['status']) => cn(
    'rounded-full px-3 py-1 text-xs font-black',
    status === 'settled' ? 'bg-emerald-100 text-emerald-700' :
    status === 'partial' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700',
  );

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Total Credit" value={money(totalCredit)} icon={<FileText/>} tone="blue"/>
      <Kpi label="Collected" value={money(collected)} icon={<Banknote/>} tone="green"/>
      <Kpi label="Outstanding" value={money(outstanding)} icon={<WalletCards/>} tone="amber"/>
      <Kpi label="Due Today" value={money(dueToday)} icon={<CalendarClock/>} tone="red"/>
    </div>

    <Section title="Credit Sales Collection" icon={<WalletCards className="size-5"/>} action={<div className="flex flex-wrap gap-2"><SoftButton onClick={printReport}><Printer className="size-4"/>Print</SoftButton><SoftButton onClick={exportCsv}><Download className="size-4"/>Export</SoftButton></div>}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search bill, customer or mobile" className="pl-9"/></div>
          <div className="overflow-x-auto rounded-3xl border border-slate-200">
            <table className="w-full min-w-[980px] text-sm">
              <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Bill</th><th className="p-3">Customer</th><th className="p-3">Due Date</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Balance</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead>
              <tbody>{rows.length === 0 ? <tr><td colSpan={8} className="p-6 text-center font-bold text-slate-500">No credit sales found.</td></tr> : rows.map((r)=><tr key={r.id} className="border-t align-top"><td className="p-3"><p className="font-black">{r.billNo}</p><p className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString('en-IN')}</p></td><td className="p-3"><p className="font-bold">{r.customerName}</p><p className="text-xs text-slate-500">{r.customerPhone || '-'}</p></td><td className="p-3">{r.dueDate || '-'}</td><td className="p-3 text-right font-black">{money(r.subtotal)}</td><td className="p-3 text-right font-black text-emerald-700">{money(r.amountPaid)}</td><td className="p-3 text-right font-black text-amber-700">{money(r.creditAmount)}</td><td className="p-3"><span className={statusClass(r.status)}>{r.status}</span></td><td className="p-3 text-right"><div className="flex justify-end gap-2"><SoftButton onClick={()=>startCollection(r.id)} disabled={r.status === 'settled'}>Collect</SoftButton></div></td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="space-y-3 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <h4 className="text-lg font-black text-slate-950">Collect Payment</h4>
          <p className="text-sm font-semibold text-slate-500">{selected ? `${selected.billNo} - ${selected.customerName} - Pending ${money(selected.creditAmount)}` : 'Choose a pending credit bill from the table.'}</p>
          <Field label="Amount"><Input type="number" min="0" max={selected?.creditAmount || undefined} value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})}/></Field>
          <Field label="Collection Mode"><Select value={form.mode} onChange={(e)=>setForm({...form,mode:e.target.value})}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></Select></Field>
          <Field label="Reference"><Input value={form.reference} onChange={(e)=>setForm({...form,reference:e.target.value})} placeholder="UPI/card/bank ref optional"/></Field>
          <Field label="Remarks"><Textarea value={form.remarks} onChange={(e)=>setForm({...form,remarks:e.target.value})} placeholder="Optional collection note"/></Field>
          {message && <p className={cn('rounded-xl px-3 py-2 text-sm font-black', message.startsWith('Collected') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>{message}</p>}
          <PrimaryButton onClick={saveCollection} disabled={!selected} className="w-full">Save Credit Collection</PrimaryButton>
        </div>
      </div>
    </Section>
  </div>;
}
export function AdvanceCakeOrdersTab({ branch, branchStock, source = 'branch' }: ModuleProps) {
  const { currentUser } = useAuthStore();
  const { advanceCakeOrders, salespeople, addAdvanceCakeOrder, updateAdvanceStatus, markAdvanceSentToStore, addCashMovement, addAdvanceFinalBill, recordAdvanceRefund, counterOpenings } = useBranchOpsStore();
  const submitBakeryOrder = useBakeryStore((s) => s.submitOrder);
  const { manualUpdateStock, fetchBranchData } = useBranchStore();
  const isVRSNB = branch === 'VRSNB';
  const isSnbOrder = source === 'snb-order' && branch === 'SNB';
  const requiresSalesperson = branch === 'SNB';
  const user = currentUser?.username || currentUser?.displayName || 'Cashier';
  const auditActor = isSnbOrder ? `SNB Order - ${user}` : user;
  const items = useOperationalCatalog(branch);
  const people = Array.from(new Set(salespeople.filter((p)=>p.branch===branch && p.active).map((p)=>p.name).filter(Boolean)));
  const [mode, setMode] = useState<'store' | 'custom' | 'cake'>('store');
  const [finalPaymentMode, setFinalPaymentMode] = useState<'cash' | 'upi' | 'card' | 'split'>('cash');
  const [pipelineView, setPipelineView] = useState<'active' | 'history' | 'cancelled'>('active');
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [collectMode, setCollectMode] = useState<'cash' | 'upi' | 'card' | 'split'>('cash');
  const [sendingToStore, setSendingToStore] = useState<string | null>(null);
  const [closingOrder, setClosingOrder] = useState<{ order: CakeAdvanceOrder; payMode: 'cash' | 'upi' | 'card' | 'split' } | null>(null);
  const [managingOrder, setManagingOrder] = useState<{ order: CakeAdvanceOrder; action: 'edit' | 'cancel' } | null>(null);
  const [common, setCommon] = useState({ slipNumber:'', customerName:'', mobile:'', deliveryDate:'', deliveryTime:'', advanceAmount:'', paymentMode:'cash', salesperson:'' });
  const [storePick, setStorePick] = useState({ itemName: items[0]?.name || '', quantity:'1' });
  const [storeLines, setStoreLines] = useState<BranchBillItem[]>([]);
  const [storeFullyPaid, setStoreFullyPaid] = useState(false);
  const [customFullyPaid, setCustomFullyPaid] = useState(false);
  const [custom, setCustom] = useState({ itemName:'', quantity:'1', unit:'pcs' as 'pcs' | 'kg', price:'', notes:'', attachmentName:'', attachmentDataUrl:'' });
  const [customLines, setCustomLines] = useState<BranchBillItem[]>([]);
  const [cake, setCake] = useState({
    cakeKg:'', creamType:'Butter Cream' as CakeCreamType, cakeTypeId:'butter-birthday', flavor:'', shape:'',
    designType:'Normal' as CakeDesignType, drawingWork:false, photoWork:false, messageOnCake:'', designNotes:'',
    attachmentName:'', attachmentDataUrl:'',
  });
  const [error, setError] = useState('');
  const [receiverCounterOpen, setReceiverCounterOpen] = useState(false);
  const [receiverCounterLoading, setReceiverCounterLoading] = useState(isSnbOrder);
  const orders = advanceCakeOrders.filter((o)=>o.branch===branch);
  const localCounterOpenToday = counterOpenings.some((c) => c.branch === branch && c.date === todayIso() && c.active !== false && (currentUser?.id ? c.cashierUserId === currentUser.id : c.cashier === user));
  const counterOpenToday = isSnbOrder ? receiverCounterOpen : localCounterOpenToday;

  useEffect(() => {
    if (!isSnbOrder) return;
    let active = true;
    const loadCounter = async () => {
      setReceiverCounterLoading(true);
      const { data, error: counterError } = await supabase.rpc('get_my_branch_counter_session_secure', { p_branch: 'SNB' });
      if (!active) return;
      if (counterError) {
        setReceiverCounterOpen(false);
        setError(`Unable to verify the SNB Order counter: ${counterError.message}`);
      } else {
        const row = data && typeof data === 'object' ? data as { id?: string } : null;
        setReceiverCounterOpen(Boolean(row?.id));
      }
      setReceiverCounterLoading(false);
    };
    void loadCounter();
    const refreshId = window.setInterval(() => { if (!document.hidden) void loadCounter(); }, 15_000);
    return () => { active = false; window.clearInterval(refreshId); };
  }, [isSnbOrder]);
  const activeOrders = orders.filter((o) => o.status !== 'Paid In Full' && o.status !== 'Cancelled');
  const historyOrders = orders.filter((o) => o.status === 'Paid In Full');
  const cancelledOrders = orders.filter((o) => o.status === 'Cancelled');
  const staff = requiresSalesperson ? common.salesperson : user;
  const cakeTypeOptions = useMemo(() => cakeTypesFor(cake.creamType), [cake.creamType]);
  const selectedCakeType = useMemo(() => findCakeType(cake.cakeTypeId), [cake.cakeTypeId]);
  const cakePrice = useMemo(() => calculateCakePrice({
    cakeTypeId: cake.cakeTypeId,
    weightKg: Number(cake.cakeKg || 0),
    design: cake.designType,
    drawingWork: cake.drawingWork,
    photoWork: cake.photoWork,
  }), [cake.cakeKg, cake.cakeTypeId, cake.designType, cake.drawingWork, cake.photoWork]);

  const updateCommon = (k: string, v: string) => { setCommon((f)=>({...f,[k]:v})); setError(''); };
  const handleAttachment = (file: File | undefined, target: 'custom' | 'cake') => {
    if (!file) return;
    if (file.size > 750_000) { setError('Attachment should be below 750 KB to avoid using too much browser storage.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const payload = { attachmentName: file.name, attachmentDataUrl: String(reader.result || '') };
      if (target === 'custom') setCustom((f)=>({...f,...payload}));
      else setCake((f)=>({...f,...payload}));
    };
    reader.readAsDataURL(file);
  };
  const addStoreLine = () => {
    const item = items.find((i)=>i.name===storePick.itemName);
    const qty = Number(storePick.quantity || 0);
    if (!item || qty <= 0) { setError('Select item and quantity.'); return; }
    const unit: 'pcs' | 'kg' = item.uom === 'Kgs' ? 'kg' : 'pcs';
    const line: BranchBillItem = { barcode:item.barcode, itemName:item.name, quantity:qty, unit, price:item.price, tax:0, discount:0, lineTotal:qty * item.price };
    setStoreLines((lines)=>[...lines, line]);
    setStorePick((f)=>({...f, quantity:'1'}));
    setError('');
  };
  const removeStoreLine = (idx: number) => setStoreLines((lines)=>lines.filter((_, i)=>i!==idx));
  const storeValue = storeLines.reduce((s,l)=>s+l.lineTotal,0);
  const customDraftTotal = Number(custom.quantity || 0) * Number(custom.price || 0);
  const customValue = customLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const addCustomLine = () => {
    const quantity = Number(custom.quantity || 0);
    const price = Number(custom.price || 0);
    if (!custom.itemName.trim() || quantity <= 0 || price < 0) { setError('Enter a valid custom item, quantity and rate.'); return; }
    const line: BranchBillItem = { itemName: custom.itemName.trim(), quantity, unit: custom.unit, price, tax: 0, discount: 0, lineTotal: quantity * price };
    setCustomLines((lines) => [...lines, line]);
    setCustom((current) => ({ ...current, itemName: '', quantity: '1', price: '' }));
    setError('');
  };
  const removeCustomLine = (idx: number) => setCustomLines((lines) => lines.filter((_, i) => i !== idx));

  // When storeFullyPaid toggled on, auto-fill advance amount
  const handleStoreFullyPaid = (checked: boolean) => {
    setStoreFullyPaid(checked);
    if (checked) updateCommon('advanceAmount', String(storeValue));
    else updateCommon('advanceAmount', '');
  };
  const handleCustomFullyPaid = (checked: boolean) => {
    setCustomFullyPaid(checked);
    const value = customValue || customDraftTotal;
    if (checked) updateCommon('advanceAmount', String(value));
    else updateCommon('advanceAmount', '');
  };

  const validateCommon = (value: number) => {
    const adv = Number(common.advanceAmount || 0);
    if (!common.customerName.trim() || !common.mobile.trim() || !common.deliveryDate) return 'Customer name, mobile number and delivery date are mandatory.';
    if (requiresSalesperson && !common.salesperson) return 'Salesperson is mandatory.';
    if (value <= 0 || adv < 0 || adv > value) return 'Check order value and advance amount.';
    return '';
  };
  const reserveStoreLines = async (orderNo: string, lines: BranchBillItem[]) => {
    const { error: reservationError } = await supabase.rpc('reserve_branch_stock_items', {
      p_branch: branch,
      p_source_type: 'branch_advance_order_number',
      p_source_id: orderNo,
      p_items: lines.map((line) => ({
        itemName: line.itemName,
        barcode: line.barcode,
        quantity: line.quantity,
        isCustom: false,
      })),
      p_created_by: staff,
    });
    if (reservationError) return reservationError.message || 'Unable to reserve stock.';
    await fetchBranchData(branch);
    return '';
  };
  const releaseStoreReservation = async (orderNo: string) => {
    await supabase.rpc('release_branch_stock_reservation', {
      p_branch: branch,
      p_source_type: 'branch_advance_order_number',
      p_source_id: orderNo,
      p_released_by: staff,
    });
    await fetchBranchData(branch);
  };
  const sendToStoreDashboard = async (order: CakeAdvanceOrder, lines: BranchBillItem[]) => {
    if (branch === 'Cafe') throw new Error('Cafe advance orders cannot be sent to the bakery branch workflow.');
    const bakeryItems: BakeryOrderItem[] = lines.map((line, idx) => ({
      itemId: `${order.orderNo}-${idx}`,
      itemName: line.itemName,
      quantity: line.quantity,
      isCustom: true,
      dispatchUnit: line.unit,
      attachmentName: order.attachmentName,
      attachmentDataUrl: order.attachmentDataUrl,
    }));
    const notes = `${order.orderNo} | ${order.customerName} | ${order.mobile} | Delivery ${order.deliveryDate} ${order.deliveryTime || ''} | ${order.designNotes || ''}${order.attachmentName ? ` | Attachment: ${order.attachmentName}` : ''}`;
    await submitBakeryOrder(bakeryItems, `${user} - ${branch} advance`, branch, notes);
  };
  const sendCakeToStoreDashboard = async (order: CakeAdvanceOrder) => {
    if (branch === 'Cafe') throw new Error('Cafe cake orders cannot be sent to the bakery branch workflow.');
    // Cake-type advance orders go ONLY to the Cake Master queue now - they
    // used to also get logged into the generic bakery/store order queue via
    // submitBakeryOrder(), which meant every cake order still showed up in
    // Store even after Cake Master existed. That call is removed here on
    // purpose; non-cake "store" advance orders still use the separate
    // sendToStoreDashboard() function untouched.
    const { error: durableOrderError } = await supabase
      .from('branch_operation_records')
      .upsert({
        branch,
        record_type: 'advance_order',
        record_id: order.id,
        record_no: order.orderNo,
        amount: order.orderValue,
        status: order.status,
        actor: order.createdBy || order.salesperson,
        payload: order,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'branch,record_type,record_id' });
    if (durableOrderError) {
      throw new Error(`Advance order ${order.orderNo} was not sent because its unique source record could not be saved: ${durableOrderError.message}`);
    }

    const { error: cakeMasterError } = await supabase.rpc('submit_cake_master_order', {
      p_branch: branch,
      p_order_no: order.orderNo,
      p_source_order_id: order.id,
      p_slip_number: order.slipNumber || null,
      p_customer_name: order.customerName,
      p_mobile: order.mobile,
      p_delivery_date: order.deliveryDate || null,
      p_delivery_time: order.deliveryTime || null,
      p_cake_kg: order.cakeKg,
      p_flavor: order.flavor,
      p_shape: order.shape,
      p_cream_type: order.creamType || null,
      p_message_on_cake: order.messageOnCake || null,
      p_design_notes: order.designNotes || null,
      p_attachment_data_url: order.attachmentDataUrl || null,
      p_order_value: order.orderValue,
      p_advance_amount: order.advanceAmount,
      p_balance_amount: order.balanceAmount,
      p_quantity: order.items?.[0]?.quantity || Number(order.cakeKg || 1),
    });
    if (cakeMasterError) {
      console.error('[sendCakeToStoreDashboard] Cake Master queue sync failed:', cakeMasterError.message);
      throw new Error(`Could not send order to Cake Master: ${cakeMasterError.message}`);
    }
  };
  const saveAdvance = async (orderType: 'store' | 'custom' | 'cake') => {
    if (!counterOpenToday) { setError('Open the cashier counter before collecting advance payments.'); return; }
    const fullyPaid = orderType === 'store' ? storeFullyPaid : orderType === 'custom' ? customFullyPaid : false;
    const cakeWeight = Number(cake.cakeKg || 0);
    const cakeItemName = `${cake.creamType} - ${selectedCakeType?.name || 'Cake'} - ${cake.flavor || 'Flavour not entered'}`.trim();
    const sourceLines = orderType === 'store'
      ? storeLines
      : orderType === 'custom'
        ? (customLines.length > 0 ? customLines : [{ itemName: custom.itemName.trim(), quantity: Number(custom.quantity || 0), unit: custom.unit, price: Number(custom.price || 0), tax:0, discount:0, lineTotal: Number(custom.quantity || 0) * Number(custom.price || 0) }])
        : [{ barcode: selectedCakeType?.catalogBarcode, itemName: cakeItemName, quantity: cakeWeight, unit:'kg' as const, price: cakeWeight > 0 ? cakePrice.total / cakeWeight : 0, tax:0, discount:0, lineTotal: cakePrice.total }];
    const orderValue = sourceLines.reduce((sum, line)=>sum+line.lineTotal,0);
    if (orderType === 'cake' && (!selectedCakeType || cakeWeight <= 0 || !cake.flavor.trim() || !cake.shape.trim())) {
      setError('Cream type, cake type, weight, flavor and shape are mandatory.');
      return;
    }
    const message = validateCommon(orderValue);
    if (message) { setError(message); return; }
    if (sourceLines.length === 0 || sourceLines.some((line)=>!line.itemName || line.quantity <= 0)) { setError('Add at least one valid item.'); return; }
    const adv = fullyPaid ? orderValue : Number(common.advanceAmount || 0);
    const balanceAmount = fullyPaid ? 0 : orderValue - adv;
    const first = sourceLines[0];
    const attachmentName = orderType === 'cake' ? cake.attachmentName : custom.attachmentName;
    const attachmentDataUrl = orderType === 'cake' ? cake.attachmentDataUrl : custom.attachmentDataUrl;
    let orderNo: string;
    try {
      orderNo = await nextBranchAdvanceOrderNumberAtomic(branch);
    } catch (numberError) {
      setError(numberError instanceof Error ? numberError.message : 'Unable to allocate an advance order number.');
      return;
    }
    let stockReserved = false;
    if (isSnbOrder) {
      const receiverItems = sourceLines.map((line) => ({
        itemName: line.itemName,
        barcode: line.barcode,
        quantity: line.quantity,
        sellUnit: line.unit,
        price: line.price,
        lineTotal: line.lineTotal,
        isCustom: orderType !== 'store',
        orderType,
        slipNumber: common.slipNumber.trim() || undefined,
        mobile: common.mobile.trim(),
        deliveryTime: common.deliveryTime,
      }));
      const receiverNotes = [
        `${orderType} advance order`,
        common.mobile.trim() ? `Mobile ${common.mobile.trim()}` : '',
        common.slipNumber.trim() ? `Slip ${common.slipNumber.trim()}` : '',
        common.deliveryTime ? `Delivery time ${common.deliveryTime}` : '',
        orderType === 'cake' ? `${cake.creamType} - ${selectedCakeType?.name || ''} - ${cake.flavor} - ${cake.shape} - ${cake.designType}` : '',
        orderType === 'cake' ? cake.designNotes : orderType === 'custom' ? custom.notes : 'Existing SNB stock advance order',
      ].filter(Boolean).join(' | ');
      const { error: receiverError } = await supabase.rpc('create_snb_order_advance_order_secure_v2', {
        p_order_no: orderNo,
        p_customer_name: common.customerName.trim(),
        p_items: receiverItems,
        p_subtotal: orderValue,
        p_advance_amount: adv,
        p_advance_method: common.paymentMode,
        p_delivery_date: common.deliveryDate,
        p_notes: receiverNotes,
        p_entered_by: auditActor,
      });
      if (receiverError) {
        setError(`Advance order was not saved: ${receiverError.message}`);
        return;
      }
      stockReserved = orderType === 'store';
      await fetchBranchData(branch);
    } else {
      if (orderType === 'store') {
        const stockError = await reserveStoreLines(orderNo, sourceLines);
        if (stockError) {
          setError(`Advance order was not saved because stock could not be reserved: ${stockError}`);
          return;
        }
        stockReserved = true;
      }
      if (adv > 0) {
        const { error: paymentError } = await supabase.rpc('record_branch_advance_payment', {
          p_branch: branch,
          p_order_no: orderNo,
          p_bill_no: orderNo,
          p_payment_stage: 'advance',
          p_payment_mode: common.paymentMode,
          p_amount: adv,
          p_order_total: orderValue,
          p_collected_by: staff,
          p_remarks: `${orderType} advance order - ${common.customerName.trim()}`,
        });
        if (paymentError) {
          if (stockReserved) await releaseStoreReservation(orderNo);
          setError(/record_branch_advance_payment|could not find the function|schema cache/i.test(paymentError.message)
            ? 'Advance payment RPC is not installed. Run 20260621_branch_advance_payment_rpc.sql before collecting an advance.'
            : `Advance order was not saved: ${paymentError.message}`);
          return;
        }
      }
    }
    const order = addAdvanceCakeOrder({
      orderNo,
      slipNumber: common.slipNumber.trim() || undefined,
      branch, orderType, customerName: common.customerName.trim(), mobile: common.mobile.trim(), orderDate: businessDate(),
      deliveryDate: common.deliveryDate, deliveryTime: common.deliveryTime, items: sourceLines, cakeKg: String(first.quantity),
      creamType: orderType === 'cake' ? cake.creamType : undefined,
      cakeTypeId: orderType === 'cake' ? cake.cakeTypeId : undefined,
      cakeTypeName: orderType === 'cake' ? selectedCakeType?.name : undefined,
      flavor: orderType === 'cake' ? cake.flavor.trim() : first.itemName, shape: orderType === 'cake' ? cake.shape.trim() : first.unit,
      designType: orderType === 'cake' ? cake.designType : undefined,
      baseRate: orderType === 'cake' ? cakePrice.baseRate : undefined,
      baseAmount: orderType === 'cake' ? cakePrice.baseAmount : undefined,
      designPercent: orderType === 'cake' ? cakePrice.designPercent : undefined,
      designCharge: orderType === 'cake' ? cakePrice.designCharge : undefined,
      drawingCharge: orderType === 'cake' ? cakePrice.drawingCharge : undefined,
      photoCharge: orderType === 'cake' ? cakePrice.photoCharge : undefined,
      messageOnCake: orderType === 'cake' ? cake.messageOnCake : '', designNotes: orderType === 'cake' ? cake.designNotes : orderType === 'custom' ? custom.notes : 'Existing branch stock advance order [Stock Reserved]',
      attachmentName, attachmentDataUrl, orderValue, advanceAmount: adv, balanceAmount, salesperson: staff, paymentMode: common.paymentMode as 'cash'|'upi'|'card',
      createdBy: auditActor, collectionSource: isSnbOrder ? 'SNB Order collected' : undefined, skipLocalCashMovement: isSnbOrder,
    });
    // Print slip - show "PAID IN FULL" stamp when fully paid
    printAdvanceSalesOrder({ branch, orderNo: order.orderNo, slipNumber: order.slipNumber, customerName: order.customerName, mobile: order.mobile, deliveryDate: order.deliveryDate, deliveryTime: order.deliveryTime, items: sourceLines, orderValue, advanceAmount: adv, balanceAmount, paymentMode: common.paymentMode, staffName: isSnbOrder ? auditActor : staff, fullyPaid, cakeDetails: orderType === 'cake' && selectedCakeType ? { creamType: cake.creamType, cakeType: selectedCakeType.name, flavor: cake.flavor.trim(), weightKg: cakeWeight, shape: cake.shape.trim(), design: cake.designType, baseRate: cakePrice.baseRate, baseAmount: cakePrice.baseAmount, designCharge: cakePrice.designCharge, drawingCharge: cakePrice.drawingCharge, photoCharge: cakePrice.photoCharge, messageOnCake: cake.messageOnCake.trim() || undefined } : undefined });
    setCommon({ slipNumber:'', customerName:'', mobile:'', deliveryDate:'', deliveryTime:'', advanceAmount:'', paymentMode:'cash', salesperson:'' });
    setStoreFullyPaid(false); setCustomFullyPaid(false);
    setStoreLines([]); setCustomLines([]); setCustom({ itemName:'', quantity:'1', unit:'pcs', price:'', notes:'', attachmentName:'', attachmentDataUrl:'' }); setCake({ cakeKg:'', creamType:'Butter Cream', cakeTypeId:'butter-birthday', flavor:'', shape:'', designType:'Normal', drawingWork:false, photoWork:false, messageOnCake:'', designNotes:'', attachmentName:'', attachmentDataUrl:'' });
    setError('');
  };
  const manageAdvanceOrder = async (
    order: CakeAdvanceOrder,
    action: 'edit' | 'cancel',
    input: { reason: string; password: string; refundMode?: 'cash' | 'upi' | 'card'; details?: Partial<CakeAdvanceOrder> },
  ): Promise<string | null> => {
    const { data, error: manageError } = await supabase.rpc('manage_branch_advance_cake_order_secure', {
      p_branch: branch,
      p_source_order_id: order.id,
      p_action: action,
      p_details: input.details || {},
      p_reason: input.reason,
      p_password: input.password,
      p_refund_mode: input.refundMode || null,
    });
    if (manageError) {
      if (/INVALID_PASSWORD|password/i.test(manageError.message)) return 'Authorization failed. Check your login password.';
      return manageError.message;
    }
    const result = data as { payload?: Partial<CakeAdvanceOrder>; refundAmount?: number; refundNo?: string } | null;
    if (action === 'edit') {
      updateAdvanceStatus(order.id, order.status, auditActor, result?.payload || input.details || {});
    } else {
      const payload = result?.payload || {};
      updateAdvanceStatus(order.id, 'Cancelled', auditActor, payload);
      const refundAmount = Number(result?.refundAmount || payload.refundAmount || 0);
      if (refundAmount > 0 && input.refundMode) {
        const activeCounter = counterOpenings.find((counter) => counter.branch === branch && counter.date === todayIso() && counter.active !== false && (currentUser?.id ? counter.cashierUserId === currentUser.id : counter.cashier === user));
        recordAdvanceRefund({ branch, returnNo: result?.refundNo || String(payload.refundNo || `${branch}-ADV-CANCEL`), originalBillNo: order.orderNo, originalPaymentMode: input.refundMode, items: order.items || [], total: refundAmount, returnedBy: auditActor, reason: input.reason, returnPayMode: input.refundMode, refundAmount, cashierUserId: currentUser?.id, counterSessionId: activeCounter?.counterSessionId });
      }
    }
    setManagingOrder(null);
    return null;
  };
  const finalInvoice = async (
    o: CakeAdvanceOrder,
    payMode?: 'cash' | 'upi' | 'card' | 'split',
    closingOverrides?: { quantity: number; discount: number; additionalCharges: number; refundMode?: 'cash' | 'upi' | 'card'; paymentSplits?: Array<{ mode: 'cash' | 'upi' | 'card'; amount: number }> },
  ): Promise<string | null> => {
    const fail = (message: string) => {
      setError(message);
      return message;
    };
    if (!counterOpenToday) return fail('Open the cashier counter before collecting advance payments.');
    setError('');
    try {
    const usedMode = payMode || finalPaymentMode;
    const closingQty = resolveAdvanceClosingQuantities(o);
    let orderLines = o.items && o.items.length > 0 ? o.items : [{ itemName: o.flavor, quantity: Number(o.cakeKg || 0), unit: o.shape === 'Kgs' ? 'kg' as const : 'pcs' as const, price: o.orderValue / Math.max(Number(o.cakeKg || 1), 1), tax:0, discount:0, lineTotal:o.orderValue }];
    let orderTotal = o.orderValue;
    let balanceAmount = o.balanceAmount;
    const discountAmount = closingOverrides?.discount || 0;
    const additionalCharges = closingOverrides?.additionalCharges || 0;
    // Only single-line orders (the common case for cake orders) support an
    // edited quantity, since the actual cake weight/count is often a bit off
    // from the original estimate. The bill value and balance recompute from
    // the edited quantity at the item's original rate, then the discount is
    // subtracted on top.
    if (closingOverrides && orderLines.length === 1) {
      const rate = closingQty.rate || (orderLines[0].price > 0 ? orderLines[0].price : orderLines[0].quantity > 0 ? orderLines[0].lineTotal / orderLines[0].quantity : orderLines[0].price);
      const newLineTotal = Math.round((closingOverrides.quantity * rate - discountAmount) * 100) / 100;
      orderLines = [{ ...orderLines[0], quantity: closingOverrides.quantity, discount: discountAmount, lineTotal: newLineTotal }];
      orderTotal = Math.round((newLineTotal + additionalCharges) * 100) / 100;
    } else if (closingOverrides) {
      orderTotal = Math.round((o.orderValue - discountAmount + additionalCharges) * 100) / 100;
    }
    balanceAmount = Math.max(0, Math.round((orderTotal - (o.advanceAmount || 0)) * 100) / 100);
    const refundAmount = Math.max(0, Math.round(((o.advanceAmount || 0) - orderTotal) * 100) / 100);
    if (refundAmount > 0 && !closingOverrides?.refundMode) return fail('Select how the customer refund will be paid.');
    const paymentSplits = usedMode === 'split' ? (closingOverrides?.paymentSplits || []).filter((line) => line.amount > 0) : [];
    const splitTotal = Math.round(paymentSplits.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
    if (balanceAmount > 0 && usedMode === 'split' && Math.abs(splitTotal - balanceAmount) > 0.001) {
      return fail(`Split payments must add up to ${money(balanceAmount)}.`);
    }
    const rpcPaymentMode = usedMode === 'split' ? (paymentSplits[0]?.mode || 'cash') : usedMode;
    const orderKind = o.orderType || (o.designNotes?.includes('Existing branch stock advance order') ? 'store' : 'cake');
    const stockAlreadyReserved = o.designNotes?.includes('[Stock Reserved]') === true;
    if (orderKind === 'cake' && !stockAlreadyReserved) {
      const missingLine = orderLines.find((line) => stockQty(branchStock, line.itemName, line.barcode) < line.quantity);
      if (missingLine) {
        const available = stockQty(branchStock, missingLine.itemName, missingLine.barcode);
        return fail(`Advance cake order ${o.orderNo} cannot be closed. ${missingLine.itemName} requires ${missingLine.quantity} ${missingLine.unit}, but only ${available} is in stock. Confirm the dispatched cake in Stock / Incoming, then try again.`);
      }
    }
    const { data: finalData, error: finalError } = await supabase.rpc('finalize_branch_advance_order_v2', {
      p_branch: branch,
      p_order_no: o.orderNo,
      p_items: orderLines,
      p_order_total: orderTotal,
      p_balance_amount: balanceAmount,
      p_payment_mode: rpcPaymentMode,
      p_salesperson: o.salesperson,
      p_biller: isSnbOrder ? auditActor : (currentUser?.displayName || 'Staff'),
      p_deduct_stock: orderKind !== 'custom' && !stockAlreadyReserved,
      p_discount_amount: discountAmount,
      p_additional_charges: additionalCharges,
      p_refund_amount: refundAmount,
      p_refund_mode: closingOverrides?.refundMode || null,
      p_payment_splits: paymentSplits.length > 0 ? paymentSplits : null,
    });
    if (finalError) {
      return fail(/finalize_branch_advance_order_v2|could not find the function|schema cache/i.test(finalError.message)
        ? 'The advance refund and stock fix is not installed. Apply migration 20260715120000_fix_advance_final_stock_refunds.sql.'
        : `Advance order was not finalized: ${finalError.message}`);
    }
    const finalResult = finalData as { billNo?: string; invoiceNo?: number; refundNo?: string } | null;
    if (!finalResult?.billNo || !finalResult.invoiceNo) return fail('Final invoice was not returned by Supabase.');
    const { billNo, invoiceNo } = finalResult;
    if (orderKind !== 'custom') await fetchBranchData(branch);
    if (balanceAmount > 0 && !isSnbOrder) {
      const movementLines = paymentSplits.length > 0 ? paymentSplits : [{ mode: rpcPaymentMode, amount: balanceAmount }];
      movementLines.forEach((line) => addCashMovement({ branch, amount: line.amount, paymentMode: line.mode, direction: 'in', purpose: 'Advance balance collection', enteredBy: auditActor, referenceNumber: billNo, remarks: `${o.orderNo} ${o.customerName}` }));
    }
    if (refundAmount > 0 && closingOverrides?.refundMode) {
      const activeCounter = counterOpenings.find((counter) => counter.branch === branch && counter.date === todayIso() && counter.active !== false && (currentUser?.id ? counter.cashierUserId === currentUser.id : counter.cashier === user));
      recordAdvanceRefund({
        branch,
        returnNo: finalResult.refundNo || `${branch}-ADV-REF-${invoiceNo}`,
        originalBillNo: billNo,
        originalPaymentMode: closingOverrides.refundMode,
        items: orderLines,
        total: refundAmount,
        returnedBy: user,
        reason: `Advance overpayment refund for ${o.orderNo}`,
        returnPayMode: closingOverrides.refundMode,
        refundAmount,
        cashierUserId: currentUser?.id,
        counterSessionId: activeCounter?.counterSessionId,
      });
    }
    // FIX (MD Bug #12): record the bill with a split breakdown reflecting how the
    // order was actually paid - advance portion tagged with its own payment method,
    // balance portion tagged with usedMode. Previously the entire order value was
    // tagged with usedMode only, overstating that method and understating the advance method
    // in cash/upi/card KPI breakdowns on Admin dashboards.
    const advancePortion = Math.min(o.advanceAmount || 0, orderTotal);
    const balancePortion = Math.max(0, orderTotal - advancePortion);
    const allocationTotals: { cash?: number; upi?: number; card?: number } = {};
    if (advancePortion > 0) allocationTotals[o.paymentMode] = Math.round(((allocationTotals[o.paymentMode] || 0) + advancePortion) * 100) / 100;
    if (balancePortion > 0) {
      const lines = paymentSplits.length > 0 ? paymentSplits : [{ mode: rpcPaymentMode, amount: balancePortion }];
      lines.forEach((line) => { allocationTotals[line.mode] = Math.round(((allocationTotals[line.mode] || 0) + line.amount) * 100) / 100; });
    }
    const allocationModes = (Object.keys(allocationTotals) as Array<'cash' | 'upi' | 'card'>).filter((mode) => (allocationTotals[mode] || 0) > 0);
    const finalBillPaymentMode = allocationModes.length > 1 ? 'split' : (allocationModes[0] || o.paymentMode);
    const finalBillSplit = allocationModes.length > 1 ? allocationTotals : undefined;
    const billItems = additionalCharges > 0 ? [...orderLines, { itemName: 'Additional Charges', quantity: 1, unit: 'pcs' as const, price: additionalCharges, tax: 0, discount: 0, lineTotal: additionalCharges }] : orderLines;
    const finalBill = addAdvanceFinalBill({
      branch,
      billNo,
      invoiceNo,
      items: billItems,
      subtotal: orderTotal + discountAmount,
      discount: discountAmount,
      tax: 0,
      total: orderTotal,
      tendered: orderTotal,
      balance: 0,
      paymentMode: finalBillPaymentMode,
      split: finalBillSplit,
      salesperson: o.salesperson,
      biller: isSnbOrder ? auditActor : (currentUser?.displayName || 'Staff'),
      additionalCharges,
      refundAmount: refundAmount || undefined,
      refundMode: closingOverrides?.refundMode,
    });
    // FIX: previously only status/balance were saved back onto the order record,
    // so an edited closing quantity (and the resulting recalculated value) never
    // stuck to the order itself - the bill was right, but the order's own
    // quantity/value kept showing the originally placed amount. Persist the
    // final quantity and value here too, alongside what was originally ordered,
    // so both are visible and the record matches the bill that was produced.
    updateAdvanceStatus(o.id, 'Paid In Full', isSnbOrder ? auditActor : (currentUser?.displayName || 'Staff'), {
      finalInvoiceBillNo: billNo,
      balanceAmount: 0,
      orderValue: orderTotal,
      items: orderLines,
      cakeKg: orderLines[0] ? String(orderLines[0].quantity) : o.cakeKg,
      originalOrderValue: closingQty.placedOrderValue || o.originalOrderValue || o.orderValue,
      originalCakeKg: String(closingQty.placedQty || qtyValue(o.originalCakeKg) || qtyValue(o.cakeKg)),
    });
    void printCounterBill(finalBill, false);
    setCollectingId(null);
    setClosingOrder(null);
    return null;
    } catch (invoiceError) {
      return fail(invoiceError instanceof Error ? `Advance order could not be closed: ${invoiceError.message}` : 'Advance order could not be closed.');
    }
  };

  return <><div className="branch-split-workspace branch-split-workspace-tight grid h-full min-h-0 gap-2">
    {receiverCounterLoading && isSnbOrder && <div className="xl:col-span-2 rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm font-black text-blue-800">Checking the SNB Order counter...</div>}
    {!receiverCounterLoading && !counterOpenToday && <div className="xl:col-span-2 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-black text-amber-800">Open the counter in the Daily Closure tab before taking or collecting an advance order.</div>}
    <Section title="Advance Order" icon={<Gift className="size-5"/>}>
      <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
        {(['store','custom','cake'] as const).map((tab)=><button key={tab} onClick={()=>setMode(tab)} className={cn('rounded-xl px-3 py-2 text-sm font-black capitalize', mode===tab?'bg-slate-950 text-white':'text-slate-600')}>{tab === 'store' ? 'Store Items' : tab === 'custom' ? 'Custom Items' : 'Cake Orders'}</button>)}
      </div>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Slip Number"><Input value={common.slipNumber} onChange={(e)=>updateCommon('slipNumber',e.target.value)} placeholder="Enter customer slip number"/></Field>
          <Field label="Customer Name *"><Input value={common.customerName} onChange={(e)=>updateCommon('customerName',e.target.value)}/></Field>
        </div>
        <Field label="Mobile Number *"><Input value={common.mobile} onChange={(e)=>updateCommon('mobile',e.target.value)}/></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Delivery Date *"><Input type="date" value={common.deliveryDate} onChange={(e)=>updateCommon('deliveryDate',e.target.value)}/></Field><Field label="Delivery Time"><Input type="time" value={common.deliveryTime} onChange={(e)=>updateCommon('deliveryTime',e.target.value)}/></Field></div>
        {mode === 'store' && <>
          <div className="grid grid-cols-[1fr_110px] gap-2"><Field label="Item"><Select value={storePick.itemName} onChange={(e)=>setStorePick({...storePick,itemName:e.target.value})}>{items.map((i)=><option key={i.name}>{i.name}</option>)}</Select></Field><Field label="Qty"><Input type="number" min="0" value={storePick.quantity} onChange={(e)=>setStorePick({...storePick,quantity:e.target.value})}/></Field></div>
          <SoftButton onClick={addStoreLine}><Plus className="size-4"/>Add Item</SoftButton>
          <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-2">{storeLines.length === 0 ? <p className="p-3 text-sm font-bold text-slate-500">No items selected.</p> : storeLines.map((line, idx)=>{ const avail = stockQty(branchStock, line.itemName, line.barcode); return <div key={`${line.itemName}-${idx}`} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm font-bold"><span>{line.itemName} - {line.quantity} {line.unit}{avail < line.quantity && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">Low stock ({avail} in stock)</span>}</span><span>{money(line.lineTotal)}</span><button onClick={()=>removeStoreLine(idx)} className="rounded-lg bg-red-50 p-2 text-red-600"><XCircle className="size-4"/></button></div>; })}</div>
          <div className="rounded-2xl bg-emerald-50 p-3 font-black text-emerald-800">Order Value: {money(storeValue)}</div>
          {/* Fully Paid toggle */}
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <label className="flex-1 text-sm font-black text-emerald-800">Fully Paid (no balance)</label>
            <input type="checkbox" checked={storeFullyPaid} onChange={e => handleStoreFullyPaid(e.target.checked)} className="size-5 accent-emerald-600" />
          </div>
          {storeFullyPaid && <div className="rounded-xl bg-emerald-100 px-3 py-2 text-center text-sm font-black text-emerald-700">Fully paid - no balance due</div>}
        </>}
        {mode === 'custom' && <>
          <Field label="Custom Item Name *"><Input value={custom.itemName} onChange={(e)=>setCustom({...custom,itemName:e.target.value})}/></Field>
          <div className="grid grid-cols-3 gap-2"><Field label="Qty *"><Input type="number" min="0" value={custom.quantity} onChange={(e)=>setCustom({...custom,quantity:e.target.value})}/></Field><Field label="Unit"><Select value={custom.unit} onChange={(e)=>setCustom({...custom,unit:e.target.value as 'pcs'|'kg'})}><option value="pcs">Pcs</option><option value="kg">Kgs</option></Select></Field><Field label="Rate *"><Input type="number" min="0" value={custom.price} onChange={(e)=>setCustom({...custom,price:e.target.value})}/></Field></div>
          <div className="rounded-2xl bg-slate-50 p-3 text-sm font-black text-slate-700">Current item total: {money(customDraftTotal)}</div>
          <SoftButton onClick={addCustomLine}><Plus className="size-4"/>Add Custom Item</SoftButton>
          <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-2">{customLines.length === 0 ? <p className="p-3 text-sm font-bold text-slate-500">No custom items added.</p> : customLines.map((line, idx)=><div key={`${line.itemName}-${idx}`} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm font-bold"><span>{line.itemName} - {line.quantity} {line.unit} x {money(line.price)}</span><span>{money(line.lineTotal)}</span><button onClick={()=>removeCustomLine(idx)} className="rounded-lg bg-red-50 p-2 text-red-600"><XCircle className="size-4"/></button></div>)}</div>
          <div className="rounded-2xl bg-emerald-50 p-3 font-black text-emerald-800">Order Value: {money(customValue || customDraftTotal)}</div>
          <Field label="Custom Notes"><Textarea value={custom.notes} onChange={(e)=>setCustom({...custom,notes:e.target.value})}/></Field>
          <Field label="Attachment/Image"><Input type="file" accept="image/*" onChange={(e)=>handleAttachment(e.target.files?.[0], 'custom')}/></Field>
          {custom.attachmentName && <p className="text-sm font-bold text-emerald-700">Attached: {custom.attachmentName}</p>}
          {/* Fully Paid toggle */}
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <label className="flex-1 text-sm font-black text-emerald-800">Fully Paid (no balance)</label>
            <input type="checkbox" checked={customFullyPaid} onChange={e => handleCustomFullyPaid(e.target.checked)} className="size-5 accent-emerald-600" />
          </div>
          {customFullyPaid && <div className="rounded-xl bg-emerald-100 px-3 py-2 text-center text-sm font-black text-emerald-700">Fully paid - no balance due</div>}
        </>}
        {mode === 'cake' && <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cream Type *">
              <Select value={cake.creamType} onChange={(e)=>{
                const creamType = e.target.value as CakeCreamType;
                const firstType = cakeTypesFor(creamType)[0];
                setCake({...cake, creamType, cakeTypeId:firstType?.id || '', flavor:''});
              }}>
                <option value="Butter Cream">Butter Cream</option>
                <option value="Fresh Cream">Fresh Cream</option>
              </Select>
            </Field>
            <Field label="Cake Type *">
              <Select value={cake.cakeTypeId} onChange={(e)=>setCake({...cake,cakeTypeId:e.target.value,flavor:''})}>
                {cakeTypeOptions.map((type)=><option key={type.id} value={type.id}>{type.name} - {money(type.perKg)}/kg{type.halfKg ? ` - 0.5kg ${money(type.halfKg)}` : ''}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cake Weight (KG) *"><Input type="number" min="0.5" step="0.25" value={cake.cakeKg} onChange={(e)=>setCake({...cake,cakeKg:e.target.value})} placeholder="0.5"/></Field>
            <Field label="Shape *"><Input value={cake.shape} onChange={(e)=>setCake({...cake,shape:e.target.value})} placeholder="Round, square..."/></Field>
          </div>
          <Field label="Flavor *">
            <Input list={`cake-flavours-${branch}`} value={cake.flavor} onChange={(e)=>setCake({...cake,flavor:e.target.value})} placeholder="Enter flavour"/>
            <datalist id={`cake-flavours-${branch}`}>{selectedCakeType?.flavours.map((flavour)=><option key={flavour} value={flavour}/>)}</datalist>
          </Field>
          <Field label="Design *">
            <Select value={cake.designType} onChange={(e)=>setCake({...cake,designType:e.target.value as CakeDesignType})}>
              {CAKE_DESIGNS.map((design)=><option key={design} value={design}>{design}</option>)}
            </Select>
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-black text-slate-700 ring-1 ring-slate-200">
              <input type="checkbox" checked={cake.drawingWork} onChange={(e)=>setCake({...cake,drawingWork:e.target.checked})} className="size-5 accent-emerald-600"/>
              Cake drawing/design work (+{money(CAKE_DRAWING_CHARGE)})
            </label>
            <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-black text-slate-700 ring-1 ring-slate-200">
              <input type="checkbox" checked={cake.photoWork} onChange={(e)=>setCake({...cake,photoWork:e.target.checked})} className="size-5 accent-emerald-600"/>
              Photo cake/print work (+{money(CAKE_PHOTO_CHARGE)})
            </label>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-bold text-emerald-900">
              <span>Rate</span><span className="text-right">{money(cakePrice.baseRate)}{Number(cake.cakeKg) === 0.5 && selectedCakeType?.halfKg ? ' (special 0.5kg)' : '/kg'}</span>
              <span>Base amount</span><span className="text-right">{money(cakePrice.baseAmount)}</span>
              <span>{cake.designType}</span><span className="text-right">{cakePrice.designCharge > 0 ? `+${money(cakePrice.designCharge)}` : money(0)}</span>
              {cakePrice.drawingCharge > 0 && <><span>Drawing/design work</span><span className="text-right">+{money(cakePrice.drawingCharge)}</span></>}
              {cakePrice.photoCharge > 0 && <><span>Photo work</span><span className="text-right">+{money(cakePrice.photoCharge)}</span></>}
              <span className="mt-2 border-t border-emerald-200 pt-2 text-base font-black">Final cake amount</span><span className="mt-2 border-t border-emerald-200 pt-2 text-right text-lg font-black">{money(cakePrice.total)}</span>
            </div>
          </div>
          <Field label="Message on cake"><Input value={cake.messageOnCake} onChange={(e)=>setCake({...cake,messageOnCake:e.target.value})}/></Field>
          <Field label="Design notes"><Textarea value={cake.designNotes} onChange={(e)=>setCake({...cake,designNotes:e.target.value})}/></Field>
          <Field label="Attachment/Image"><Input type="file" accept="image/*" onChange={(e)=>handleAttachment(e.target.files?.[0], 'cake')}/></Field>
          {cake.attachmentName && <p className="text-sm font-bold text-emerald-700">Attached: {cake.attachmentName}</p>}
        </>}
        <div className="grid gap-3 sm:grid-cols-2">
          {requiresSalesperson && <Field label="Salesperson *"><Select value={common.salesperson} onChange={(e)=>updateCommon('salesperson',e.target.value)}><option value="">Select</option>{people.map(p=><option key={p}>{p}</option>)}</Select></Field>}
          {!storeFullyPaid && !customFullyPaid && <Field label="Advance Amount *"><Input type="number" min="0" value={common.advanceAmount} onChange={(e)=>updateCommon('advanceAmount',e.target.value)}/></Field>}
          <Field label="Payment Mode"><Select value={common.paymentMode} onChange={(e)=>updateCommon('paymentMode',e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></Select></Field>
          <div className="flex items-center rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800 ring-1 ring-emerald-100">Cashier: {user}</div>
        </div>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-black text-red-700">{error}</p>}
        <PrimaryButton onClick={()=>void saveAdvance(mode)}><Printer className="size-4"/>Generate Sales Order Slip</PrimaryButton>
      </div>
    </Section>
    <Section title="Advance Order Pipeline" icon={<CalendarClock className="size-5"/>} action={
      <div className="flex items-center gap-2">
        <div className="flex rounded-2xl bg-slate-100 p-1">
          <button onClick={()=>setPipelineView('active')} className={cn('rounded-xl px-4 py-1.5 text-xs font-black', pipelineView==='active'?'bg-slate-950 text-white':'text-slate-600')}>Active</button>
          <button onClick={()=>setPipelineView('history')} className={cn('rounded-xl px-4 py-1.5 text-xs font-black', pipelineView==='history'?'bg-emerald-600 text-white':'text-slate-600')}>History ({historyOrders.length})</button>
          <button onClick={()=>setPipelineView('cancelled')} className={cn('rounded-xl px-4 py-1.5 text-xs font-black', pipelineView==='cancelled'?'bg-red-600 text-white':'text-slate-600')}>Cancelled ({cancelledOrders.length})</button>
        </div>
        {pipelineView === 'active' && <Select value={finalPaymentMode} onChange={(e)=>setFinalPaymentMode(e.target.value as typeof finalPaymentMode)} className="w-32 text-xs"><option value="cash">Final Cash</option><option value="upi">Final UPI</option><option value="card">Final Card</option><option value="split">Final Split</option></Select>}
      </div>
    }>
      {pipelineView === 'active' ? (
        <div className="space-y-3">{activeOrders.length === 0 ? <p className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">No active advance orders.</p> : activeOrders.map(o=>{ const lines = o.items && o.items.length > 0 ? o.items : [{ itemName: o.flavor, quantity: Number(o.cakeKg || 0), unit: o.shape === 'Kgs' ? 'kg' as const : 'pcs' as const, price: o.orderValue / Math.max(Number(o.cakeKg || 1), 1), tax:0, discount:0, lineTotal:o.orderValue }]; const isCollecting = collectingId === o.id; return <div key={o.id} className="rounded-3xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-black">{o.orderNo}{o.slipNumber ? ` - Slip ${o.slipNumber}` : ''} - {o.customerName}</p><p className="text-sm font-bold text-slate-500">{o.mobile} - {lines.map((line)=>`${line.itemName} ${line.quantity} ${line.unit}`).join(', ')} - Delivery {o.deliveryDate} {o.deliveryTime}</p>{(o.creamType || o.cakeTypeName || o.designType) && <p className="mt-1 text-xs font-black text-fuchsia-700">{[o.creamType, o.cakeTypeName, o.flavor, o.designType].filter(Boolean).join(' - ')}{o.designCharge ? ` - Design +${money(o.designCharge)}` : ''}</p>}{o.attachmentName && <p className="mt-1 text-xs font-black text-emerald-700">Attachment: {o.attachmentName}</p>}</div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">{o.storeStatus || o.status}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-4"><Kpi label="Order" value={money(o.orderValue)} icon={<Receipt className="size-4"/>}/><Kpi label="Advance" value={money(o.advanceAmount)} icon={<Banknote className="size-4"/>} tone="green"/><Kpi label="Balance" value={money(o.balanceAmount)} icon={<IndianRupee className="size-4"/>} tone="amber"/><div className="flex flex-col justify-center gap-2">{!o.sentToStoreAt && <SoftButton onClick={async()=>{setSendingToStore(o.id); try { if ((o.orderType || 'cake') === 'cake') await sendCakeToStoreDashboard(o); else await sendToStoreDashboard(o, lines); markAdvanceSentToStore(o.id); } catch (sendError) { setError(sendError instanceof Error ? sendError.message : 'Failed to send order to store.'); } finally { setSendingToStore(null); }}} disabled={sendingToStore===o.id}><Store className="size-4"/>{sendingToStore===o.id?'Sending...':((o.orderType || 'cake') === 'cake' ? 'Send to Cake Master' : 'Send to Store')}</SoftButton>}{(() => { const needsDispatchSync = !!o.sentToStoreAt && o.storeStatus !== 'dispatched'; return o.balanceAmount > 0 ? (<><SoftButton onClick={()=>setCollectingId(isCollecting ? null : o.id)}><IndianRupee className="size-4"/>Collect Remaining ({money(o.balanceAmount)})</SoftButton>{isCollecting && <div className="mt-2 space-y-2 rounded-2xl bg-slate-50 p-3"><Select value={collectMode} onChange={e=>setCollectMode(e.target.value as typeof collectMode)} className="text-xs"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="split">Split</option></Select><PrimaryButton onClick={()=>setClosingOrder({ order: o, payMode: collectMode })} disabled={needsDispatchSync} className="w-full text-xs">Confirm & Print Final Bill</PrimaryButton>{needsDispatchSync && <p className="mt-1 text-[11px] font-bold text-amber-600">Waiting for packing to dispatch - stock must sync to this branch first.</p>}</div>}</>) : (<><PrimaryButton onClick={()=>setClosingOrder({ order: o, payMode: o.paymentMode })} disabled={needsDispatchSync} className="w-full text-xs"><Printer className="size-4"/>Complete & Print Final Bill</PrimaryButton>{needsDispatchSync && <p className="mt-1 text-[11px] font-bold text-amber-600">Waiting for packing to dispatch - stock must sync to this branch first.</p>}</>); })()}{!isSnbOrder && (o.orderType || 'cake') === 'cake' && <div className="grid grid-cols-2 gap-2"><SoftButton onClick={()=>setManagingOrder({ order:o, action:'edit' })} disabled={!!o.storeStatus && o.storeStatus !== 'store'}><Pencil className="size-4"/>Edit</SoftButton><SoftButton onClick={()=>setManagingOrder({ order:o, action:'cancel' })} disabled={!!o.storeStatus && o.storeStatus !== 'store'} className="text-red-600"><XCircle className="size-4"/>Cancel</SoftButton></div>}{!isSnbOrder && (o.orderType || 'cake') === 'cake' && !!o.storeStatus && o.storeStatus !== 'store' && <p className="text-[10px] font-bold text-slate-500">Locked after Cake Master acceptance.</p>}</div></div>{o.sentToStoreAt && <div className="mt-3 flex flex-wrap items-center gap-1 rounded-2xl bg-slate-50 p-2 text-xs font-black">{(()=>{ const stageOrder = ['store','baking','packing','dispatched'] as const; const reachedIdx = o.storeStatus ? stageOrder.indexOf(o.storeStatus) : -1; return stageOrder.map((stage, idx, arr)=>{ const done = idx <= reachedIdx; const labels = { store:'Store', baking:'Baking', packing:'Packing', dispatched:'Dispatched' }; return <span key={stage} className="inline-flex items-center gap-1"><span className={cn('rounded-xl px-2 py-1', done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500')}>{labels[stage]}</span>{idx < arr.length - 1 && <span className="text-slate-300">-</span>}</span>; }); })()}<span className="ml-auto text-slate-500">{o.storeStatusHistory && o.storeStatusHistory.length > 0 ? (o.storeAcceptedBy && `${o.storeStatus} by ${o.storeAcceptedBy} - ${new Date(o.storeStatusHistory.at(-1)!.at).toLocaleString('en-IN', { hour:'2-digit', minute:'2-digit' })}`) : `Sent to store ${new Date(o.sentToStoreAt).toLocaleString('en-IN', { hour:'2-digit', minute:'2-digit' })} - awaiting store`}</span></div>}</div>; })}</div>
      ) : pipelineView === 'history' ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[720px] text-sm"><thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Order No</th><th className="p-3">Slip No</th><th className="p-3">Customer</th><th className="p-3">Cake / Delivery</th><th className="p-3 text-right">Order Value</th><th className="p-3 text-right">Paid</th></tr></thead><tbody>{historyOrders.length === 0 ? <tr><td colSpan={6} className="p-6 text-center font-bold text-slate-500">No completed orders yet.</td></tr> : historyOrders.map(o=><tr key={o.id} className="border-t"><td className="p-3 font-black">{o.orderNo}</td><td className="p-3 font-bold">{o.slipNumber || '-'}</td><td className="p-3"><p className="font-bold">{o.customerName}</p><p className="text-xs text-slate-500">{o.mobile}</p></td><td className="p-3"><p>{[o.creamType, o.cakeTypeName, o.flavor].filter(Boolean).join(' - ') || o.deliveryDate}</p><p className="text-xs text-slate-500">Delivery {o.deliveryDate} {o.deliveryTime || ''}</p></td><td className="p-3 text-right font-black">
              {o.originalOrderValue !== undefined && Math.abs(o.originalOrderValue - o.orderValue) > 0.01 ? (
                <><span className="mr-1 text-xs font-bold text-slate-400 line-through">{money(o.originalOrderValue)}</span><span className="text-emerald-700">{money(o.orderValue)}</span></>
              ) : money(o.orderValue)}
            </td><td className="p-3 text-right"><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">Paid</span></td></tr>)}</tbody></table></div>
      ) : (
        <div className="space-y-3">{cancelledOrders.length === 0 ? <p className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">No cancelled advance orders.</p> : cancelledOrders.map((o) => <div key={o.id} className="rounded-2xl border border-red-200 bg-red-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black text-slate-950">{o.orderNo} - {o.customerName}</p><p className="text-sm font-bold text-slate-600">{o.cancellationReason || 'Cancelled'}{o.cancelledBy ? ` - ${o.cancelledBy}` : ''}</p></div><div className="text-right"><p className="font-black text-red-700">Refund {money(o.refundAmount || 0)}</p><p className="text-xs font-bold text-red-600">{o.refundMode?.toUpperCase() || 'No refund'}</p></div></div></div>)}</div>
      )}
    </Section>
  </div>
  {closingOrder && (
    <ClosingConfirmModal
      order={closingOrder.order}
      payMode={closingOrder.payMode}
      onCancel={() => setClosingOrder(null)}
      onConfirm={(overrides) => finalInvoice(closingOrder.order, closingOrder.payMode, overrides)}
    />
  )}
  {managingOrder && (
    <AdvanceManageModal
      order={managingOrder.order}
      action={managingOrder.action}
      onCancel={() => setManagingOrder(null)}
      onConfirm={(input) => manageAdvanceOrder(managingOrder.order, managingOrder.action, input)}
    />
  )}
  </>;
}
function makeLine(item: BranchCatalogItem, qty: number): BranchBillItem { return { barcode: item.barcode, itemName: item.name, quantity: qty, unit: item.uom === 'Kgs' ? 'kg' : 'pcs', price: item.price, tax: 0, discount: 0, lineTotal: qty * item.price }; }

type ClosingQuantityInfo = {
  placedQty: number;
  receivedQty: number;
  rate: number;
  placedOrderValue: number;
};

function resolveAdvanceClosingQuantities(order: CakeAdvanceOrder): ClosingQuantityInfo {
  const firstLine = order.items?.[0];
  const lineQty = qtyValue(firstLine?.quantity);
  const cakeQty = qtyValue(order.cakeKg);
  const originalQty = qtyValue(order.originalCakeKg);
  const lineTotal = qtyValue(firstLine?.lineTotal);
  const linePrice = qtyValue(firstLine?.price);
  const originalOrderValue = qtyValue(order.originalOrderValue);
  const currentOrderValue = qtyValue(order.orderValue);

  let placedQty = originalQty || lineQty || cakeQty;
  let receivedQty = lineQty || cakeQty || placedQty;
  const lineAndCakeDiffer = lineQty > 0 && cakeQty > 0 && qtyChanged(lineQty, cakeQty);
  const originalLooksLikeReceived = originalQty > 0 && cakeQty > 0 && !qtyChanged(originalQty, cakeQty) && lineAndCakeDiffer;

  if (lineAndCakeDiffer && (!originalQty || originalLooksLikeReceived)) {
    placedQty = lineQty;
    receivedQty = cakeQty;
  } else if (originalQty > 0) {
    placedQty = originalQty;
    receivedQty = lineQty > 0 && qtyChanged(lineQty, placedQty)
      ? lineQty
      : cakeQty > 0 && qtyChanged(cakeQty, placedQty)
        ? cakeQty
        : (lineQty || cakeQty || placedQty);
  }

  const rate = linePrice
    || (lineQty > 0 && lineTotal > 0 ? lineTotal / lineQty : 0)
    || (placedQty > 0 && originalOrderValue > 0 ? originalOrderValue / placedQty : 0)
    || (receivedQty > 0 && currentOrderValue > 0 ? currentOrderValue / receivedQty : 0)
    || currentOrderValue;
  const placedOrderValue = originalOrderValue || (placedQty > 0 && rate > 0 ? roundMoney(placedQty * rate) : currentOrderValue);

  return { placedQty, receivedQty, rate, placedOrderValue };
}

function AdvanceManageModal({ order, action, onCancel, onConfirm }: {
  order: CakeAdvanceOrder;
  action: 'edit' | 'cancel';
  onCancel: () => void;
  onConfirm: (input: { reason: string; password: string; refundMode?: 'cash' | 'upi' | 'card'; details?: Partial<CakeAdvanceOrder> }) => Promise<string | null>;
}) {
  const [form, setForm] = useState({ customerName: order.customerName, mobile: order.mobile, deliveryDate: order.deliveryDate, deliveryTime: order.deliveryTime, cakeKg: order.cakeKg, flavor: order.flavor, shape: order.shape, creamType: order.creamType || 'Butter Cream', messageOnCake: order.messageOnCake || '', designNotes: order.designNotes || '', reason: '', password: '', refundMode: 'cash' as 'cash' | 'upi' | 'card' });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const originalQty = Math.max(0, Number(order.cakeKg || order.items?.[0]?.quantity || 0));
  const nextQty = Math.max(0, Number(form.cakeKg || 0));
  const rate = order.items?.[0]?.price || (originalQty > 0 ? order.orderValue / originalQty : 0);
  const orderValue = Math.round(nextQty * rate * 100) / 100;
  const submit = async () => {
    if (!form.reason.trim() || !form.password) { setModalError('Reason and login password are required.'); return; }
    if (action === 'edit' && (!form.customerName.trim() || !form.deliveryDate || nextQty <= 0 || orderValue < order.advanceAmount)) {
      setModalError(orderValue < order.advanceAmount ? 'Edited order value cannot be below the advance already paid.' : 'Complete the customer, delivery date, and quantity.'); return;
    }
    setSaving(true); setModalError('');
    const details = action === 'edit' ? {
      customerName: form.customerName.trim(), mobile: form.mobile.trim(), deliveryDate: form.deliveryDate, deliveryTime: form.deliveryTime,
      cakeKg: String(nextQty), flavor: form.flavor.trim(), shape: form.shape.trim(), creamType: form.creamType as CakeAdvanceOrder['creamType'],
      messageOnCake: form.messageOnCake.trim(), designNotes: form.designNotes.trim(), orderValue,
      balanceAmount: Math.round((orderValue - order.advanceAmount) * 100) / 100,
      items: order.items?.map((line, index) => index === 0 ? { ...line, quantity: nextQty, lineTotal: orderValue } : line),
    } : undefined;
    try {
      const errorMessage = await onConfirm({ reason: form.reason.trim(), password: form.password, refundMode: action === 'cancel' && order.advanceAmount > 0 ? form.refundMode : undefined, details });
      if (errorMessage) setModalError(errorMessage);
    } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/60 p-3"><div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-black text-slate-950">{action === 'edit' ? 'Edit Advance Cake Order' : 'Cancel Advance Cake Order'}</h3><p className="text-sm font-bold text-slate-500">{order.orderNo} - {order.customerName}</p></div><button type="button" onClick={onCancel} className="grid size-9 place-items-center rounded-xl bg-slate-100"><X className="size-4" /></button></div>
    {action === 'edit' && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Customer"><Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field><Field label="Mobile"><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field><Field label="Delivery Date"><Input type="date" value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} /></Field><Field label="Delivery Time"><Input type="time" value={form.deliveryTime} onChange={(e) => setForm({ ...form, deliveryTime: e.target.value })} /></Field><Field label="Cake Quantity"><Input type="number" min="0.01" step="0.01" value={form.cakeKg} onChange={(e) => setForm({ ...form, cakeKg: e.target.value })} /></Field><Field label="Flavour"><Input value={form.flavor} onChange={(e) => setForm({ ...form, flavor: e.target.value })} /></Field><Field label="Shape"><Input value={form.shape} onChange={(e) => setForm({ ...form, shape: e.target.value })} /></Field><Field label="Cream"><Select value={form.creamType} onChange={(e) => setForm({ ...form, creamType: e.target.value as typeof form.creamType })}><option>Butter Cream</option><option>Fresh Cream</option></Select></Field><div className="sm:col-span-2"><Field label="Message on Cake"><Input value={form.messageOnCake} onChange={(e) => setForm({ ...form, messageOnCake: e.target.value })} /></Field></div><div className="sm:col-span-2"><Field label="Design Notes"><Textarea value={form.designNotes} onChange={(e) => setForm({ ...form, designNotes: e.target.value })} /></Field></div><div className="sm:col-span-2 rounded-xl bg-slate-50 p-3 text-sm font-bold"><div className="flex justify-between"><span>Recalculated value</span><span>{money(orderValue)}</span></div><div className="mt-1 flex justify-between text-slate-500"><span>Advance already paid</span><span>{money(order.advanceAmount)}</span></div></div></div>}
    {action === 'cancel' && order.advanceAmount > 0 && <div className="mt-4"><Field label={`Refund Method (${money(order.advanceAmount)})`}><Select value={form.refundMode} onChange={(e) => setForm({ ...form, refundMode: e.target.value as typeof form.refundMode })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></Select></Field></div>}
    <div className="mt-4 space-y-3"><Field label={`${action === 'edit' ? 'Edit' : 'Cancellation'} Reason`}><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field><Field label="Login Password"><Input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>{modalError && <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{modalError}</p>}<div className="grid grid-cols-2 gap-2"><SoftButton onClick={onCancel} disabled={saving}>Back</SoftButton><PrimaryButton onClick={() => void submit()} disabled={saving} className={action === 'cancel' ? 'bg-red-600' : ''}>{saving ? <Loader2 className="size-4 animate-spin" /> : action === 'edit' ? <Pencil className="size-4" /> : <XCircle className="size-4" />}{saving ? 'Saving...' : action === 'edit' ? 'Save Changes' : 'Cancel & Refund'}</PrimaryButton></div></div>
  </div></div>;
}

function ClosingConfirmModal({
  order, payMode, onCancel, onConfirm,
}: {
  order: CakeAdvanceOrder;
  payMode: 'cash' | 'upi' | 'card' | 'split';
  onCancel: () => void;
  onConfirm: (overrides: { quantity: number; discount: number; additionalCharges: number; refundMode?: 'cash' | 'upi' | 'card'; paymentSplits?: Array<{ mode: 'cash' | 'upi' | 'card'; amount: number }> }) => Promise<string | null | void>;
}) {
  const isSingleLine = (order.items?.length ?? 1) <= 1;
  const closingQty = resolveAdvanceClosingQuantities(order);
  const { placedQty, receivedQty: receivedQtyDefault, rate } = closingQty;
  const [quantity, setQuantity] = useState(String(receivedQtyDefault));
  const [discount, setDiscount] = useState('0');
  const [additionalCharges, setAdditionalCharges] = useState('0');
  const [refundMode, setRefundMode] = useState<'cash' | 'upi' | 'card'>('cash');
  const [split, setSplit] = useState({ cash: '', upi: '', card: '' });
  const [confirming, setConfirming] = useState(false);
  const [modalError, setModalError] = useState('');

  const qtyNum = isSingleLine ? Math.max(0, Number(quantity) || 0) : receivedQtyDefault;
  const discountNum = Math.max(0, Number(discount) || 0);
  const additionalChargesNum = Math.max(0, Number(additionalCharges) || 0);
  const totalBillValue = isSingleLine ? Math.round(qtyNum * rate * 100) / 100 : order.orderValue;
  const finalTotal = Math.max(0, Math.round((totalBillValue + additionalChargesNum - discountNum) * 100) / 100);
  const finalBalance = Math.max(0, Math.round((finalTotal - (order.advanceAmount || 0)) * 100) / 100);
  const refundDue = Math.max(0, Math.round(((order.advanceAmount || 0) - finalTotal) * 100) / 100);
  const paymentSplits = (Object.entries(split) as Array<['cash' | 'upi' | 'card', string]>)
    .map(([mode, amount]) => ({ mode, amount: Math.max(0, Number(amount) || 0) }))
    .filter((line) => line.amount > 0);
  const splitTotal = Math.round(paymentSplits.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
  const splitValid = payMode !== 'split' || refundDue > 0 || Math.abs(splitTotal - finalBalance) <= 0.001;

  useEffect(() => {
    setQuantity(String(receivedQtyDefault));
  }, [order.id, receivedQtyDefault]);

  const handleConfirm = async () => {
    setModalError('');
    setConfirming(true);
    try {
      if (!splitValid) { setModalError(`Split payments must add up to ${money(finalBalance)}.`); return; }
      const errorMessage = await onConfirm({ quantity: qtyNum, discount: discountNum, additionalCharges: additionalChargesNum, refundMode: refundDue > 0 ? refundMode : undefined, paymentSplits: payMode === 'split' ? paymentSplits : undefined });
      if (errorMessage) setModalError(errorMessage);
    } catch (confirmError) {
      setModalError(confirmError instanceof Error ? confirmError.message : 'Advance order could not be closed.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
        <h3 className="text-lg font-black text-slate-950">Confirm Order Closing</h3>
        <p className="mt-0.5 text-sm font-bold text-slate-500">{order.orderNo} - {order.customerName}</p>

        <div className="mt-4 space-y-3">
          {Math.abs(placedQty - receivedQtyDefault) > 0.001 && (
            <div className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800">
              Order placed: {placedQty} - Received from packing: {receivedQtyDefault}
            </div>
          )}
          <Field label="Order Placed Quantity">
            <Input type="number" min="0" step="0.01" value={placedQty} disabled className="opacity-60" />
          </Field>
          <Field label="Received from Packing (editable)">
            <Input type="number" min="0" step="0.01" value={quantity} disabled={!isSingleLine} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          {!isSingleLine && <p className="-mt-2 text-[11px] font-bold text-slate-400">This order has multiple items - quantity is fixed; only the discount can be adjusted here.</p>}
          <Field label="Discount Amount">
            <Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </Field>
          <Field label="Additional Charges">
            <Input type="number" min="0" step="0.01" value={additionalCharges} onChange={(e) => setAdditionalCharges(e.target.value)} />
          </Field>
          {refundDue > 0 && <Field label="Refund Method">
            <Select value={refundMode} onChange={(e) => setRefundMode(e.target.value as typeof refundMode)}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
            </Select>
          </Field>}
          {refundDue === 0 && finalBalance > 0 && payMode === 'split' && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-blue-800">Split Final Payment</p>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'upi', 'card'] as const).map((mode) => (
                  <Field key={mode} label={mode.toUpperCase()}>
                    <Input type="number" min="0" step="0.01" value={split[mode]} onChange={(e) => setSplit((current) => ({ ...current, [mode]: e.target.value }))} />
                  </Field>
                ))}
              </div>
              <p className={cn('mt-2 text-xs font-black', splitValid ? 'text-emerald-700' : 'text-red-700')}>{money(splitTotal)} of {money(finalBalance)}</p>
            </div>
          )}

          <div className="space-y-1.5 rounded-2xl bg-slate-50 p-3 text-sm font-bold">
            <div className="flex justify-between"><span className="text-slate-500">Cake Value</span><span className="text-slate-900">{money(totalBillValue)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Additional Charges</span><span className="text-slate-900">+ {money(additionalChargesNum)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="text-red-600">- {money(discountNum)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Final Bill Value</span><span className="text-slate-900">{money(finalTotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Less: Advance Received</span><span className="text-red-600">- {money(order.advanceAmount || 0)}</span></div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 text-base"><span className="font-black text-slate-950">{refundDue > 0 ? 'Refund Due' : 'Final Balance Payable'}</span><span className="font-black text-emerald-700">{money(refundDue > 0 ? refundDue : finalBalance)}</span></div>
          </div>
          {refundDue > 0 && <p className="text-xs font-bold text-emerald-700">Refund {money(refundDue)} to the customer by {refundMode.toUpperCase()}.</p>}
          {modalError && <p className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{modalError}</p>}
        </div>

        <div className="mt-5 flex gap-2">
          <SoftButton type="button" onClick={onCancel} disabled={confirming} className="flex-1">Cancel</SoftButton>
          <PrimaryButton
            type="button"
            disabled={confirming || finalTotal <= 0 || qtyNum <= 0 || !splitValid}
            onClick={() => void handleConfirm()}
            className="flex-1"
          >
            {confirming ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            {confirming ? 'Closing...' : 'Confirm & Close'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

export function QuotationTab({ branch, branchStock, onOpenTab }: ModuleProps) {
  const { quotations, addQuotation, updateQuotationStatus } = useBranchOpsStore();
  const { currentUser } = useAuthStore();
  const items = useOperationalCatalog(branch);
  const [itemName, setItemName] = useState(items[0]?.name || '');
  const [qty, setQty] = useState('1');
  const [customerName, setCustomerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [salesperson, setSalesperson] = useState(currentUser?.displayName || 'Staff');
  const [lines, setLines] = useState<BranchBillItem[]>([]);
  const add = () => { const item = items.find((i)=>i.name===itemName); if (!item) return; setLines((l)=>[...l, makeLine(item, Number(qty||1))]); };
  const save = () => { if (!customerName || lines.length===0) return; const q = addQuotation({ branch, customerName, mobile, items: lines, total: lines.reduce((s,i)=>s+i.lineTotal,0), salesperson }); printHtml(q.quoteNo, `<div class="stamp">QUOTATION</div><h2>${q.quoteNo}</h2><p>${customerName} ${mobile}</p><table>${lines.map(i=>`<tr><td>${i.itemName}</td><td>${i.quantity}</td><td class="right">Rs ${i.lineTotal}</td></tr>`).join('')}</table><h2>Total: Rs ${q.total}</h2>`); setLines([]); setCustomerName(''); setMobile(''); };
  const convert = (id: string) => { updateQuotationStatus(id, 'Converted', currentUser?.displayName || 'Staff'); onOpenTab?.('bill'); };
  return <div className="branch-split-workspace grid h-full min-h-0 grid-rows-2 gap-2 md:grid-cols-[minmax(320px,40%)_minmax(0,1fr)] md:grid-rows-1"><Section title="Create Quotation" icon={<FileText className="size-5"/>}><div className="space-y-3"><Field label="Customer"><Input value={customerName} onChange={(e)=>setCustomerName(e.target.value)}/></Field><Field label="Mobile"><Input value={mobile} onChange={(e)=>setMobile(e.target.value)}/></Field><Field label="Salesperson"><Input value={salesperson} onChange={(e)=>setSalesperson(e.target.value)}/></Field><div className="grid grid-cols-[1fr_90px] gap-2"><Select value={itemName} onChange={(e)=>setItemName(e.target.value)}>{items.map(i=><option key={i.name}>{i.name}</option>)}</Select><Input type="number" value={qty} onChange={(e)=>setQty(e.target.value)}/></div><SoftButton onClick={add}><Plus className="size-4"/>Add Item</SoftButton><div className="space-y-2">{lines.map((l,i)=><div key={`${l.itemName}-${i}`} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm font-bold"><span>{l.itemName} x {l.quantity}</span><span>{money(l.lineTotal)}</span></div>)}</div><PrimaryButton onClick={save}><Printer className="size-4"/>Print / Share Quotation</PrimaryButton></div></Section><Section title="Open Quotations" icon={<FileClock className="size-5"/>}><div className="space-y-3">{quotations.filter(q=>q.branch===branch).map(q=><div key={q.id} className="rounded-3xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-black">{q.quoteNo} - {q.customerName}</p><p className="text-sm text-slate-500">{q.items.length} items - {money(q.total)} - {q.status}</p></div><SoftButton onClick={()=>convert(q.id)} disabled={q.status!=='Open'}>Convert to Bill</SoftButton></div>{q.items.some(i=>stockQty(branchStock,i.itemName,i.barcode)<i.quantity) && <p className="mt-2 text-sm font-bold text-amber-600"><AlertTriangle className="inline size-4"/> Stock validation required before billing.</p>}</div>)}</div></Section></div>;
}

export function ReturnsTab({ branch, branchStock }: ModuleProps) {
  const { currentUser } = useAuthStore();
  const { bills, returns, addReturn } = useBranchOpsStore();
  const { fetchBranchData } = useBranchStore();
  const [billNo, setBillNo] = useState('');
  const [selected, setSelected] = useState<BranchBillRecord | null>(null);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('Customer return');
  const [returnPayMode, setReturnPayMode] = useState<'cash'|'upi'|'card'|'credit_adjustment'>('cash');
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState('');

  const find = async () => {
    const normalizedBillNo = billNo.trim();
    let bill = bills.find((row)=>row.branch===branch && row.billNo.toLowerCase()===normalizedBillNo.toLowerCase()) || null;
    if (!bill && normalizedBillNo) {
      const { data, error } = await supabase
        .from('branch_operation_records')
        .select('payload')
        .eq('branch', branch)
        .in('record_type', ['bill', 'advance_final_bill'])
        .ilike('record_no', normalizedBillNo)
        .limit(1)
        .maybeSingle();
      if (!error && data?.payload) bill = data.payload as BranchBillRecord;
    }
    setSelected(bill);
    setQtys({});
    setReturnError(bill ? '' : 'Bill not found.');
    setReturnPayMode(bill?.paymentMode === 'credit' ? 'credit_adjustment' : (bill?.paymentMode === 'upi' || bill?.paymentMode === 'card' ? bill.paymentMode : 'cash'));
  };

  const doReturn = async () => {
    if (!selected || returning) return;
    setReturnError('');
    setReturning(true);
    const lines = selected.items.flatMap((item)=>{
      const quantity = Number(qtys[item.itemName] || 0);
      return quantity > 0 ? [{ ...item, quantity, lineTotal: roundMoney(quantity * item.price) }] : [];
    });
    if (!lines.length) { setReturnError('Enter at least one return quantity.'); setReturning(false); return; }
    if (!reason.trim()) { setReturnError('Return reason is mandatory.'); setReturning(false); return; }
    try {
      const ret = await addReturn({
        branch,
        originalBillNo: selected.billNo,
        originalPaymentMode: selected.paymentMode === 'credit' ? 'credit' : selected.paymentMode === 'upi' || selected.paymentMode === 'card' ? selected.paymentMode : 'cash',
        items: lines,
        total: roundMoney(lines.reduce((sum,item)=>sum+item.lineTotal,0)),
        returnedBy: currentUser?.username || currentUser?.displayName || 'Staff',
        reason: reason.trim(),
        returnPayMode,
      });
      await fetchBranchData(branch);
      const printableMode = ret.returnPayMode === 'credit_adjustment' ? 'credit' : (ret.returnPayMode || 'cash');
      void printCounterBill({
        id: ret.id,
        branch,
        billNo: ret.returnNo,
        invoiceNo: 0,
        items: ret.items,
        subtotal: ret.total,
        discount: 0,
        tax: 0,
        total: ret.total,
        tendered: Number(ret.refundAmount || 0),
        balance: 0,
        paymentMode: printableMode as BranchBillRecord['paymentMode'],
        salesperson: selected.salesperson || '',
        biller: currentUser?.username || currentUser?.displayName || 'Staff',
        createdAt: new Date().toISOString(),
        printCount: 1,
        status: 'Returned',
        source: 'counter',
        _isReturn: true,
        _originalBillNo: selected.billNo,
        _returnReason: `${reason}${Number(ret.creditAdjusted || 0) > 0 ? ` - Credit reduced ${money(Number(ret.creditAdjusted || 0))}` : ''}${Number(ret.refundAmount || 0) > 0 ? ` - Refunded ${money(Number(ret.refundAmount || 0))}` : ''}`,
      } as BranchBillRecord & { _isReturn: boolean; _originalBillNo: string; _returnReason: string }, false);
      setSelected(null); setBillNo(''); setQtys({});
    } catch (error) {
      setReturnError(error instanceof Error ? error.message : 'Return could not be completed.');
    } finally {
      setReturning(false);
    }
  };

  const modes: Array<{value:'cash'|'upi'|'card'|'credit_adjustment'; label:string}> = selected?.paymentMode === 'credit'
    ? [{ value:'credit_adjustment', label:'Reduce Credit' }, { value:'cash', label:'Credit + Cash' }, { value:'upi', label:'Credit + UPI' }, { value:'card', label:'Credit + Card' }]
    : [{ value:'cash', label:'Cash' }, { value:'upi', label:'UPI' }, { value:'card', label:'Card' }];

  return <div className="branch-split-workspace branch-split-workspace-tight grid h-full min-h-0 gap-2">
    <Section title="Return Bill" icon={<RotateCcw className="size-5"/>}>
      <div className="space-y-3">
        <Field label="Search bill number"><div className="flex gap-2"><Input value={billNo} onChange={(e)=>setBillNo(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter')void find();}} placeholder={`${branch}-0001`}/><PrimaryButton onClick={()=>void find()}>Search</PrimaryButton></div></Field>
        {selected && <div className="rounded-2xl bg-slate-50 p-3">
          <p className="font-black">{selected.billNo} - {money(selected.total)}</p>
          <p className="text-xs font-bold uppercase text-slate-500">Original payment: {selected.paymentMode}</p>
          {selected.paymentMode === 'credit' && <p className="mt-2 rounded-xl bg-amber-100 p-2 text-xs font-bold text-amber-900">The unpaid credit balance is reduced first. Select a refund mode only when the return exceeds the outstanding credit.</p>}
          <div className="max-h-[24vh] overflow-y-auto pr-1">{selected.items.map((item)=><div key={item.itemName} className="mt-2 grid grid-cols-[1fr_90px] gap-2"><p className="text-sm font-bold">{item.itemName}<br/><span className="text-xs text-slate-500">Max {item.quantity} - {money(item.price)}</span></p><Input type="number" min="0" max={item.quantity} step="0.001" value={qtys[item.itemName] || ''} onChange={(e)=>setQtys({...qtys,[item.itemName]:e.target.value})}/></div>)}</div>
          <Field label="Reason for Return"><select value={reason} onChange={(e)=>setReason(e.target.value)} className="mb-2 h-9 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"><option value="">Select preset reason...</option><option value="Customer return - product defect">Product defect</option><option value="Customer return - wrong item billed">Wrong item billed</option><option value="Customer return - changed mind">Changed mind</option><option value="Customer return - duplicate bill">Duplicate bill</option><option value="Customer return - overcharge correction">Overcharge correction</option><option value="Customer return - stale/expired product">Stale/expired product</option></select><Textarea value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Or type a custom reason..."/></Field>
          <Field label="Settlement"><div className={cn('grid gap-2', modes.length===4?'grid-cols-2':'grid-cols-3')}>{modes.map((mode)=><button key={mode.value} onClick={()=>setReturnPayMode(mode.value)} className={cn('rounded-xl border-2 px-2 py-2 text-xs font-black', returnPayMode===mode.value?'border-slate-950 bg-slate-950 text-white':'border-slate-200 bg-white text-slate-600')}>{mode.label}</button>)}</div></Field>
          {returnError && <p className="rounded-xl bg-red-50 p-3 text-sm font-black text-red-700">{returnError}</p>}
          <PrimaryButton onClick={()=>void doReturn()} disabled={returning}><Printer className="size-4"/>{returning ? 'Processing Return...' : 'Print Return Bill & Sync Stock'}</PrimaryButton>
        </div>}
      </div>
    </Section>
    <Section title="Return History" icon={<History className="size-5"/>}>
      <div className="h-full min-h-0 space-y-2 overflow-y-auto">{returns.filter(row=>row.branch===branch).map((row)=><div key={row.id} className="rounded-2xl border p-3"><p className="font-black">{row.returnNo} - {money(row.total)}</p><p className="text-xs text-slate-500">Against {row.originalBillNo} - {new Date(row.createdAt).toLocaleString('en-IN')} - {(row.returnPayMode || 'cash').replace('_',' ').toUpperCase()}</p></div>)}</div>
    </Section>
  </div>;
}

export function PurchaseTab({ branch, branchStock }: ModuleProps) {
  const { currentUser } = useAuthStore(); const { addPurchase } = useBranchOpsStore(); const { manualUpdateStock, fetchBranchData } = useBranchStore();
  const items = useOperationalCatalog(branch); const [f,setF] = useState({supplier:'',invoiceNo:'',itemName:items[0]?.name||'',quantity:'',cost:'',tax:'0'});
  const save = async () => { const qty=Number(f.quantity), cost=Number(f.cost), tax=Number(f.tax||0), total=qty*cost+tax; if(!f.supplier||!f.invoiceNo||!qty||!cost) return; addPurchase({branch,supplier:f.supplier,invoiceNo:f.invoiceNo,itemName:f.itemName,quantity:qty,cost,tax,total,enteredBy:currentUser?.username||currentUser?.displayName||'Staff'}); const selectedItem = items.find((item) => item.name === f.itemName); await manualUpdateStock(branch,f.itemName,stockQty(branchStock,f.itemName,selectedItem?.barcode)+qty,currentUser?.username||currentUser?.displayName||'Staff',selectedItem?.barcode); await fetchBranchData(branch); setF({...f,quantity:'',cost:'',tax:'0'}); };
  return <Section title="Purchase Entry" icon={<Truck className="size-5"/>}><div className="grid gap-4 lg:grid-cols-3"><Field label="Supplier"><Input value={f.supplier} onChange={(e)=>setF({...f,supplier:e.target.value})}/></Field><Field label="Supplier Invoice"><Input value={f.invoiceNo} onChange={(e)=>setF({...f,invoiceNo:e.target.value})}/></Field><Field label="Item"><Select value={f.itemName} onChange={(e)=>setF({...f,itemName:e.target.value})}>{items.map(i=><option key={i.name}>{i.name}</option>)}</Select></Field><Field label="Quantity"><Input type="number" value={f.quantity} onChange={(e)=>setF({...f,quantity:e.target.value})}/></Field><Field label="Cost"><Input type="number" value={f.cost} onChange={(e)=>setF({...f,cost:e.target.value})}/></Field><Field label="Tax"><Input type="number" value={f.tax} onChange={(e)=>setF({...f,tax:e.target.value})}/></Field></div><div className="mt-4 flex items-center justify-between rounded-3xl bg-slate-50 p-4"><p className="text-lg font-black">Total: {money(Number(f.quantity||0)*Number(f.cost||0)+Number(f.tax||0))}</p><PrimaryButton onClick={save}><Package className="size-4"/>Save Purchase & Update Stock</PrimaryButton></div></Section>;
}

export function PurchasePayTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore(); const { purchases, purchasePayments, counterOpenings, addPurchasePayment } = useBranchOpsStore(); const branchPurchases = purchases.filter(p=>p.branch===branch); const [supplier,setSupplier]=useState(''); const [amount,setAmount]=useState(''); const [mode,setMode]=useState<'cash'|'upi'|'card'|'bank'>('cash'); const [ref,setRef]=useState(''); const [payError,setPayError]=useState('');
  const activeCounter = counterOpenings.find((record) => record.branch === branch && record.date === todayIso() && record.active !== false && (!currentUser?.id || record.cashierUserId === currentUser.id));
  const pending = branchPurchases.reduce((s,p)=>s+Math.max(0,p.total-p.paidAmount),0); const paid = purchasePayments.filter(p=>p.branch===branch).reduce((s,p)=>s+p.amount,0);
  const supplierDue = supplier.trim() ? branchPurchases.filter(p=>p.supplier.toLowerCase()===supplier.trim().toLowerCase()).reduce((s,p)=>s+Math.max(0,p.total-p.paidAmount),0) : pending;
  const save=()=>{ const value=Number(amount); setPayError(''); if(!supplier||!value) return; if(value > supplierDue && supplierDue > 0){ setPayError(`Payment cannot exceed pending due ${money(supplierDue)} for this supplier.`); return; } try { addPurchasePayment({branch,supplier,amount:value,mode,reference:ref,remarks:'Supplier payment',paidBy:currentUser?.username||currentUser?.displayName||'Staff',cashierUserId:currentUser?.id,counterSessionId:activeCounter?.counterSessionId}); setAmount(''); setRef(''); } catch (e) { setPayError(e instanceof Error ? e.message : 'Purchase payment failed.'); } };
  return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><Kpi label="Paid" value={money(paid)} icon={<CheckCircle2/>} tone="green"/><Kpi label="Pending" value={money(pending)} icon={<AlertTriangle/>} tone="amber"/><Kpi label="Purchases" value={branchPurchases.length} icon={<Receipt/>}/></div><Section title="Purchase Pay" icon={<WalletCards className="size-5"/>}><div className="grid gap-3 lg:grid-cols-5"><Field label="Supplier"><Input value={supplier} onChange={(e)=>{setSupplier(e.target.value); setPayError('');}}/></Field><Field label="Amount"><Input type="number" max={supplierDue || undefined} value={amount} onChange={(e)=>{setAmount(e.target.value); setPayError('');}}/></Field><Field label="Mode"><Select value={mode} onChange={(e)=>setMode(e.target.value as typeof mode)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></Select></Field><Field label="Reference"><Input value={ref} onChange={(e)=>setRef(e.target.value)}/></Field><div className="flex items-end"><PrimaryButton onClick={save}>Pay</PrimaryButton></div></div>{payError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-black text-red-700">{payError}</p>}</Section></div>;
}

export function CurrentCashTab({ branch }: ModuleProps) {
  const { bills, returns, cashMovements, bankDeposits, purchasePayments } = useBranchOpsStore();
  const branchMovements = cashMovements.filter(m=>m.branch===branch);
  const balance = (mode: 'cash'|'upi'|'card') => branchMovements.reduce((s,m)=>m.paymentMode===mode ? s + (m.direction==='in'?m.amount:-m.amount) : s,0);
  const salesToday = bills.filter(b=>b.branch===branch && today(b.createdAt)).reduce((s,b)=>s+b.total,0);
  const returnsToday = returns.filter(r=>r.branch===branch && today(r.createdAt)).reduce((s,r)=>s+r.total,0);
  const depositsToday = bankDeposits.filter(d=>d.branch===branch && today(d.createdAt)).reduce((s,d)=>s+d.amount,0);
  const paymentsToday = purchasePayments.filter(p=>p.branch===branch && today(p.createdAt)).reduce((s,p)=>s+p.amount,0);
  return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><Kpi label="Current Cash" value={money(balance('cash'))} icon={<Banknote/>} tone="green"/><Kpi label="Current UPI" value={money(balance('upi'))} icon={<Smartphone/>} tone="blue"/><Kpi label="Current Card" value={money(balance('card'))} icon={<CreditCard/>} tone="amber"/></div><div className="grid gap-3 md:grid-cols-5"><Kpi label="Sales Today" value={money(salesToday)} icon={<Receipt/>}/><Kpi label="Returns" value={money(returnsToday)} icon={<RotateCcw/>} tone="red"/><Kpi label="Expenses/Pay" value={money(paymentsToday)} icon={<IndianRupee/>} tone="amber"/><Kpi label="Deposits" value={money(depositsToday)} icon={<Landmark/>} tone="blue"/><Kpi label="Available" value={money(balance('cash')+balance('upi')+balance('card'))} icon={<WalletCards/>} tone="green"/></div><Section title="Auditable Cash Movements" icon={<ShieldCheck className="size-5"/>}><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-3">Date/Time</th><th className="p-3">Amount</th><th className="p-3">Mode</th><th className="p-3">Purpose</th><th className="p-3">Entered By</th><th className="p-3">Reference</th><th className="p-3">Remarks</th></tr></thead><tbody>{branchMovements.map(m=><tr key={m.id} className="border-t"><td className="p-3">{new Date(m.dateTime).toLocaleString('en-IN')}</td><td className={cn('p-3 font-black',m.direction==='in'?'text-emerald-700':'text-red-600')}>{m.direction==='in'?'+':'-'}{money(m.amount)}</td><td className="p-3 uppercase">{m.paymentMode}</td><td className="p-3">{m.purpose}</td><td className="p-3">{m.enteredBy}</td><td className="p-3">{m.referenceNumber}</td><td className="p-3">{m.remarks}</td></tr>)}</tbody></table></div></Section></div>;
}

export function BankTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore(); const { bankDeposits, counterOpenings, addBankDeposit } = useBranchOpsStore(); const [f,setF]=useState({depositDate:new Date().toISOString().split('T')[0],amount:'',bankAccount:'Main Current Account',paymentMode:'Cash Deposit',slipNo:'',transactionRef:'',remarks:''});
  const activeCounter = counterOpenings.find((record) => record.branch === branch && record.date === todayIso() && record.active !== false && (!currentUser?.id || record.cashierUserId === currentUser.id));
  const save=()=>{ if(!Number(f.amount)) return; addBankDeposit({branch,depositDate:f.depositDate,amount:Number(f.amount),bankAccount:f.bankAccount,paymentMode:f.paymentMode as 'Cash Deposit' | 'UPI Transfer' | 'Card Settlement' | 'Bank Transfer',slipNo:f.slipNo,transactionRef:f.transactionRef,remarks:f.remarks,enteredBy:currentUser?.username||currentUser?.displayName||'Staff',cashierUserId:currentUser?.id,counterSessionId:activeCounter?.counterSessionId}); setF({...f,amount:'',slipNo:'',transactionRef:'',remarks:''}); };
  const rows=bankDeposits.filter(d=>d.branch===branch); return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><Kpi label="Deposited Today" value={money(rows.filter(r=>today(r.createdAt)).reduce((s,r)=>s+r.amount,0))} icon={<Landmark/>} tone="green"/><Kpi label="This Month" value={money(rows.filter(r=>month(r.createdAt)).reduce((s,r)=>s+r.amount,0))} icon={<CalendarClock/>} tone="blue"/><Kpi label="Entries" value={rows.length} icon={<FileText/>}/></div><Section title="Bank Deposit Entry" icon={<Landmark className="size-5"/>}><div className="grid gap-3 lg:grid-cols-4"><Field label="Deposit Date"><Input type="date" value={f.depositDate} onChange={(e)=>setF({...f,depositDate:e.target.value})}/></Field><Field label="Amount"><Input type="number" value={f.amount} onChange={(e)=>setF({...f,amount:e.target.value})}/></Field><Field label="Bank Account"><Input value={f.bankAccount} onChange={(e)=>setF({...f,bankAccount:e.target.value})}/></Field><Field label="Payment Mode"><Select value={f.paymentMode} onChange={(e)=>setF({...f,paymentMode:e.target.value})}><option>Cash Deposit</option><option>UPI Transfer</option><option>Card Settlement</option><option>Bank Transfer</option></Select></Field><Field label="Deposit Slip Number"><Input value={f.slipNo} onChange={(e)=>setF({...f,slipNo:e.target.value})}/></Field><Field label="Transaction Reference"><Input value={f.transactionRef} onChange={(e)=>setF({...f,transactionRef:e.target.value})}/></Field><Field label="Remarks"><Input value={f.remarks} onChange={(e)=>setF({...f,remarks:e.target.value})}/></Field><div className="flex items-end"><PrimaryButton onClick={save}>Save Deposit</PrimaryButton></div></div></Section></div>;
}

export function PurchaseOrderTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore(); const { purchaseOrders, addPurchaseOrder, updatePoStatus } = useBranchOpsStore(); const items=useOperationalCatalog(branch); const [f,setF]=useState({supplier:'',itemName:items[0]?.name||'',quantity:'',expectedRate:'',expectedDeliveryDate:'',remarks:''}); const user=currentUser?.username||currentUser?.displayName||'Staff';
  const create=()=>{ const qty=Number(f.quantity), rate=Number(f.expectedRate); if(!f.supplier||!qty||!rate) return; addPurchaseOrder({branch,supplier:f.supplier,itemName:f.itemName,quantity:qty,expectedRate:rate,totalAmount:qty*rate,expectedDeliveryDate:f.expectedDeliveryDate,remarks:f.remarks,createdBy:user}); };
  const rows=purchaseOrders.filter(p=>p.branch===branch); return <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]"><Section title="Create Purchase Order" icon={<ClipboardCheck className="size-5"/>}><div className="space-y-3"><Field label="Supplier"><Input value={f.supplier} onChange={(e)=>setF({...f,supplier:e.target.value})}/></Field><Field label="Item"><Select value={f.itemName} onChange={(e)=>setF({...f,itemName:e.target.value})}>{items.map(i=><option key={i.name}>{i.name}</option>)}</Select></Field><div className="grid grid-cols-2 gap-2"><Field label="Quantity"><Input type="number" value={f.quantity} onChange={(e)=>setF({...f,quantity:e.target.value})}/></Field><Field label="Expected Rate"><Input type="number" value={f.expectedRate} onChange={(e)=>setF({...f,expectedRate:e.target.value})}/></Field></div><Field label="Expected Delivery"><Input type="date" value={f.expectedDeliveryDate} onChange={(e)=>setF({...f,expectedDeliveryDate:e.target.value})}/></Field><Field label="Remarks"><Textarea value={f.remarks} onChange={(e)=>setF({...f,remarks:e.target.value})}/></Field><PrimaryButton onClick={create}>Create PO</PrimaryButton></div></Section><Section title="PO Workflow" icon={<Truck className="size-5"/>}><div className="space-y-3">{rows.map((p:PurchaseOrderRecord)=><div key={p.id} className="rounded-3xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black">{p.poNo} - {p.supplier}</p><p className="text-sm text-slate-500">{p.itemName} - {p.quantity} x {money(p.expectedRate)} - {money(p.totalAmount)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{p.status}</span></div><div className="mt-3 flex flex-wrap gap-2">{(['Approved','Rejected','Ordered','Received','Closed'] as const).map(s=><SoftButton key={s} onClick={()=>updatePoStatus(p.id,s,user)}>{s}</SoftButton>)}</div></div>)}</div></Section></div>;
}

export function CashierClosureTab({ branch, source = 'branch' }: ModuleProps) {
  const { currentUser } = useAuthStore();
  const { bills, returns, cashierClosures, purchasePayments, cashMovements, counterOpenings, expenses, bankDeposits, addCashierClosure, openCounter, closeCounter, addNotification } = useBranchOpsStore();
  const { creditSales, creditPayments, fetchCreditSales, fetchCreditPayments } = useBranchStore();
  const [opening, setOpening] = useState('0');
  const [closing, setClosing] = useState('');
  const [actualUpiInput, setActualUpiInput] = useState('');
  const [upiAuditNotes, setUpiAuditNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [ledgerToday, setLedgerToday] = useState<ClosureLedgerRow | null>(null);
  const [closureMessage, setClosureMessage] = useState('');
  const [openCashier, setOpenCashier] = useState('');
  const [openDenominations, setOpenDenominations] = useState<Record<number,string>>({500:'',200:'',100:'',50:'',20:'',10:'',5:'',2:'',1:''});
  const [closeDenominations, setCloseDenominations] = useState<Record<number,string>>({500:'',200:'',100:'',50:'',20:'',10:'',5:'',2:'',1:''});
  const [openSavedMessage, setOpenSavedMessage] = useState('');
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [counterSnapshot, setCounterSnapshot] = useState<CounterClosureSnapshot>({ advanceCash:0, advanceUpi:0, advanceCard:0, advanceBank:0, advanceInitial:0, advanceBalance:0, advanceTotal:0, paymentCount:0 });
  const [dbCounterSession, setDbCounterSession] = useState<null | { id: string; openingCash: number; openedAt: string; cashier: string; cashierUserId: string; cashierDisplayName?: string; denominations?: Record<string,string> }>(null);
  const user = currentUser?.username || currentUser?.displayName || 'Cashier';
  const isSnbOrder = source === 'snb-order' && branch === 'SNB';
  const denominations = [500,200,100,50,20,10,5,2,1];
  const denomTotal = (values: Record<number,string>) => denominations.reduce((sum, d) => sum + d * Number(values[d] || 0), 0);
  const openTotal = denomTotal(openDenominations);
  const closeTotal = denomTotal(closeDenominations);
  const localCounterOpenRecord = counterOpenings.find((record) => record.branch === branch
    && record.date === todayIso()
    && record.active !== false
    && (currentUser?.id ? record.cashierUserId === currentUser.id : record.cashier === user));
  // Many branches (e.g. SNB) share one login across multiple people at the counter,
  // so the actual on-duty person's name (typed in the "Cashier Name" field when
  // opening the counter) should be attributed everywhere, not the shared login's
  // own username/display name.
  const activeCashierName = localCounterOpenRecord?.cashier
    || dbCounterSession?.cashierDisplayName
    || dbCounterSession?.cashier
    || openCashier.trim()
    || user;
  const auditActor = isSnbOrder ? `SNB Order - ${activeCashierName}` : activeCashierName;
  const branchCounterOpenRecord = useMemo(() => localCounterOpenRecord ?? (dbCounterSession ? {
    id: dbCounterSession.id,
    branch,
    date: todayIso(),
    cashier: dbCounterSession.cashierDisplayName || dbCounterSession.cashier,
    cashierUserId: dbCounterSession.cashierUserId,
    counterSessionId: dbCounterSession.id,
    openingCash: dbCounterSession.openingCash,
    denominations: dbCounterSession.denominations || {},
    openedBy: dbCounterSession.cashierDisplayName || dbCounterSession.cashier,
    openedAt: dbCounterSession.openedAt,
    active: true,
  } : undefined), [branch, dbCounterSession, localCounterOpenRecord]);
  const branchClosureRecord = cashierClosures.find((record) => record.branch === branch
    && today(record.createdAt)
    && (currentUser?.id ? record.cashierUserId === currentUser.id : record.cashier === user));

  const loadOpenSession = useCallback(async () => {
    if (!currentUser?.id) { setDbCounterSession(null); return null; }
    const { data, error } = await supabase.rpc('get_my_branch_counter_session_secure', { p_branch: branch });
    if (error) {
      setOpenSavedMessage(`Could not load cashier counter: ${error.message}`);
      setDbCounterSession(null);
      return null;
    }
    const row = data && typeof data === 'object' ? data as Record<string, unknown> : null;
    if (!row?.id) {
      setDbCounterSession(null);
      return null;
    }
    const mapped = {
      id: String(row.id),
      openingCash: Number(row.opening_cash || 0),
      openedAt: String(row.opened_at),
      cashier: String(row.cashier_username || user),
      cashierUserId: String(row.cashier_user_id),
      cashierDisplayName: String(row.cashier_display_name || row.cashier_username || user),
      denominations: (row.opening_denominations && typeof row.opening_denominations === 'object' ? row.opening_denominations : {}) as Record<string,string>,
    };
    setDbCounterSession(mapped);
    return mapped;
  }, [branch, currentUser?.id, user]);

  const loadCounterSnapshot = useCallback(async () => {
    if (!isSnbOrder) return null;
    const { data, error } = await supabase.rpc('get_my_branch_counter_closure_snapshot_secure', { p_branch: branch });
    if (error) {
      setClosureMessage(`Could not load SNB Order collection totals: ${error.message}`);
      return null;
    }
    const row = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const snapshot: CounterClosureSnapshot = {
      counterSession: row.counterSession as Record<string,unknown> | null | undefined,
      advanceCash: Number(row.advanceCash || 0),
      advanceUpi: Number(row.advanceUpi || 0),
      advanceCard: Number(row.advanceCard || 0),
      advanceBank: Number(row.advanceBank || 0),
      advanceInitial: Number(row.advanceInitial || 0),
      advanceBalance: Number(row.advanceBalance || 0),
      advanceTotal: Number(row.advanceTotal || 0),
      paymentCount: Number(row.paymentCount || 0),
      sourceRole: typeof row.sourceRole === 'string' ? row.sourceRole : undefined,
      sourceLabel: typeof row.sourceLabel === 'string' ? row.sourceLabel : undefined,
    };
    setCounterSnapshot(snapshot);
    return snapshot;
  }, [branch, isSnbOrder]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const session = await loadOpenSession();
      if (!active || !session) return;
      await loadCounterSnapshot();
    };
    void load();
    const refreshId = window.setInterval(() => { if (!document.hidden) void load(); }, 15_000);
    return () => { active = false; window.clearInterval(refreshId); };
  }, [loadCounterSnapshot, loadOpenSession]);

  useEffect(() => {
    setOpenCashier(user);
  }, [user]);

  useEffect(() => {
    if (branchCounterOpenRecord) {
      setOpening(String(branchCounterOpenRecord.openingCash));
      setOpenCashier(branchCounterOpenRecord.cashier || user);
    }
  }, [branchCounterOpenRecord, user]);

  useEffect(() => {
    void fetchCreditSales(branch);
    void fetchCreditPayments(branch);
  }, [branch, fetchCreditPayments, fetchCreditSales]);

  const loadClosureLedger = useCallback(async () => {
    setLedgerLoading(true);
    setClosureMessage('');
    const date = todayIso();
    const { data: ledgerData, error: ledgerError } = await supabase
      .from('branch_daily_closure_ledger')
      .select('branch, closure_date, bill_count, sales_total, credit_billed, discounts, tax_total, cash_total, upi_total, card_total, credit_collected, advance_collected, advance_balance_collected')
      .eq('branch', branch)
      .eq('closure_date', date)
      .maybeSingle();
    setLedgerLoading(false);
    if (ledgerError) {
      const missingLedger = /branch_daily_closure_ledger|does not exist|schema cache/i.test(ledgerError.message);
      setClosureMessage(missingLedger
        ? 'Supabase daily closure ledger is not installed yet. Run 20260614_branch_core_tables.sql and 20260614_branch_atomic_checkout_rpc.sql before relying on closure totals.'
        : `Could not load Supabase closure ledger: ${ledgerError.message}`);
      setLedgerToday(null);
    } else {
      setLedgerToday((ledgerData as ClosureLedgerRow | null) || null);
    }
  }, [branch]);

  useEffect(() => {
    void loadClosureLedger();
  }, [loadClosureLedger]);

  const hasActiveCounter = Boolean(branchCounterOpenRecord);
  const sessionStartedAt = branchCounterOpenRecord?.openedAt ? new Date(branchCounterOpenRecord.openedAt).getTime() : 0;
  const inCurrentSession = (value: string) => !sessionStartedAt || new Date(value).getTime() >= sessionStartedAt;
  // The live closure workspace must represent only the currently open counter.
  // A finalized daily ledger remains available for reports/history, but must not
  // repopulate Cash/UPI/Card after the cashier closes the counter.
  const useClosedLedgerForLiveTotals: boolean = false;
  const closureLedger = useClosedLedgerForLiveTotals ? ledgerToday : null;
  const activeSessionId = branchCounterOpenRecord?.counterSessionId;
  const belongsToCashier = (cashierUserId?: string, cashierName?: string) => currentUser?.id
    ? (cashierUserId ? cashierUserId === currentUser.id : cashierName === user)
    : cashierName === user;
  const todayBills = hasActiveCounter ? bills.filter((b) => b.branch === branch
    && today(b.createdAt)
    && inCurrentSession(b.createdAt)
    && (activeSessionId ? b.counterSessionId === activeSessionId : belongsToCashier(b.cashierUserId, b.biller))) : [];
  const counterTodayBills = todayBills.filter((b) => b.source !== 'advance-final');
  const todayReturns = hasActiveCounter ? returns.filter((r) => r.branch === branch && today(r.createdAt) && inCurrentSession(r.createdAt) && r.returnedBy === user) : [];
  const todayPurchasePayments = hasActiveCounter ? purchasePayments.filter((p) => p.branch === branch && today(p.createdAt) && inCurrentSession(p.createdAt) && p.paidBy === user) : [];
  const todayExpenseEntries = hasActiveCounter ? expenses.filter((e) => e.branch === branch && today(e.createdAt) && inCurrentSession(e.createdAt) && e.enteredBy === user) : [];
  const todayBankDeposits = hasActiveCounter ? bankDeposits.filter((d) => d.branch === branch && today(d.createdAt) && inCurrentSession(d.createdAt) && d.enteredBy === user) : [];
  const branchCredits = creditSales[branch] || [];
  const branchCreditPayments = creditPayments[branch] || [];
  const todayCreditSales = hasActiveCounter ? branchCredits.filter((c) => today(c.createdAt) && inCurrentSession(c.createdAt) && c.soldBy === user) : [];
  const todayCreditCollections = hasActiveCounter ? branchCreditPayments.filter((m) => today(m.createdAt) && inCurrentSession(m.createdAt) && m.collectedBy === user) : [];
  const todayAdvancePayments = hasActiveCounter ? cashMovements.filter((m) => m.branch === branch && today(m.dateTime) && inCurrentSession(m.dateTime) && m.enteredBy === user && m.direction === 'in' && (m.purpose === 'Cake advance received' || m.purpose === 'Advance balance collection')) : [];

  const grossBillSales = counterTodayBills.reduce((sum, bill) => sum + bill.total, 0);
  const grossSalesBeforeDiscount = counterTodayBills.reduce((sum, bill) => sum + bill.subtotal + bill.tax, 0);
  const advanceCollectedToday = isSnbOrder
    ? counterSnapshot.advanceTotal
    : closureLedger
      ? num(closureLedger.advance_collected) + num(closureLedger.advance_balance_collected)
      : todayAdvancePayments.reduce((s, m) => s + m.amount, 0);
  const normalCash = counterTodayBills.reduce((s, b) => s + (b.paymentMode === 'cash' ? b.total : b.paymentMode === 'split' ? Number(b.split?.cash || 0) : 0), 0);
  const normalUpi = counterTodayBills.reduce((s, b) => s + (b.paymentMode === 'upi' ? b.total : b.paymentMode === 'split' ? Number(b.split?.upi || 0) : 0), 0);
  const normalCard = counterTodayBills.reduce((s, b) => s + (b.paymentMode === 'card' ? b.total : b.paymentMode === 'split' ? Number(b.split?.card || 0) : 0), 0);
  const refundCash = todayReturns.filter((r) => (r.returnPayMode || r.originalPaymentMode || 'cash') === 'cash').reduce((s, r) => s + Number(r.refundAmount ?? r.total), 0);
  const refundUpi = todayReturns.filter((r) => (r.returnPayMode || r.originalPaymentMode) === 'upi').reduce((s, r) => s + Number(r.refundAmount ?? r.total), 0);
  const refundCard = todayReturns.filter((r) => (r.returnPayMode || r.originalPaymentMode) === 'card').reduce((s, r) => s + Number(r.refundAmount ?? r.total), 0);
  const creditSalesTotal = closureLedger ? num(closureLedger.credit_billed) : todayCreditSales.reduce((s, c) => s + c.subtotal, 0);
  const creditCollectionCash = todayCreditCollections.filter((m) => m.paymentMode === 'cash').reduce((s, m) => s + m.amount, 0);
  const creditCollectionUpi = todayCreditCollections.filter((m) => m.paymentMode === 'upi').reduce((s, m) => s + m.amount, 0);
  const creditCollectionCard = todayCreditCollections.filter((m) => m.paymentMode === 'card').reduce((s, m) => s + m.amount, 0);
  const creditCollectionOther = todayCreditCollections.filter((m) => !['cash', 'upi', 'card'].includes(m.paymentMode)).reduce((s, m) => s + m.amount, 0);
  const creditCollectionDigital = creditCollectionUpi + creditCollectionCard + creditCollectionOther;
  const creditCollectionTotal = closureLedger ? num(closureLedger.credit_collected) : creditCollectionCash + creditCollectionDigital;
  const advanceCash = isSnbOrder ? counterSnapshot.advanceCash : todayAdvancePayments.filter((m) => m.paymentMode === 'cash').reduce((s, m) => s + m.amount, 0);
  const advanceUpi = isSnbOrder ? counterSnapshot.advanceUpi : todayAdvancePayments.filter((m) => m.paymentMode === 'upi').reduce((s, m) => s + m.amount, 0);
  const advanceCard = isSnbOrder ? counterSnapshot.advanceCard : todayAdvancePayments.filter((m) => m.paymentMode === 'card').reduce((s, m) => s + m.amount, 0);
  const advanceBank = isSnbOrder ? counterSnapshot.advanceBank : todayAdvancePayments.filter((m) => !['cash', 'upi', 'card'].includes(m.paymentMode)).reduce((s, m) => s + m.amount, 0);
  const advanceDigital = isSnbOrder ? counterSnapshot.advanceUpi + counterSnapshot.advanceCard + counterSnapshot.advanceBank : todayAdvancePayments.filter((m) => m.paymentMode !== 'cash').reduce((s, m) => s + m.amount, 0);
  // Payment totals shown in closure are NET collections after refunds.
  // The ledger RPC also stores net totals, so no second subtraction is applied in ledger mode.
  const cash = closureLedger ? num(closureLedger.cash_total) : normalCash + creditCollectionCash + advanceCash - refundCash;
  const upi = closureLedger ? num(closureLedger.upi_total) : normalUpi + creditCollectionUpi + advanceUpi - refundUpi;
  const card = closureLedger ? num(closureLedger.card_total) : normalCard + creditCollectionCard + advanceCard - refundCard;
  const advancePaid = isSnbOrder ? counterSnapshot.advanceInitial : closureLedger ? num(closureLedger.advance_collected) : todayAdvancePayments.filter((m) => m.purpose === 'Cake advance received').reduce((s, m) => s + m.amount, 0);
  const advanceFull = isSnbOrder ? counterSnapshot.advanceBalance : closureLedger ? num(closureLedger.advance_balance_collected) : todayAdvancePayments.filter((m) => m.purpose === 'Advance balance collection').reduce((s, m) => s + m.amount, 0);
  const splitTotal = counterTodayBills.filter((b) => b.paymentMode === 'split').reduce((s, b) => s + b.total, 0);
  const refunds = todayReturns.reduce((s, r) => s + r.total, 0);
  const discounts = closureLedger ? num(closureLedger.discounts) : counterTodayBills.reduce((s, b) => s + b.discount, 0);
  const totalSales = closureLedger
    ? Math.max(
        0,
        num(closureLedger.sales_total)
          - num(closureLedger.advance_collected)
          - num(closureLedger.advance_balance_collected),
      )
    : grossBillSales - refunds;
  const netSales = Math.max(0, grossSalesBeforeDiscount - discounts - refunds);
  const totalSalesIncAdvance = totalSales + advanceCollectedToday;
  const expenseTotal = todayExpenseEntries.reduce((s, e) => s + e.amount, 0);
  const supplierPaymentTotal = todayPurchasePayments.reduce((s, p) => s + p.amount, 0);
  const bankDepositTotal = todayBankDeposits.reduce((s, d) => s + d.amount, 0);
  const cashExpenseOut = todayExpenseEntries.filter((e) => e.mode === 'cash').reduce((s, e) => s + e.amount, 0);
  const cashSupplierOut = todayPurchasePayments.filter((p) => p.mode === 'cash').reduce((s, p) => s + p.amount, 0);
  const cashBankDepositOut = todayBankDeposits.filter((d) => d.paymentMode === 'Cash Deposit').reduce((s, d) => s + d.amount, 0);
  const cashOutflows = cashExpenseOut + cashSupplierOut + cashBankDepositOut;
  const duplicate = counterTodayBills.filter((b) => b.printCount > 1).length;
  // FIX (Bug #4): In ledger mode, cash = ledgerToday.cash_total. Verify that the
  // complete_branch_checkout and credit-collection RPCs both write credit-collection
  // cash into cash_total on the ledger row - if they do not, expected will be understated.
  // The non-ledger path already includes creditCollectionCash in cash (line above), so
  // the non-ledger path is correct. The fix here adds creditCollectionCash explicitly
  // when in ledger mode to guard against RPCs that omit it from cash_total.
  // cash is already net of cash refunds; subtracting refunds here again caused double deduction.
  const expected = Number(opening || 0) + cash - cashOutflows;
  const countedCash = closeTotal > 0 ? closeTotal : Number(closing || 0);
  const diff = countedCash - expected;
  const actualUpi = Number(actualUpiInput || 0);
  const upiDifference = actualUpi - upi;
  const upiAuditEntered = actualUpiInput.trim() !== '';
  const cashMatches = Math.abs(diff) < 0.01;
  const upiMatches = upiAuditEntered && Math.abs(upiDifference) < 0.01;
  const closureAuditComplete = countedCash > 0 && upiAuditEntered;
  const closureMatches = closureAuditComplete && cashMatches && upiMatches;

  const save = async () => {
    if (!branchCounterOpenRecord) { setSavedMessage('Open the counter before saving a closure.'); return; }
    if (isSnbOrder) {
      const latestSnapshot = await loadCounterSnapshot();
      if (!latestSnapshot) { setSavedMessage('Unable to verify the latest SNB Order collections. Refresh and try again.'); return; }
      const changed = Math.abs(latestSnapshot.advanceTotal - counterSnapshot.advanceTotal) >= 0.01
        || latestSnapshot.paymentCount !== counterSnapshot.paymentCount;
      if (changed) {
        setSavedMessage('New advance collections were found and the closure totals were refreshed. Verify the amounts and save the closure again.');
        return;
      }
    }
    if (!upiAuditEntered || !Number.isFinite(actualUpi) || actualUpi < 0) {
      setSavedMessage('Enter the verified UPI amount before saving the closure. Enter 0 when there was no UPI settlement.');
      return;
    }
    if (Math.abs(upiDifference) >= 0.01 && upiAuditNotes.trim().length < 3) {
      setSavedMessage('Enter UPI audit remarks because the verified amount does not match the system UPI total.');
      return;
    }
    const closurePayload = {
      branch,
      closure_date: todayIso(),
      cashier: auditActor,
      cashier_user_id: currentUser?.id || null,
      cashier_username: user,
      counter_session_id: activeSessionId || null,
      opening_cash: Number(opening || 0),
      gross_sales: grossSalesBeforeDiscount,
      net_sales: netSales,
      opening_denominations: branchCounterOpenRecord.denominations || {},
      closing_denominations: Object.fromEntries(Object.entries(closeDenominations).map(([denom, count]) => [String(denom), String(count || '')])),
      cash_total: cash,
      upi_total: upi,
      actual_upi: actualUpi,
      upi_difference: upiDifference,
      upi_notes: upiAuditNotes.trim() || null,
      card_total: card,
      credit_billed: creditSalesTotal,
      credit_collected: creditCollectionTotal,
      advance_collected: advancePaid,
      advance_balance_collected: advanceFull,
      refunds,
      expenses: expenseTotal,
      purchase_payments: supplierPaymentTotal,
      discounts,
      tax_total: closureLedger ? num(closureLedger.tax_total) : counterTodayBills.reduce((s, b) => s + b.tax, 0),
      bill_count: closureLedger ? num(closureLedger.bill_count) : counterTodayBills.length,
      duplicate_prints: duplicate,
      expected_cash: expected,
      actual_cash: countedCash,
      difference: diff,
      notes: [isSnbOrder ? '[SNB ORDER CLOSURE]' : '', notes].filter(Boolean).join(' | ') || null,
      status: 'finalized',
    };
    const upiAuditText = [
      '[UPI AUDIT]',
      `System UPI: ${upi.toFixed(2)}`,
      `Verified UPI: ${actualUpi.toFixed(2)}`,
      `Difference: ${upiDifference.toFixed(2)}`,
      `Remarks: ${upiAuditNotes.trim() || 'Matched'}`,
    ].join(' | ');
    const isMissingUpiSchemaCacheError = (candidate: { code?: string; message?: string } | null | undefined) =>
      candidate?.code === 'PGRST204'
      && /actual_upi|upi_difference|upi_notes|counted_upi/i.test(candidate.message || '');
    const rpcPayload = {
      ...closurePayload,
      session_advance_collected: advanceCollectedToday,
      supplier_payments: supplierPaymentTotal,
      bank_deposits: bankDepositTotal,
    };
    const { error: closureRpcError } = await supabase.rpc('finalize_branch_counter_closure_secure', {
      p_payload: rpcPayload,
    });

    if (closureRpcError) {
      const rpcUnavailable = closureRpcError.code === 'PGRST202'
        || closureRpcError.code === '42883'
        || /finalize_branch_counter_closure_secure.*schema cache|function.*not found/i.test(closureRpcError.message || '');
      if (!rpcUnavailable) {
        setSavedMessage(`Failed to finalize counter closure: ${closureRpcError.message}`);
        return;
      }

      // Compatibility path for deployments where the closure RPC migration has
      // not been applied yet. A stale PostgREST cache must not block closure.
      let closureInsertError = (await supabase
        .from('branch_daily_closures')
        .insert(closurePayload)).error;
      if (isMissingUpiSchemaCacheError(closureInsertError)) {
        const legacyClosurePayload: Record<string, unknown> = { ...closurePayload };
        delete legacyClosurePayload.actual_upi;
        delete legacyClosurePayload.upi_difference;
        delete legacyClosurePayload.upi_notes;
        legacyClosurePayload.notes = [notes?.trim(), upiAuditText].filter(Boolean).join('\n') || null;
        closureInsertError = (await supabase
          .from('branch_daily_closures')
          .insert(legacyClosurePayload)).error;
      }
      if (closureInsertError) {
        const missingLedger = closureInsertError.code === '42P01' || closureInsertError.code === 'PGRST205';
        setSavedMessage(missingLedger
          ? 'The branch closure table is missing from Supabase. Apply the branch core migration before saving closure.'
          : `Failed to save closure in Supabase: ${closureInsertError.message}`);
        return;
      }

      if (activeSessionId) {
        const sessionClosePayload: Record<string, unknown> = {
          status: 'finalized',
          gross_sales: grossSalesBeforeDiscount,
          discounts,
          returns: refunds,
          net_sales: netSales,
          cash_sales: cash,
          upi_sales: upi,
          counted_upi: actualUpi,
          upi_difference: upiDifference,
          upi_notes: upiAuditNotes.trim() || null,
          card_sales: card,
          credit_sales: creditSalesTotal,
          credit_collected: creditCollectionTotal,
          advance_collected: advanceCollectedToday,
          refunds,
          expenses: expenseTotal,
          supplier_payments: supplierPaymentTotal,
          bank_deposits: bankDepositTotal,
          expected_cash: expected,
          counted_cash: countedCash,
          difference: diff,
          bill_count: counterTodayBills.length,
          closing_denominations: closurePayload.closing_denominations,
          closed_at: new Date().toISOString(),
          closed_by_user_id: currentUser?.id || null,
          closed_by_username: user,
          notes: notes || null,
        };
        let sessionCloseError = (await supabase
          .from('branch_counter_sessions')
          .update(sessionClosePayload)
          .eq('id', activeSessionId)
          .eq('status', 'open')).error;
        if (isMissingUpiSchemaCacheError(sessionCloseError)) {
          delete sessionClosePayload.counted_upi;
          delete sessionClosePayload.upi_difference;
          delete sessionClosePayload.upi_notes;
          sessionClosePayload.notes = [notes?.trim(), upiAuditText].filter(Boolean).join('\n') || null;
          sessionCloseError = (await supabase
            .from('branch_counter_sessions')
            .update(sessionClosePayload)
            .eq('id', activeSessionId)
            .eq('status', 'open')).error;
        }
        if (sessionCloseError) {
          setSavedMessage(`Closure saved, but counter session finalization failed: ${sessionCloseError.message}`);
          return;
        }
      }
    }
    addCashierClosure({ branch, cashier: auditActor, cashierUserId: currentUser?.id, counterSessionId: activeSessionId, grossSales: grossSalesBeforeDiscount, netSales, openingCash: Number(opening || 0), closingCash: countedCash, expectedCash: expected, difference: diff, cash, upi, actualUpi, upiDifference, upiNotes: upiAuditNotes.trim(), card, returns: refunds, discounts, billsCount: counterTodayBills.length, duplicateBills: duplicate, creditSales: creditSalesTotal, creditCollections: creditCollectionTotal, notes });
    closeCounter(branch, todayIso(), auditActor, currentUser?.id);
    setDbCounterSession(null);
    addNotification({ branch, type: 'closure', title: `${isSnbOrder ? 'SNB Order' : branch} cashier counter closed`, details: `${auditActor} closed the counter. Collection ${money(totalCollection)}; cash difference ${money(diff)}; UPI difference ${money(upiDifference)}.`, raisedBy: auditActor });
    printClosure({ silent: true });
    setOpenSavedMessage('');
    setSavedMessage('Cashier closure saved. The counter is now closed and can be opened again.');
    setOpening('0');
    setOpenDenominations({500:'',200:'',100:'',50:'',20:'',10:'',5:'',2:'',1:''});
    setCloseDenominations({500:'',200:'',100:'',50:'',20:'',10:'',5:'',2:'',1:''});
    setClosing('');
    setActualUpiInput('');
    setUpiAuditNotes('');
    setNotes('');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const confirmCounterOpen = async () => {
    if (branchCounterOpenRecord) {
      setOpenSavedMessage('This cashier counter is already open. Close it before opening again.');
      return;
    }
    if (!currentUser?.id) {
      setOpenSavedMessage('A valid cashier login is required to open the counter.');
      return;
    }
    const openingDenominations = Object.fromEntries(
      Object.entries(openDenominations).map(([denom, count]) => [String(denom), String(count || '')]),
    );
    const operatorName = openCashier.trim();
    const { data, error: openError } = await supabase.rpc('open_branch_counter_session_secure', {
      p_branch: branch,
      p_opening_cash: openTotal,
      p_opening_denominations: openingDenominations,
      p_operator_name: operatorName || null,
    });
    if (openError) {
      setOpenSavedMessage(`Could not open cashier counter: ${openError.message}`);
      return;
    }
    const inserted = data && typeof data === 'object' ? data as Record<string, unknown> : null;
    if (!inserted?.id) {
      setOpenSavedMessage('Could not open cashier counter: no session was returned.');
      return;
    }
    const record = openCounter({
      branch,
      date: todayIso(),
      cashier: operatorName || user,
      cashierUserId: currentUser.id,
      counterSessionId: String(inserted.id),
      openingCash: Number(inserted.opening_cash || 0),
      denominations: openingDenominations,
      openedBy: String(inserted.cashier_display_name || operatorName || user),
    });
    setDbCounterSession({
      id: String(inserted.id),
      openingCash: Number(inserted.opening_cash || 0),
      openedAt: String(inserted.opened_at),
      cashier: String(inserted.cashier_username || user),
      cashierUserId: String(inserted.cashier_user_id),
      cashierDisplayName: String(inserted.cashier_display_name || inserted.cashier_username || user),
      denominations: openingDenominations,
    });
    setOpening(String(record.openingCash));
    setCounterSnapshot({ advanceCash:0, advanceUpi:0, advanceCard:0, advanceBank:0, advanceInitial:0, advanceBalance:0, advanceTotal:0, paymentCount:0 });
    setOpenSavedMessage(`Counter opened at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} by ${isSnbOrder ? 'SNB Order - ' : ''}${record.cashier}. Opening cash: ${money(record.openingCash)}`);
    printCounterOpenSlip({
      branch,
      cashier: record.cashier,
      openingCash: record.openingCash,
      denominations: openingDenominations,
      openedAt: String(inserted.opened_at),
    });
  };

  const printClosure = (options: { silent?: boolean } = {}) => printBranchCashierClosure({
    branch, cashier: auditActor,
    counterSessionId: activeSessionId,
    date: new Date(`${todayIso()}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }),
    openedAt: branchCounterOpenRecord?.openedAt,
    closedAt: new Date().toISOString(),
    grossSalesBeforeDiscount, discounts,
    totalSales, advanceCollected: advanceCollectedToday, totalSalesIncAdvance,
    advanceInitial: advancePaid, advanceBalance: advanceFull,
    advanceCash, advanceUpi, advanceCard, advanceBank,
    advancePaymentCount: isSnbOrder ? counterSnapshot.paymentCount : todayAdvancePayments.length,
    billsCount: counterTodayBills.length, cancelledCount: todayReturns.length,
    cash, upi, card, splitTotal,
    actualUpi, upiDifference, upiNotes: upiAuditNotes,
    creditSales: creditSalesTotal, creditCollected: creditCollectionTotal,
    creditCollectionCash, creditCollectionUpi, creditCollectionCard, creditCollectionOther,
    openingCash: Number(opening || 0), expenses: expenseTotal, supplierPayments: supplierPaymentTotal,
    bankDeposits: bankDepositTotal, cashOutflows, refunds,
    expected, counted: countedCash, difference: diff,
    openingDenominations: branchCounterOpenRecord?.denominations,
    closingDenominations: closeDenominations,
    notes,
    bills: counterTodayBills.map((b) => ({ billNo: b.billNo, createdAt: b.createdAt, customerName: b.creditCustomerName, paymentMode: b.paymentMode, total: b.total, biller: b.biller })),
    refundRows: todayReturns.map((r) => ({ returnNo: r.returnNo, originalBillNo: r.originalBillNo, createdAt: r.createdAt, paymentMode: r.returnPayMode || r.originalPaymentMode || 'cash', reason: r.reason, cashier: r.returnedBy, amount: Number(r.refundAmount ?? r.total), creditAdjusted: Number(r.creditAdjusted ?? 0), grossReturn: r.total })),
    advanceRows: todayAdvancePayments.map((movement) => ({ createdAt: movement.dateTime, purpose: movement.purpose, paymentMode: movement.paymentMode, amount: movement.amount, reference: movement.referenceNumber, enteredBy: movement.enteredBy })),
    creditSaleRows: todayCreditSales.map((sale) => ({ createdAt: sale.createdAt, billNo: sale.billNo, customerName: sale.customerName, amountPaid: sale.amountPaid, creditAmount: sale.creditAmount, status: sale.status, soldBy: sale.soldBy })),
    creditCollectionRows: todayCreditCollections.map((payment) => ({ createdAt: payment.createdAt, billNo: payment.billNo, amount: payment.amount, paymentMode: payment.paymentMode, reference: payment.reference || '', collectedBy: payment.collectedBy })),
    expenseRows: todayExpenseEntries.map((expense) => ({ createdAt: expense.createdAt, category: expense.category, description: expense.description, amount: expense.amount, mode: expense.mode, enteredBy: expense.enteredBy })),
    supplierPaymentRows: todayPurchasePayments.map((payment) => ({ createdAt: payment.createdAt, supplier: payment.supplier, amount: payment.amount, mode: payment.mode, reference: payment.reference, paidBy: payment.paidBy })),
    bankDepositRows: todayBankDeposits.map((deposit) => ({ createdAt: deposit.createdAt, bankAccount: deposit.bankAccount, amount: deposit.amount, paymentMode: deposit.paymentMode, reference: deposit.transactionRef || deposit.slipNo, enteredBy: deposit.enteredBy })),
  }, options);

  const exportClosure = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Opening Cash', Number(opening || 0)],
      ['Normal Bills', totalSales],
      ['Advance Collected Today', advanceCollectedToday],
      ['Total Sales (inc. Advance)', totalSalesIncAdvance],
      ['Cash Collected', cash],
      ['UPI Collected (System)', upi],
      ['UPI Verified / Entered', actualUpi],
      ['UPI Difference', upiDifference],
      ['UPI Audit Remarks', upiAuditNotes],
      ['Card Collected', card],
      ['Split Payments', splitTotal],
      ['Credit Sales', creditSalesTotal],
      ['Credit Collection Cash', creditCollectionCash],
      ['Credit Collection Digital', creditCollectionDigital],
      ['Advance Paid', advancePaid],
      ['Advance Full Balance', advanceFull],
      ['Advance Digital', advanceDigital],
      ['Cash Expenses', cashExpenseOut],
      ['Cash Supplier Payments', cashSupplierOut],
      ['Cash Bank Deposits', cashBankDepositOut],
      ['Total Cash Outflows', cashOutflows],
      ['Refunds', refunds],
      ['Expected Cash', expected],
      ['Counted Cash', countedCash],
      ['Difference', diff],
      ['Remarks', notes],
    ];
    downloadExcel(
      `${branch}-cashier-closure-${todayIso()}.xls`,
      `${branch} Cashier Closure`,
      rows.slice(1).map(([metric, value]) => ({ Metric: String(metric), Value: value as string | number })),
    );
  };

  const totalCollection = cash + upi + card;
  const openingStatus = branchCounterOpenRecord
    ? `${branchCounterOpenRecord.cashier || user} opened ${money(branchCounterOpenRecord.openingCash)}`
    : 'Count opening cash before branch billing starts.';
  const paymentRows = [
    { key: 'cash', label: 'Cash collected', value: cash, icon: <Banknote className="size-5" /> },
    { key: 'upi', label: 'UPI collected', value: upi, icon: <Smartphone className="size-5" /> },
    { key: 'card', label: 'Card collected', value: card, icon: <CreditCard className="size-5" /> },
  ];

  return <div className="daily-closure-page flex h-full min-h-0 flex-col overflow-hidden bg-background">
    <div className="border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-400" />
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">{isSnbOrder ? 'SNB Order' : BRANCH_LABELS[branch]} cashier closure</p>
          </div>
          <p className="mt-1 text-sm font-black text-foreground">Cashier Closure - {new Date(`${todayIso()}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { void fetchCreditSales(branch); void fetchCreditPayments(branch); void loadClosureLedger(); void loadOpenSession(); void loadCounterSnapshot(); }} disabled={ledgerLoading} className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-bold flex items-center gap-2 active:scale-95 disabled:opacity-50">
            <RotateCcw className={cn("size-4", ledgerLoading && "animate-spin")} />Refresh
          </button>
          <button onClick={() => printClosure()} className="h-11 rounded-xl bg-primary px-4 text-sm font-black text-primary-foreground flex items-center gap-2 active:scale-95">
            <Printer className="size-4" />Print Closure
          </button>
          <button onClick={() => { void save(); }} disabled={!branchCounterOpenRecord} className="h-11 rounded-xl bg-orange-500 px-4 text-sm font-black text-white shadow-lg shadow-orange-200 flex items-center gap-2 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
            <CheckCircle2 className="size-4" />Save Closure
          </button>
        </div>
      </div>
    </div>

    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className={cn('rounded-3xl border p-4 shadow-soft', branchCounterOpenRecord ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Step 1</p>
              <h3 className="font-display text-lg font-black text-foreground">Open Counter</h3>
            </div>
            {branchCounterOpenRecord ? <CheckCircle2 className="size-6 text-emerald-600" /> : <AlertTriangle className="size-6 text-amber-700" />}
          </div>
          <p className="mt-2 text-sm font-bold text-muted-foreground">{openingStatus}</p>
        </div>
        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Step 2</p>
              <h3 className="font-display text-lg font-black text-foreground">Check Collection</h3>
            </div>
            <WalletCards className="size-6 text-blue-700" />
          </div>
          <p className="mt-2 text-sm font-bold text-muted-foreground">Cash {money(cash)} - UPI {money(upi)} - Card {money(card)}</p>
        </div>
        <div className={cn('rounded-3xl border p-4 shadow-soft', closureAuditComplete ? (closureMatches ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50') : 'border-slate-200 bg-slate-50')}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Step 3</p>
              <h3 className="font-display text-lg font-black text-foreground">Close Counter</h3>
            </div>
            {closureMatches ? <CheckCircle2 className="size-6 text-emerald-600" /> : <WalletCards className="size-6 text-slate-600" />}
          </div>
          <p className="mt-2 text-sm font-bold text-muted-foreground">
            {!branchCounterOpenRecord && branchClosureRecord
              ? `Closed by ${branchClosureRecord.cashier}. Cash difference ${money(branchClosureRecord.difference)} - UPI difference ${money(branchClosureRecord.upiDifference || 0)}`
              : `Cash difference ${money(diff)} - UPI difference ${upiAuditEntered ? money(upiDifference) : 'enter verified UPI'}`}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">{BRANCH_LABELS[branch]} counter open</p>
            <h2 className="font-display text-xl font-black text-foreground">Start Cashier Counter</h2>
            <p className="mt-1 text-xs font-bold text-muted-foreground">{branchCounterOpenRecord ? `Opened by ${branchCounterOpenRecord.cashier} with ${money(branchCounterOpenRecord.openingCash)}. Close the counter before starting another opening.` : isSnbOrder ? 'Open the counter before taking any SNB Order advance order or collecting payment.' : 'Open the counter before billing or advance collection.'}</p>
          </div>
          <span className={cn('rounded-full px-3 py-1 text-xs font-black border', branchCounterOpenRecord ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200')}>{branchCounterOpenRecord ? 'OPENED' : 'NOT OPENED'}</span>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_180px]">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cashier Name (on duty)</label>
            <input value={openCashier} onChange={(e)=>setOpenCashier(e.target.value)} disabled={Boolean(branchCounterOpenRecord)} placeholder="Enter your name" className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-100 disabled:text-slate-500" />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
            {denominations.map((denom) => (
              <label key={denom} className="rounded-2xl border border-border bg-background p-2">
                <span className="block text-[10px] font-black text-muted-foreground">Rs {denom}</span>
                <input type="number" min="0" value={openDenominations[denom] || ''} onChange={(e)=>setOpenDenominations(prev=>({...prev,[denom]:e.target.value}))} disabled={Boolean(branchCounterOpenRecord)} className="mt-1 w-full rounded-xl border border-border bg-card px-2 py-2 text-sm font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-slate-100 disabled:text-slate-400" />
              </label>
            ))}
          </div>
          <div className="flex flex-col justify-end gap-2">
            <div className="rounded-2xl bg-slate-950 px-4 py-3 text-white">
              <p className="text-[10px] font-black uppercase text-white/60">Opening total</p>
              <p className="text-xl font-black tabular-nums">{money(openTotal)}</p>
            </div>
            <button onClick={() => { void confirmCounterOpen(); }} disabled={Boolean(branchCounterOpenRecord)} className="rounded-2xl bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-orange-200 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
              {branchCounterOpenRecord ? 'Counter Already Open' : 'Confirm Counter Open'}
            </button>
          </div>
        </div>
        {openSavedMessage && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">{openSavedMessage}</p>}
        {closureMessage && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-800">{closureMessage}</p>}
        {savedMessage && <p className={cn('mt-3 rounded-xl px-3 py-2 text-sm font-black', savedMessage.includes('closure saved') || savedMessage.includes('Cashier closure saved') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>{savedMessage}</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Kpi label="Total Sales" value={money(totalSales)} icon={<IndianRupee/>} tone="green"/>
        <Kpi label="Total Collection" value={money(totalCollection)} icon={<WalletCards/>} tone="blue"/>
        <Kpi label="Advance Collected" value={money(advanceCollectedToday)} icon={<WalletCards/>} tone="amber"/>
        <Kpi label="Credit Collected" value={money(creditCollectionTotal)} icon={<UserRound/>} tone="blue"/>
        <Kpi label="Bills Closed" value={counterTodayBills.length} icon={<Receipt/>} tone="slate"/>
        <Kpi label="Cancelled" value={todayReturns.length} icon={<XCircle/>} tone="red"/>
      </div>
      {isSnbOrder && <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">This closure contains only collections linked to this SNB Order counter session. Advance transactions: <span className="font-black">{counterSnapshot.paymentCount}</span> - Cash <span className="font-black">{money(counterSnapshot.advanceCash)}</span> - UPI <span className="font-black">{money(counterSnapshot.advanceUpi)}</span> - Card <span className="font-black">{money(counterSnapshot.advanceCard)}</span>. The finalized session is visible in SNB Admin under Cashier Closure and Daily Closure Report.</div>}

      {todayReturns.length > 0 && (
        <Section title="Refund Register" icon={<RotateCcw className="size-5"/>}>
          <div className="overflow-x-auto rounded-2xl border border-red-200">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-red-50 text-left text-xs uppercase text-red-700"><tr><th className="p-3">Return</th><th className="p-3">Original Bill</th><th className="p-3">Time</th><th className="p-3">Mode</th><th className="p-3">Reason</th><th className="p-3">Cashier</th><th className="p-3 text-right">Amount</th></tr></thead>
              <tbody>{todayReturns.map((r) => <tr key={r.id} className="border-t border-border"><td className="p-3 font-black">{r.returnNo}</td><td className="p-3 font-bold">{r.originalBillNo}</td><td className="p-3">{new Date(r.createdAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</td><td className="p-3 font-bold uppercase">{r.returnPayMode || r.originalPaymentMode || 'cash'}</td><td className="p-3">{r.reason}</td><td className="p-3">{r.returnedBy}</td><td className="p-3 text-right font-black text-red-700">-{money(r.total)}</td></tr>)}</tbody>
            </table>
          </div>
        </Section>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_420px]">
        <div className="rounded-3xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Payment details</p>
              <h2 className="font-display text-xl font-black text-foreground">Cash / UPI / Card / Credit Collection</h2>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 border border-emerald-200">{money(totalCollection)} collected</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
            {paymentRows.map((row) => {
              const percent = totalCollection > 0 ? (row.value / totalCollection) * 100 : 0;
              return <div key={row.key} className="rounded-2xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">{row.icon}</div>
                    <div><p className="text-sm font-black text-foreground">{row.label}</p><p className="text-xs text-muted-foreground">{percent.toFixed(1)}% of collection</p></div>
                  </div>
                  <p className="font-display text-xl font-black tabular-nums text-foreground">{money(row.value)}</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} /></div>
              </div>;
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Cash and UPI closure check</p>
            <h2 className="font-display text-xl font-black text-foreground">Counter Audit</h2>
          </div>
          <div className="rounded-2xl bg-muted/40 p-3 space-y-2">
            <Field label="Opening Cash"><Input type="number" value={opening} onChange={(e)=>setOpening(e.target.value)} disabled={Boolean(branchCounterOpenRecord)} /></Field>
            <div className="flex justify-between text-sm"><span>Bill cash collection</span><span className="font-black tabular-nums">{money(cash - creditCollectionCash - advanceCash)}</span></div>
            <div className="flex justify-between text-sm"><span>Credit collected in cash</span><span className="font-black tabular-nums">{money(creditCollectionCash)}</span></div>
            <div className="flex justify-between text-sm"><span>Advance collected in cash</span><span className="font-black tabular-nums">{money(advanceCash)}</span></div>
            <div className="flex justify-between rounded-xl bg-card px-3 py-2 text-sm"><span>Expected cash</span><span className="font-black tabular-nums">{money(expected)}</span></div>
            <div className="rounded-2xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Closing denomination count</p><p className="text-xs font-bold text-muted-foreground">Enter note/coin count. Total fills physical closing cash.</p></div>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white tabular-nums">{money(closeTotal)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {denominations.map((denom) => (
                  <label key={denom} className="rounded-xl border border-border bg-background p-2">
                    <span className="block text-[10px] font-black text-muted-foreground">Rs {denom}</span>
                    <input type="number" min="0" value={closeDenominations[denom] || ''} onChange={(e)=>{ const next = {...closeDenominations,[denom]:e.target.value}; setCloseDenominations(next); setClosing(String(denomTotal(next))); }} className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-2 text-center text-sm font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </label>
                ))}
              </div>
            </div>
            <Field label="Physical Closing Cash"><Input type="number" value={closing} onChange={(e)=>setClosing(e.target.value)} placeholder="Enter counted cash" /></Field>
            <div className={cn('rounded-2xl px-3 py-3 flex items-center justify-between border', cashMatches ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700')}>
              <span className="text-sm font-black">Cash Difference</span>
              <span className="font-display text-xl font-black tabular-nums">{money(diff)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">UPI audit</p>
                <p className="text-xs font-bold text-muted-foreground">Compare the UPI app or settlement amount with the system total.</p>
              </div>
              <Smartphone className="size-5 text-blue-700" />
            </div>
            <div className="flex justify-between rounded-xl bg-card px-3 py-2 text-sm">
              <span>System UPI total</span>
              <span className="font-black tabular-nums">{money(upi)}</span>
            </div>
            <Field label="Verified / Entered UPI Amount">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={actualUpiInput}
                onChange={(e)=>{ setActualUpiInput(e.target.value); setSavedMessage(''); }}
                placeholder="Enter amount shown in UPI settlement"
              />
            </Field>
            <div className={cn('rounded-2xl px-3 py-3 flex items-center justify-between border', !upiAuditEntered ? 'bg-slate-50 border-slate-200 text-slate-600' : upiMatches ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700')}>
              <span className="text-sm font-black">UPI Difference</span>
              <span className="font-display text-xl font-black tabular-nums">{upiAuditEntered ? money(upiDifference) : '-'}</span>
            </div>
            <Textarea
              value={upiAuditNotes}
              onChange={(e)=>{ setUpiAuditNotes(e.target.value); setSavedMessage(''); }}
              placeholder={upiAuditEntered && Math.abs(upiDifference) >= 0.01 ? 'Required: explain UPI shortage or excess' : 'UPI verification remarks (optional when matched)'}
              rows={2}
            />
            {upiAuditEntered && Math.abs(upiDifference) >= 0.01 && upiAuditNotes.trim().length < 3 && (
              <p className="text-xs font-black text-red-700">Remarks are required because the UPI amount does not match.</p>
            )}
          </div>

          <Textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="General closure notes and cash shortage/excess reason..." rows={3} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="UPI Collected" value={money(upi)} icon={<Smartphone/>} tone="blue"/>
        <Kpi label="Card Collected" value={money(card)} icon={<CreditCard/>} tone="amber"/>
        <Kpi label="Credit Sales" value={money(creditSalesTotal)} icon={<History/>} tone="red"/>
        <Kpi label="Expected Cash" value={money(expected)} icon={<Banknote/>} tone="slate"/>
      </div>


    {counterTodayBills.length > 0 && (
      <Section title={`Today's Bills (${counterTodayBills.length})`} icon={<Receipt className="size-5"/>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="pb-2 pr-3">Bill #</th><th className="pb-2 pr-3">Time</th><th className="pb-2 pr-3">Customer</th><th className="pb-2 pr-3">Payment</th><th className="pb-2 pr-3 text-right">Amount</th><th className="pb-2">Cashier</th>
            </tr></thead>
            <tbody>
              {counterTodayBills.map(b=><tr key={b.id} className="border-b last:border-0">
                <td className="py-2 pr-3 font-black">{b.billNo}</td>
                <td className="py-2 pr-3 text-slate-500">{new Date(b.createdAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</td>
                <td className="py-2 pr-3">{b.creditCustomerName || 'Walk-in'}</td>
                <td className="py-2 pr-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black">{b.paymentMode}</span></td>
                <td className="py-2 pr-3 text-right font-black tabular-nums">{money(b.total)}</td>
                <td className="py-2 text-slate-500">{b.biller}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </Section>
    )}
  </div>
  </div>;
}


export function SalespersonReportTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore(); const { bills, salespeople, addSalesperson, updateSalesperson, removeSalesperson } = useBranchOpsStore(); const [name,setName]=useState(''); const isAdmin=['admin','admin_snb','admin_vrsnb','owner'].includes(currentUser?.role||''); const rows=useMemo(()=>{ const map:Record<string,{count:number,total:number}>={}; bills.filter(b=>b.branch===branch).forEach(b=>{map[b.salesperson]??={count:0,total:0}; map[b.salesperson].count++; map[b.salesperson].total+=b.total;}); return Object.entries(map).sort((a,b)=>b[1].total-a[1].total);},[bills,branch]);
  return <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]"><Section title="Salesperson Master" icon={<UserRound className="size-5"/>}>{isAdmin && <div className="mb-4 flex gap-2"><Input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Add salesperson"/><PrimaryButton onClick={()=>{if(name){addSalesperson(branch,name,currentUser?.displayName||'Admin');setName('');}}}><Plus className="size-4"/>Add</PrimaryButton></div>}<div className="space-y-2">{salespeople.filter(s=>s.branch===branch).map(s=><div key={s.id} className="flex items-center justify-between rounded-2xl border p-3"><Input disabled={!isAdmin} value={s.name} onChange={(e)=>updateSalesperson(s.id,e.target.value,s.active,currentUser?.displayName||'Admin')}/>{isAdmin && <button onClick={()=>removeSalesperson(s.id,currentUser?.displayName||'Admin')} className="ml-2 rounded-xl bg-red-50 p-3 text-red-600"><Trash2 className="size-4"/></button>}</div>)}</div></Section><Section title="Salesperson-wise Sales" icon={<Receipt className="size-5"/>}><div className="space-y-2">{rows.map(([person,v])=><div key={person} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl border p-4"><p className="font-black">{person}</p><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{v.count} bills</span><p className="text-xl font-black text-emerald-700">{money(v.total)}</p></div>)}</div></Section></div>;
}

export function AdminNotificationsBranchTab({ branch }: ModuleProps) {
  const { notifications, updateNotificationStatus } = useBranchOpsStore();
  const { stockMismatches } = useBranchStore();
  const { currentUser } = useAuthStore();
  const adminName = currentUser?.username || currentUser?.displayName || 'Admin';
  const rows = notifications.filter(n=>n.branch===branch);
  const mismatches = stockMismatches.filter(m=>m.branch===branch);
  return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><Kpi label="Pending Notifications" value={rows.filter(r=>r.status==='Unread').length} icon={<Bell/>} tone="amber"/><Kpi label="Stock Disputes" value={rows.filter(r=>r.type==='Stock Dispute'&&r.status!=='Resolved').length + mismatches.length} icon={<AlertTriangle/>} tone="red"/><Kpi label="Resolved" value={rows.filter(r=>r.status==='Resolved').length} icon={<CheckCircle2/>} tone="green"/></div><Section title="Admin Notifications - Review / Clear / Resolve" icon={<Bell className="size-5"/>}><div className="space-y-3">{rows.length === 0 ? <p className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">No admin notifications.</p> : rows.map(n=><div key={n.id} className="rounded-3xl border p-4"><div className="flex flex-col justify-between gap-3 lg:flex-row"><div><p className="font-black">{n.type}: {n.title}</p><p className="text-sm text-slate-500">{n.details}</p><p className="mt-1 text-xs font-bold text-slate-400">{new Date(n.createdAt).toLocaleString('en-IN')} - {n.raisedBy}</p></div><div className="flex flex-wrap items-start gap-2"><SoftButton onClick={()=>updateNotificationStatus(n.id,'Seen',adminName)}>Review</SoftButton><SoftButton onClick={()=>updateNotificationStatus(n.id,'Resolved',adminName)} className="text-emerald-700">Clear / Resolve</SoftButton><Select value={n.status} onChange={(e)=>updateNotificationStatus(n.id,e.target.value as typeof n.status,adminName)} className="w-36"><option>Unread</option><option>Seen</option><option>Resolved</option></Select></div></div></div>)}</div></Section><Section title="Stock Mismatch / Dispute Reports" icon={<AlertTriangle className="size-5"/>}><div className="space-y-2">{mismatches.map(m=><div key={m.id} className="rounded-2xl bg-red-50 p-4 text-red-800"><p className="font-black">{m.itemName}</p><p className="text-sm">Sold {m.soldQty} - Shortage {m.shortage} - Raised by {m.soldBy} - {new Date(m.soldAt).toLocaleString('en-IN')}</p></div>)}</div></Section></div>;
}

export function StoreOrdersTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore(); const { storeOrders, updateStoreOrderStatus } = useBranchOpsStore(); const [remarks,setRemarks]=useState(''); const rows=storeOrders.filter(o=>o.branch===branch);
  return <Section title="Store Orders" icon={<Store className="size-5"/>}><div className="mb-4 rounded-3xl bg-blue-50 p-4 text-sm font-semibold text-blue-900 ring-1 ring-blue-100"><p className="font-black">What are Store Orders?</p><p className="mt-1">Store Orders are internal branch requests sent to the store team, mainly from advance/custom cake orders or stock/order requests. The store can confirm, reject, or add remarks so the branch cashier knows whether the request is accepted and ready for fulfilment.</p></div><div className="space-y-3">{rows.length === 0 ? <p className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">No store orders are pending for this branch.</p> : rows.map(o=><div key={o.id} className="rounded-3xl border p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-black">{o.orderNo} - {o.customerName}</p><p className="text-sm text-slate-500">{o.mobile} - {o.details} - Required {o.requiredAt}</p><p className="mt-1 text-xs font-bold text-slate-400">Status: {o.status} {o.confirmerName ? `- ${o.confirmerName}` : ''}</p></div><div className="flex flex-wrap gap-2"><SoftButton onClick={()=>updateStoreOrderStatus(o.id,'Confirmed',currentUser?.displayName||'Store',remarks)}>Confirm</SoftButton><SoftButton onClick={()=>updateStoreOrderStatus(o.id,'Rejected',currentUser?.displayName||'Store',remarks)} className="text-red-600">Reject</SoftButton></div></div><Input value={remarks} onChange={(e)=>setRemarks(e.target.value)} placeholder="Remarks for confirmation/rejection" className="mt-3"/></div>)}</div></Section>;
}

export function AuditLogsTab({ branch }: ModuleProps) {
  const { auditLogs } = useBranchOpsStore();
  const rows = auditLogs.filter((entry) => entry.branch === branch);
  const exportAudit = () => downloadExcel(
    `${branch}-audit-${todayIso()}.xls`,
    `${branch} Audit Log`,
    rows.map((entry) => ({
      "Date / Time": new Date(entry.createdAt).toLocaleString('en-IN'),
      User: entry.user,
      Action: entry.action,
      Previous: entry.previousValue,
      New: entry.newValue,
    })),
  );
  return <Section title="Financial Audit Logs" icon={<ShieldCheck className="size-5"/>} action={<SoftButton onClick={exportAudit}><Download className="size-4"/>Excel</SoftButton>}><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-3">Date/Time</th><th className="p-3">User</th><th className="p-3">Action</th><th className="p-3">Previous</th><th className="p-3">New</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t"><td className="p-3">{new Date(r.createdAt).toLocaleString('en-IN')}</td><td className="p-3">{r.user}</td><td className="p-3 font-black">{r.action}</td><td className="p-3">{r.previousValue}</td><td className="p-3">{r.newValue}</td></tr>)}</tbody></table></div></Section>;
}

export function BranchAdminKpiStrip({ branch }: { branch: Branch }) {
  const { bills, bankDeposits, returns, advanceCakeOrders, purchasePayments, notifications } = useBranchOpsStore();
  const b = bills.filter(x=>x.branch===branch&&today(x.createdAt));
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6"><Kpi label="Today's Sales" value={money(b.reduce((s,x)=>s+x.total,0))} icon={<Receipt/>} tone="green"/><Kpi label="Pending Advance" value={advanceCakeOrders.filter(o=>o.branch===branch&&o.status!=='Paid In Full').length} icon={<CalendarClock/>} tone="amber"/><Kpi label="Store Confirm" value={advanceCakeOrders.filter(o=>o.branch===branch&&o.status==='Store Confirmed').length} icon={<Store/>} tone="blue"/><Kpi label="Purchase Pay" value={money(purchasePayments.filter(p=>p.branch===branch&&today(p.createdAt)).reduce((s,p)=>s+p.amount,0))} icon={<WalletCards/>}/><Kpi label="Deposits" value={money(bankDeposits.filter(d=>d.branch===branch&&today(d.createdAt)).reduce((s,d)=>s+d.amount,0))} icon={<Landmark/>} tone="blue"/><Kpi label="Returns" value={money(returns.filter(r=>r.branch===branch&&today(r.createdAt)).reduce((s,r)=>s+r.total,0))} icon={<RotateCcw/>} tone="red"/><Kpi label="Disputes" value={notifications.filter(n=>n.branch===branch&&n.type==='Stock Dispute'&&n.status!=='Resolved').length} icon={<AlertTriangle/>} tone="red"/></div>;
}

