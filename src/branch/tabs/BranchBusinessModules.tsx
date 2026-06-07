import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  AlertTriangle, Banknote, Bell, Building2, CalendarClock, CheckCircle2, ClipboardCheck,
  CreditCard, Download, FileClock, FileText, Gift, History, IndianRupee, Landmark, Package,
  Plus, Printer, Receipt, RotateCcw, Search, ShieldCheck, Smartphone, Store, Trash2,
  Truck, UserRound, WalletCards, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useBakeryStore } from '@/bakery/bakeryStore';
import type { BakeryOrderItem } from '@/bakery/types';
import { useBranchStore, type CreditSale, type SaleRecord, type StockItem } from '../branchStore';
import type { Branch } from '../types';
import { BRANCH_LABELS } from '../types';
import {
  money, nextBranchInvoice, useBranchOpsStore,
  type BranchBillItem, type BranchBillRecord,
  type CakeAdvanceOrder, type PurchaseOrderRecord,
} from '../branchOpsStore';
import { SNB_ITEMS } from '../snbItems';
import { VRSNB_ITEMS } from '../vrsnbItems';
import { printCounterBill, printHtml } from '../printUtils';

type ModuleProps = { branch: Branch; branchStock: StockItem[]; branchSales?: SaleRecord[]; onOpenTab?: (tab: string) => void };

type FieldProps = { label: string; children: React.ReactNode };
function Field({ label, children }: FieldProps) {
  return <label className="space-y-1.5"><span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={cn('h-12 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-base font-bold text-slate-900 outline-none focus:border-amber-400', props.className)} />; }
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={cn('h-12 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-base font-bold text-slate-900 outline-none focus:border-amber-400', props.className)} />; }
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={cn('min-h-24 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-900 outline-none focus:border-amber-400', props.className)} />; }
function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={cn('inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5 disabled:opacity-50', props.className)} />; }
function SoftButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={cn('inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50', props.className)} />; }
function Section({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) { return <section className="rounded-[2rem] border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div className="flex items-center gap-3"> <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">{icon}</div><h3 className="text-xl font-black text-slate-950">{title}</h3></div>{action}</div><div className="p-5">{children}</div></section>; }
function Kpi({ label, value, icon, tone = 'slate' }: { label: string; value: string | number; icon: React.ReactNode; tone?: 'slate'|'green'|'amber'|'red'|'blue' }) {
  const styles = { slate: 'bg-slate-950 text-white', green: 'bg-emerald-600 text-white', amber: 'bg-amber-400 text-slate-950', red: 'bg-red-600 text-white', blue: 'bg-blue-600 text-white' };
  return <div className={cn('rounded-[1.7rem] p-5 shadow-sm', styles[tone])}><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">{label}</p>{icon}</div><p className="mt-3 text-3xl font-black tabular-nums">{value}</p></div>;
}

function catalog(branch: Branch) { return branch === 'VRSNB' ? VRSNB_ITEMS : SNB_ITEMS; }
function stockQty(stock: StockItem[], item: string) { return Number(stock.find((s) => s.itemName.toLowerCase() === item.toLowerCase())?.quantity ?? 0); }
function today(d: string) { return new Date(d).toDateString() === new Date().toDateString(); }
function month(d: string) { const x = new Date(d), n = new Date(); return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth(); }
function printAdvanceSalesOrder(payload: {
  branch: Branch;
  orderNo: string;
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
}) {
  const now = new Date();
  const business = payload.branch === 'VRSNB'
    ? { name: 'VRSNB FOODS LLP', lines: ['#109/1C, Hosur main Road, Berigai', 'Soolagiri TK, Krishnagiri DT, Tamilnadu 635105', 'GST NO: 33AAZFV1266C1ZZ | FSSAI NO: 12425011000098'] }
    : { name: 'Sri Nanjundeshwara Bakery', lines: ['404, Bagalur Main Road, Berigai Bus Stand', 'Krishnagiri, Tamil Nadu, Hosur-635105', 'GSTIN: 33AMTPR1760M1ZE'] };
  const itemRows = payload.items.map((item, idx) => `<tr><td>${idx + 1}</td><td>${item.itemName}</td><td class="num">${item.quantity.toFixed(item.unit === 'kg' ? 2 : 0)}</td><td class="num">${item.price.toFixed(2)}</td><td class="num">${item.lineTotal.toFixed(2)}</td></tr>`).join('');
  const qtyTotal = payload.items.reduce((sum, item) => sum + item.quantity, 0);
  const docTitle = payload.fullyPaid ? 'SALES ORDER SLIP' : 'ADVANCE SALES ORDER';
  const html = `<!doctype html><html><head><title>${payload.orderNo}</title><style>@page{size:80mm auto;margin:3mm}body{font-family:Arial,sans-serif;font-size:11px;color:#111}.c{text-align:center}.brand{font-size:20px;font-weight:900}.small{font-size:10px}.doc{font-size:14px;font-weight:900;margin:8px 0}.row{display:flex;justify-content:space-between;gap:8px}.dash{border-top:1px solid #111;margin:5px 0}table{width:100%;border-collapse:collapse}th{border-top:1px solid #111;border-bottom:1px solid #111;font-size:11px;text-align:left;padding:3px 2px}td{padding:3px 2px;vertical-align:top}.num{text-align:right}.total-row td{border-top:1px solid #111;font-weight:900}.net{border-top:1px solid #111;border-bottom:1px solid #111;font-size:14px;font-weight:900;margin-top:4px;padding:4px 0;display:flex;justify-content:space-between}.stamp{border:2px solid #111;padding:4px 8px;text-align:center;font-weight:900;font-size:13px;margin:4px 0}.footer{margin-top:10px;text-align:center;font-size:13px;font-weight:800}</style></head><body><div class="c brand">${business.name}</div><div class="c small">${business.lines.join('<br/>')}</div><div class="c doc">${docTitle}</div>${payload.fullyPaid ? '<div class="stamp">PAID IN FULL</div>' : ''}<div class="dash"></div><div class="row"><span>Order No: ${payload.orderNo}</span><span>Date: ${now.toLocaleDateString('en-GB')}</span></div><div class="row"><span>Customer: ${payload.customerName}</span><span>${payload.mobile}</span></div><div class="row"><span>Delivery: ${payload.deliveryDate} ${payload.deliveryTime || ''}</span></div><div class="dash"></div><table><thead><tr><th>Sn</th><th>Item Name</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amt</th></tr></thead><tbody>${itemRows}<tr class="total-row"><td></td><td>Total Qty: ${qtyTotal.toFixed(0)}</td><td></td><td class="num">Sub Total</td><td class="num">&#x20B9;${payload.orderValue.toFixed(2)}</td></tr></tbody></table><div class="net"><span>Grand Total</span><span>&#x20B9;${payload.orderValue.toFixed(2)}</span></div><div class="row"><span>Advance Paid:</span><span>&#x20B9;${payload.advanceAmount.toFixed(2)} (${payload.paymentMode.toUpperCase()})</span></div>${!payload.fullyPaid ? `<div class="row"><span>Balance Due:</span><span>&#x20B9;${payload.balanceAmount.toFixed(2)}</span></div>` : ''}<div class="dash"></div><div class="c small">Staff: ${payload.staffName}</div><div class="footer">Thank You &amp; Visit Again...!!!</div><script>window.onload=()=>window.print()</script></body></html>`;
  const win = window.open('', '_blank', 'width=420,height=680');
  if (win) { win.document.write(html); win.document.close(); }
}

export function BranchBillHistoryProTab({ branch }: ModuleProps) {
  const { bills, markBillDuplicate } = useBranchOpsStore();
  const { currentUser } = useAuthStore();
  const [query, setQuery] = useState('');
  const isVRSNB = branch === 'VRSNB';
  const rows = bills.filter((b) => {
    const q = query.trim().toLowerCase();
    return b.branch === branch && (!q || b.billNo.toLowerCase().includes(q) || b.biller.toLowerCase().includes(q) || (!isVRSNB && b.salesperson.toLowerCase().includes(q)));
  });
  const reprint = (bill: BranchBillRecord) => {
    markBillDuplicate(bill.id, currentUser?.displayName || 'Staff');
    printCounterBill(bill, true);
  };
  return <Section title="Bill History" icon={<History className="size-5"/>} action={<div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={isVRSNB ? 'Search bill or cashier' : 'Search bill or salesperson'} className="pl-9"/></div>}><div className="overflow-x-auto"><table className={cn('w-full text-sm', isVRSNB ? 'min-w-[760px]' : 'min-w-[850px]')}><thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Bill</th><th className="p-3">Time</th>{!isVRSNB && <th className="p-3">Salesperson</th>}<th className="p-3">Cashier</th><th className="p-3">Mode</th><th className="p-3 text-right">Total</th><th className="p-3">Print Status</th><th className="p-3 text-right">Action</th></tr></thead><tbody>{rows.map(b=><tr key={b.id} className="border-t"><td className="p-3 font-black">{b.billNo}</td><td className="p-3">{new Date(b.createdAt).toLocaleString('en-IN')}</td>{!isVRSNB && <td className="p-3">{b.salesperson}</td>}<td className="p-3">{b.biller}</td><td className="p-3 uppercase">{b.paymentMode}</td><td className="p-3 text-right font-black">{money(b.total)}</td><td className="p-3"><span className={cn('rounded-full px-2 py-1 text-xs font-black', b.printCount > 1 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>{b.printCount > 1 ? 'Duplicate Printed' : 'Original Bill'}</span></td><td className="p-3 text-right"><SoftButton onClick={()=>reprint(b)}><Printer className="size-4"/>Duplicate</SoftButton></td></tr>)}</tbody></table></div></Section>;
}


export function CreditSalesTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore();
  const { creditSales, fetchCreditSales, fetchCreditPayments, settleCreditSale } = useBranchStore();
  const user = currentUser?.displayName || currentUser?.username || 'Cashier';
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
    const csvRows = [
      ['Bill No', 'Customer', 'Mobile', 'Date', 'Due Date', 'Total', 'Paid', 'Balance', 'Status', isVRSNB ? 'Cashier' : 'Salesperson', 'Remarks'],
      ...rows.map((r) => [r.billNo, r.customerName, r.customerPhone || '', new Date(r.createdAt).toLocaleString('en-IN'), r.dueDate, r.subtotal, r.amountPaid, r.creditAmount, r.status, r.soldBy, r.notes || '']),
    ];
    const blob = new Blob([csvRows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${branch}-credit-sales.csv`;
    a.click();
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
export function AdvanceCakeOrdersTab({ branch, branchStock }: ModuleProps) {
  const { currentUser } = useAuthStore();
  const { advanceCakeOrders, salespeople, addAdvanceCakeOrder, updateAdvanceStatus, addCashMovement } = useBranchOpsStore();
  const submitBakeryOrder = useBakeryStore((s) => s.submitOrder);
  const { manualUpdateStock, fetchBranchData } = useBranchStore();
  const isVRSNB = branch === 'VRSNB';
  const user = currentUser?.displayName || currentUser?.username || 'Cashier';
  const items = catalog(branch);
  const people = isVRSNB ? [] : salespeople.filter((p)=>p.branch===branch && p.active).map((p)=>p.name);
  const [mode, setMode] = useState<'store' | 'custom' | 'cake'>('store');
  const [finalPaymentMode, setFinalPaymentMode] = useState<'cash' | 'upi' | 'card'>('cash');
  const [pipelineView, setPipelineView] = useState<'active' | 'history'>('active');
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [collectMode, setCollectMode] = useState<'cash' | 'upi' | 'card'>('cash');
  const [common, setCommon] = useState({ customerName:'', mobile:'', deliveryDate:'', deliveryTime:'', advanceAmount:'', paymentMode:'cash', salesperson:'' });
  const [storePick, setStorePick] = useState({ itemName: items[0]?.name || '', quantity:'1' });
  const [storeLines, setStoreLines] = useState<BranchBillItem[]>([]);
  const [storeFullyPaid, setStoreFullyPaid] = useState(false);
  const [customFullyPaid, setCustomFullyPaid] = useState(false);
  const [custom, setCustom] = useState({ itemName:'', quantity:'1', unit:'pcs' as 'pcs' | 'kg', price:'', notes:'', attachmentName:'', attachmentDataUrl:'' });
  const [cake, setCake] = useState({ cakeKg:'', flavor:'', shape:'', messageOnCake:'', designNotes:'', orderValue:'', attachmentName:'', attachmentDataUrl:'' });
  const [error, setError] = useState('');
  const orders = advanceCakeOrders.filter((o)=>o.branch===branch);
  const activeOrders = orders.filter((o) => o.status !== 'Paid In Full');
  const historyOrders = orders.filter((o) => o.status === 'Paid In Full');
  const staff = isVRSNB ? user : common.salesperson;

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
    const available = stockQty(branchStock, item.name);
    const existingQty = storeLines.filter((line)=>line.itemName===item.name).reduce((s,line)=>s+line.quantity,0);
    if (qty + existingQty > available) { setError(`Only ${available} available for ${item.name}.`); return; }
    const unit: 'pcs' | 'kg' = item.uom === 'Kgs' ? 'kg' : 'pcs';
    const line: BranchBillItem = { itemName:item.name, quantity:qty, unit, price:item.price, tax:0, discount:0, lineTotal:qty * item.price };
    setStoreLines((lines)=>[...lines, line]);
    setStorePick((f)=>({...f, quantity:'1'}));
    setError('');
  };
  const removeStoreLine = (idx: number) => setStoreLines((lines)=>lines.filter((_, i)=>i!==idx));
  const storeValue = storeLines.reduce((s,l)=>s+l.lineTotal,0);

  // When storeFullyPaid toggled on, auto-fill advance amount
  const handleStoreFullyPaid = (checked: boolean) => {
    setStoreFullyPaid(checked);
    if (checked) updateCommon('advanceAmount', String(storeValue));
    else updateCommon('advanceAmount', '');
  };
  const handleCustomFullyPaid = (checked: boolean) => {
    setCustomFullyPaid(checked);
    const customValue = Number(custom.quantity || 0) * Number(custom.price || 0);
    if (checked) updateCommon('advanceAmount', String(customValue));
    else updateCommon('advanceAmount', '');
  };

  const validateCommon = (value: number) => {
    const adv = Number(common.advanceAmount || 0);
    if (!common.customerName.trim() || !common.mobile.trim() || !common.deliveryDate) return 'Customer name, mobile number and delivery date are mandatory.';
    if (!isVRSNB && !common.salesperson) return 'Salesperson is mandatory.';
    if (value <= 0 || adv < 0 || adv > value) return 'Check order value and advance amount.';
    return '';
  };
  const sendToStoreDashboard = async (order: CakeAdvanceOrder, lines: BranchBillItem[]) => {
    if (!isVRSNB || mode === 'store') return;
    const bakeryItems: BakeryOrderItem[] = lines.map((line, idx) => ({
      itemId: `${order.orderNo}-${idx}`,
      itemName: line.itemName,
      quantity: line.quantity,
      isCustom: true,
      dispatchUnit: line.unit,
    }));
    const notes = `${order.orderNo} | ${order.customerName} | ${order.mobile} | Delivery ${order.deliveryDate} ${order.deliveryTime || ''} | ${order.designNotes || ''}${order.attachmentName ? ` | Attachment: ${order.attachmentName}` : ''}`;
    await submitBakeryOrder(bakeryItems, `${user} - VRSNB advance`, 'VRSNB', notes);
  };
  const sendCakeToStoreDashboard = async (order: CakeAdvanceOrder) => {
    if (!isVRSNB) return;
    const bakeryItems: BakeryOrderItem[] = [{ itemId: `${order.orderNo}-0`, itemName: `${order.cakeKg}kg ${cake.flavor} ${cake.shape}`.trim(), quantity: Number(cake.cakeKg || 1), isCustom: true, dispatchUnit: 'kg' }];
    const notes = `${order.orderNo} | ${order.customerName} | ${order.mobile} | Delivery ${order.deliveryDate} ${order.deliveryTime || ''} | Cake ${cake.cakeKg}kg ${cake.shape} | Flavor: ${cake.flavor} | ${cake.designNotes || ''}${cake.attachmentName ? ` | Attachment: ${cake.attachmentName}` : ''}`;
    await submitBakeryOrder(bakeryItems, `${user} - VRSNB cake advance`, 'VRSNB', notes);
  };
  const saveAdvance = async (orderType: 'store' | 'custom' | 'cake') => {
    const fullyPaid = orderType === 'store' ? storeFullyPaid : orderType === 'custom' ? customFullyPaid : false;
    const sourceLines = orderType === 'store'
      ? storeLines
      : orderType === 'custom'
        ? [{ itemName: custom.itemName.trim(), quantity: Number(custom.quantity || 0), unit: custom.unit, price: Number(custom.price || 0), tax:0, discount:0, lineTotal: Number(custom.quantity || 0) * Number(custom.price || 0) }]
        : [{ itemName: `${cake.cakeKg}kg ${cake.flavor} ${cake.shape}`.trim(), quantity: Number(cake.cakeKg || 0) || 1, unit:'kg' as const, price: Number(cake.orderValue || 0), tax:0, discount:0, lineTotal: Number(cake.orderValue || 0) }];
    const orderValue = sourceLines.reduce((sum, line)=>sum+line.lineTotal,0);
    const message = validateCommon(orderValue);
    if (message) { setError(message); return; }
    if (sourceLines.length === 0 || sourceLines.some((line)=>!line.itemName || line.quantity <= 0)) { setError('Add at least one valid item.'); return; }
    const adv = fullyPaid ? orderValue : Number(common.advanceAmount || 0);
    const balanceAmount = fullyPaid ? 0 : orderValue - adv;
    const first = sourceLines[0];
    const attachmentName = orderType === 'cake' ? cake.attachmentName : custom.attachmentName;
    const attachmentDataUrl = orderType === 'cake' ? cake.attachmentDataUrl : custom.attachmentDataUrl;
    const order = addAdvanceCakeOrder({
      branch, orderType, customerName: common.customerName.trim(), mobile: common.mobile.trim(), orderDate: new Date().toISOString().split('T')[0],
      deliveryDate: common.deliveryDate, deliveryTime: common.deliveryTime, items: sourceLines, cakeKg: String(first.quantity), flavor: orderType === 'cake' ? cake.flavor : first.itemName, shape: orderType === 'cake' ? cake.shape : first.unit,
      messageOnCake: orderType === 'cake' ? cake.messageOnCake : '', designNotes: orderType === 'cake' ? cake.designNotes : orderType === 'custom' ? custom.notes : 'Existing branch stock advance order',
      attachmentName, attachmentDataUrl, orderValue, advanceAmount: adv, balanceAmount, salesperson: staff, paymentMode: common.paymentMode as 'cash'|'upi'|'card',
      status: fullyPaid ? 'Paid In Full' : 'pending',
    });
    if (orderType === 'cake') await sendCakeToStoreDashboard(order);
    else await sendToStoreDashboard(order, sourceLines);
    // Print slip — show "PAID IN FULL" stamp when fully paid
    printAdvanceSalesOrder({ branch, orderNo: order.orderNo, customerName: order.customerName, mobile: order.mobile, deliveryDate: order.deliveryDate, deliveryTime: order.deliveryTime, items: sourceLines, orderValue, advanceAmount: adv, balanceAmount, paymentMode: common.paymentMode, staffName: staff, fullyPaid });
    setCommon({ customerName:'', mobile:'', deliveryDate:'', deliveryTime:'', advanceAmount:'', paymentMode:'cash', salesperson:'' });
    setStoreFullyPaid(false); setCustomFullyPaid(false);
    setStoreLines([]); setCustom({ itemName:'', quantity:'1', unit:'pcs', price:'', notes:'', attachmentName:'', attachmentDataUrl:'' }); setCake({ cakeKg:'', flavor:'', shape:'', messageOnCake:'', designNotes:'', orderValue:'', attachmentName:'', attachmentDataUrl:'' });
  };
  const finalInvoice = async (o: CakeAdvanceOrder, payMode?: 'cash' | 'upi' | 'card') => {
    const usedMode = payMode || finalPaymentMode;
    const { billNo } = nextBranchInvoice(branch);
    const orderLines = o.items && o.items.length > 0 ? o.items : [{ itemName: o.flavor, quantity: Number(o.cakeKg || 0), unit: o.shape === 'Kgs' ? 'kg' as const : 'pcs' as const, price: o.orderValue / Math.max(Number(o.cakeKg || 1), 1), tax:0, discount:0, lineTotal:o.orderValue }];
    if ((o.orderType || (o.designNotes === 'Existing branch stock advance order' ? 'store' : 'cake')) === 'store') {
      for (const line of orderLines) await manualUpdateStock(branch, line.itemName, Math.max(0, stockQty(branchStock, line.itemName) - line.quantity), currentUser?.displayName || 'Staff');
      await fetchBranchData(branch);
    }
    if (o.balanceAmount > 0) addCashMovement({ branch, amount: o.balanceAmount, paymentMode: usedMode, direction: 'in', purpose: 'Advance balance collection', enteredBy: currentUser?.displayName || 'Staff', referenceNumber: billNo, remarks: `${o.orderNo} ${o.customerName}` });
    updateAdvanceStatus(o.id, 'Paid In Full', currentUser?.displayName || 'Staff', { finalInvoiceBillNo: billNo, balanceAmount: 0 });
    // Print final bill in counter bill format
    printAdvanceSalesOrder({ branch, orderNo: billNo, customerName: o.customerName, mobile: o.mobile, deliveryDate: o.deliveryDate, deliveryTime: o.deliveryTime, items: orderLines, orderValue: o.orderValue, advanceAmount: o.orderValue, balanceAmount: 0, paymentMode: usedMode, staffName: currentUser?.displayName || 'Staff', fullyPaid: true });
    setCollectingId(null);
  };

  return <div className="grid gap-5 xl:grid-cols-[480px_minmax(0,1fr)]">
    <Section title="Advance Order" icon={<Gift className="size-5"/>}>
      <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
        {(['store','custom','cake'] as const).map((tab)=><button key={tab} onClick={()=>setMode(tab)} className={cn('rounded-xl px-3 py-2 text-sm font-black capitalize', mode===tab?'bg-slate-950 text-white':'text-slate-600')}>{tab === 'store' ? 'Store Items' : tab === 'custom' ? 'Custom Items' : 'Cake Orders'}</button>)}
      </div>
      <div className="grid gap-3">
        <Field label="Customer Name *"><Input value={common.customerName} onChange={(e)=>updateCommon('customerName',e.target.value)}/></Field>
        <Field label="Mobile Number *"><Input value={common.mobile} onChange={(e)=>updateCommon('mobile',e.target.value)}/></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Delivery Date *"><Input type="date" value={common.deliveryDate} onChange={(e)=>updateCommon('deliveryDate',e.target.value)}/></Field><Field label="Delivery Time"><Input type="time" value={common.deliveryTime} onChange={(e)=>updateCommon('deliveryTime',e.target.value)}/></Field></div>
        {mode === 'store' && <>
          <div className="grid grid-cols-[1fr_110px] gap-2"><Field label="Item"><Select value={storePick.itemName} onChange={(e)=>setStorePick({...storePick,itemName:e.target.value})}>{items.map((i)=><option key={i.name}>{i.name}</option>)}</Select></Field><Field label="Qty"><Input type="number" min="0" value={storePick.quantity} onChange={(e)=>setStorePick({...storePick,quantity:e.target.value})}/></Field></div>
          <SoftButton onClick={addStoreLine}><Plus className="size-4"/>Add Item</SoftButton>
          <div className="max-h-52 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-2">{storeLines.length === 0 ? <p className="p-3 text-sm font-bold text-slate-500">No items selected.</p> : storeLines.map((line, idx)=><div key={`${line.itemName}-${idx}`} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm font-bold"><span>{line.itemName} - {line.quantity} {line.unit}</span><span>{money(line.lineTotal)}</span><button onClick={()=>removeStoreLine(idx)} className="rounded-lg bg-red-50 p-2 text-red-600"><XCircle className="size-4"/></button></div>)}</div>
          <div className="rounded-2xl bg-emerald-50 p-3 font-black text-emerald-800">Order Value: {money(storeValue)}</div>
          {/* Fully Paid toggle */}
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <label className="flex-1 text-sm font-black text-emerald-800">Fully Paid (no balance)</label>
            <input type="checkbox" checked={storeFullyPaid} onChange={e => handleStoreFullyPaid(e.target.checked)} className="size-5 accent-emerald-600" />
          </div>
          {storeFullyPaid && <div className="rounded-xl bg-emerald-100 px-3 py-2 text-center text-sm font-black text-emerald-700">✓ Fully Paid — no balance due</div>}
        </>}
        {mode === 'custom' && <>
          <Field label="Custom Item Name *"><Input value={custom.itemName} onChange={(e)=>setCustom({...custom,itemName:e.target.value})}/></Field>
          <div className="grid grid-cols-3 gap-2"><Field label="Qty *"><Input type="number" value={custom.quantity} onChange={(e)=>setCustom({...custom,quantity:e.target.value})}/></Field><Field label="Unit"><Select value={custom.unit} onChange={(e)=>setCustom({...custom,unit:e.target.value as 'pcs'|'kg'})}><option value="pcs">Pcs</option><option value="kg">Kgs</option></Select></Field><Field label="Rate *"><Input type="number" value={custom.price} onChange={(e)=>setCustom({...custom,price:e.target.value})}/></Field></div>
          <Field label="Custom Notes"><Textarea value={custom.notes} onChange={(e)=>setCustom({...custom,notes:e.target.value})}/></Field>
          {/* Fully Paid toggle */}
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
            <label className="flex-1 text-sm font-black text-emerald-800">Fully Paid (no balance)</label>
            <input type="checkbox" checked={customFullyPaid} onChange={e => handleCustomFullyPaid(e.target.checked)} className="size-5 accent-emerald-600" />
          </div>
          {customFullyPaid && <div className="rounded-xl bg-emerald-100 px-3 py-2 text-center text-sm font-black text-emerald-700">✓ Fully Paid — no balance due</div>}
        </>}
        {mode === 'cake' && <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cake KG *"><Input value={cake.cakeKg} onChange={(e)=>setCake({...cake,cakeKg:e.target.value})}/></Field>
            <Field label="Shape *"><Input value={cake.shape} onChange={(e)=>setCake({...cake,shape:e.target.value})}/></Field>
          </div>
          <Field label="Flavor *">
            <Select value={cake.flavor} onChange={(e) => setCake({...cake, flavor: e.target.value})}>
              <option value="">Select flavor</option>
              <option value="Vanilla">Vanilla</option>
              <option value="Chocolate">Chocolate</option>
              <option value="Butterscotch">Butterscotch</option>
              <option value="Pineapple">Pineapple</option>
              <option value="Black Forest">Black Forest</option>
              <option value="Red Velvet">Red Velvet</option>
              <option value="Other">Other</option>
            </Select>
          </Field>
          <Field label="Message on cake"><Input value={cake.messageOnCake} onChange={(e)=>setCake({...cake,messageOnCake:e.target.value})}/></Field>
          <Field label="Design notes"><Textarea value={cake.designNotes} onChange={(e)=>setCake({...cake,designNotes:e.target.value})}/></Field>
          <Field label="Attachment/Image"><Input type="file" accept="image/*" onChange={(e)=>handleAttachment(e.target.files?.[0], 'cake')}/></Field>
          {cake.attachmentName && <p className="text-sm font-bold text-emerald-700">Attached: {cake.attachmentName}</p>}
          <Field label="Order Value *"><Input type="number" value={cake.orderValue} onChange={(e)=>setCake({...cake,orderValue:e.target.value})}/></Field>
        </>}
        <div className="grid grid-cols-2 gap-3">{!isVRSNB && <Field label="Salesperson *"><Select value={common.salesperson} onChange={(e)=>updateCommon('salesperson',e.target.value)}><option value="">Select</option>{people.concat(['Counter Sales']).map(p=><option key={p}>{p}</option>)}</Select></Field>}
          {!storeFullyPaid && !customFullyPaid && <Field label="Advance Amount *"><Input type="number" value={common.advanceAmount} onChange={(e)=>updateCommon('advanceAmount',e.target.value)}/></Field>}
          <Field label="Payment Mode"><Select value={common.paymentMode} onChange={(e)=>updateCommon('paymentMode',e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></Select></Field>{isVRSNB && <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800 ring-1 ring-emerald-100">Cashier: {user}</div>}</div>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-black text-red-700">{error}</p>}
        <PrimaryButton onClick={()=>void saveAdvance(mode)}><Printer className="size-4"/>Generate Sales Order Slip{mode !== 'store' ? ' & Send to Store Orders' : ''}</PrimaryButton>
      </div>
    </Section>
    <Section title="Advance Order Pipeline" icon={<CalendarClock className="size-5"/>} action={
      <div className="flex items-center gap-2">
        <div className="flex rounded-2xl bg-slate-100 p-1">
          <button onClick={()=>setPipelineView('active')} className={cn('rounded-xl px-4 py-1.5 text-xs font-black', pipelineView==='active'?'bg-slate-950 text-white':'text-slate-600')}>Active</button>
          <button onClick={()=>setPipelineView('history')} className={cn('rounded-xl px-4 py-1.5 text-xs font-black', pipelineView==='history'?'bg-emerald-600 text-white':'text-slate-600')}>History ({historyOrders.length})</button>
        </div>
        {pipelineView === 'active' && <Select value={finalPaymentMode} onChange={(e)=>setFinalPaymentMode(e.target.value as typeof finalPaymentMode)} className="w-32 text-xs"><option value="cash">Final Cash</option><option value="upi">Final UPI</option><option value="card">Final Card</option></Select>}
      </div>
    }>
      {pipelineView === 'active' ? (
        <div className="space-y-3">{activeOrders.length === 0 ? <p className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">No active advance orders.</p> : activeOrders.map(o=>{ const lines = o.items && o.items.length > 0 ? o.items : [{ itemName: o.flavor, quantity: Number(o.cakeKg || 0), unit: o.shape === 'Kgs' ? 'kg' as const : 'pcs' as const, price: o.orderValue / Math.max(Number(o.cakeKg || 1), 1), tax:0, discount:0, lineTotal:o.orderValue }]; const isCollecting = collectingId === o.id; return <div key={o.id} className="rounded-3xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-black">{o.orderNo} - {o.customerName}</p><p className="text-sm font-bold text-slate-500">{o.mobile} - {lines.map((line)=>`${line.itemName} ${line.quantity} ${line.unit}`).join(', ')} - Delivery {o.deliveryDate} {o.deliveryTime}</p>{o.attachmentName && <p className="mt-1 text-xs font-black text-emerald-700">Attachment: {o.attachmentName}</p>}</div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">{o.status}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-4"><Kpi label="Order" value={money(o.orderValue)} icon={<Receipt className="size-4"/>}/><Kpi label="Advance" value={money(o.advanceAmount)} icon={<Banknote className="size-4"/>} tone="green"/><Kpi label="Balance" value={money(o.balanceAmount)} icon={<IndianRupee className="size-4"/>} tone="amber"/><div className="flex flex-col justify-center gap-2">{o.balanceAmount > 0 ? (<><SoftButton onClick={()=>setCollectingId(isCollecting ? null : o.id)}><IndianRupee className="size-4"/>Collect Remaining ({money(o.balanceAmount)})</SoftButton>{isCollecting && <div className="mt-2 space-y-2 rounded-2xl bg-slate-50 p-3"><Select value={collectMode} onChange={e=>setCollectMode(e.target.value as typeof collectMode)} className="text-xs"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></Select><PrimaryButton onClick={()=>void finalInvoice(o, collectMode)} className="w-full text-xs">Confirm & Print Final Bill</PrimaryButton></div>}</>) : (<span className="rounded-xl bg-emerald-100 px-3 py-2 text-center text-xs font-black text-emerald-700">Fully Paid</span>)}</div></div></div>; })}</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[600px] text-sm"><thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Order No</th><th className="p-3">Customer</th><th className="p-3">Delivery</th><th className="p-3 text-right">Order Value</th><th className="p-3 text-right">Paid</th></tr></thead><tbody>{historyOrders.length === 0 ? <tr><td colSpan={5} className="p-6 text-center font-bold text-slate-500">No completed orders yet.</td></tr> : historyOrders.map(o=><tr key={o.id} className="border-t"><td className="p-3 font-black">{o.orderNo}</td><td className="p-3"><p className="font-bold">{o.customerName}</p><p className="text-xs text-slate-500">{o.mobile}</p></td><td className="p-3">{o.deliveryDate}</td><td className="p-3 text-right font-black">{money(o.orderValue)}</td><td className="p-3 text-right"><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">Paid</span></td></tr>)}</tbody></table></div>
      )}
    </Section>
  </div>;
}
function makeLine(itemName: string, qty: number, price: number): BranchBillItem { return { itemName, quantity: qty, unit: 'pcs', price, tax: 0, discount: 0, lineTotal: qty * price }; }

export function QuotationTab({ branch, branchStock, onOpenTab }: ModuleProps) {
  const { quotations, addQuotation, updateQuotationStatus } = useBranchOpsStore();
  const { currentUser } = useAuthStore();
  const items = catalog(branch);
  const [itemName, setItemName] = useState(items[0]?.name || '');
  const [qty, setQty] = useState('1');
  const [customerName, setCustomerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [salesperson, setSalesperson] = useState(currentUser?.displayName || 'Staff');
  const [lines, setLines] = useState<BranchBillItem[]>([]);
  const add = () => { const item = items.find((i)=>i.name===itemName); if (!item) return; setLines((l)=>[...l, makeLine(item.name, Number(qty||1), item.price)]); };
  const save = () => { if (!customerName || lines.length===0) return; const q = addQuotation({ branch, customerName, mobile, items: lines, total: lines.reduce((s,i)=>s+i.lineTotal,0), salesperson }); printHtml(q.quoteNo, `<div class="stamp">QUOTATION</div><h2>${q.quoteNo}</h2><p>${customerName} ${mobile}</p><table>${lines.map(i=>`<tr><td>${i.itemName}</td><td>${i.quantity}</td><td class="right">₹${i.lineTotal}</td></tr>`).join('')}</table><h2>Total: ₹${q.total}</h2>`); setLines([]); setCustomerName(''); setMobile(''); };
  const convert = (id: string) => { updateQuotationStatus(id, 'Converted', currentUser?.displayName || 'Staff'); onOpenTab?.('bill'); };
  return <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]"><Section title="Create Quotation" icon={<FileText className="size-5"/>}><div className="space-y-3"><Field label="Customer"><Input value={customerName} onChange={(e)=>setCustomerName(e.target.value)}/></Field><Field label="Mobile"><Input value={mobile} onChange={(e)=>setMobile(e.target.value)}/></Field><Field label="Salesperson"><Input value={salesperson} onChange={(e)=>setSalesperson(e.target.value)}/></Field><div className="grid grid-cols-[1fr_90px] gap-2"><Select value={itemName} onChange={(e)=>setItemName(e.target.value)}>{items.map(i=><option key={i.name}>{i.name}</option>)}</Select><Input type="number" value={qty} onChange={(e)=>setQty(e.target.value)}/></div><SoftButton onClick={add}><Plus className="size-4"/>Add Item</SoftButton><div className="space-y-2">{lines.map((l,i)=><div key={`${l.itemName}-${i}`} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm font-bold"><span>{l.itemName} × {l.quantity}</span><span>{money(l.lineTotal)}</span></div>)}</div><PrimaryButton onClick={save}><Printer className="size-4"/>Print / Share Quotation</PrimaryButton></div></Section><Section title="Open Quotations" icon={<FileClock className="size-5"/>}><div className="space-y-3">{quotations.filter(q=>q.branch===branch).map(q=><div key={q.id} className="rounded-3xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-black">{q.quoteNo} · {q.customerName}</p><p className="text-sm text-slate-500">{q.items.length} items · {money(q.total)} · {q.status}</p></div><SoftButton onClick={()=>convert(q.id)} disabled={q.status!=='Open'}>Convert to Bill</SoftButton></div>{q.items.some(i=>stockQty(branchStock,i.itemName)<i.quantity) && <p className="mt-2 text-sm font-bold text-amber-600"><AlertTriangle className="inline size-4"/> Stock validation required before billing.</p>}</div>)}</div></Section></div>;
}

export function ReturnsTab({ branch, branchStock }: ModuleProps) {
  const { currentUser } = useAuthStore();
  const { bills, returns, addReturn } = useBranchOpsStore();
  const { manualUpdateStock, fetchBranchData } = useBranchStore();
  const [billNo, setBillNo] = useState('');
  const [selected, setSelected] = useState<BranchBillRecord | null>(null);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('Customer return');
  const find = () => setSelected(bills.find((b)=>b.branch===branch && b.billNo.toLowerCase()===billNo.toLowerCase()) || null);
  const doReturn = async () => {
    if (!selected) return;
    const lines = selected.items.flatMap((i)=>{ const q = Number(qtys[i.itemName] || 0); return q > 0 ? [{ ...i, quantity: q, lineTotal: q * i.price }] : []; });
    if (!lines.length) return;
    for (const l of lines) await manualUpdateStock(branch, l.itemName, stockQty(branchStock,l.itemName)+l.quantity, currentUser?.displayName || 'Staff');
    const ret = addReturn({ branch, originalBillNo: selected.billNo, items: lines, total: lines.reduce((s,i)=>s+i.lineTotal,0), returnedBy: currentUser?.displayName || 'Staff', reason });
    await fetchBranchData(branch);
    printHtml(ret.returnNo, `<div class="stamp">RETURN BILL</div><h2>${ret.returnNo}</h2><p>Original Bill: ${ret.originalBillNo}</p><table>${ret.items.map(i=>`<tr><td>${i.itemName}</td><td>${i.quantity}</td><td class="right">₹${i.lineTotal}</td></tr>`).join('')}</table><h2>Return Amount: ₹${ret.total}</h2><p>${ret.reason}</p>`);
  };
  return <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]"><Section title="Return Bill" icon={<RotateCcw className="size-5"/>}><div className="space-y-3"><Field label="Search bill number"><div className="flex gap-2"><Input value={billNo} onChange={(e)=>setBillNo(e.target.value)} placeholder="SNB-001"/><PrimaryButton onClick={find}>Search</PrimaryButton></div></Field>{selected && <div className="rounded-3xl bg-slate-50 p-4"><p className="font-black">{selected.billNo} · {money(selected.total)}</p>{selected.items.map(i=><div key={i.itemName} className="mt-3 grid grid-cols-[1fr_90px] gap-2"><p className="font-bold">{i.itemName}<br/><span className="text-xs text-slate-500">Max {i.quantity}</span></p><Input type="number" max={i.quantity} value={qtys[i.itemName] || ''} onChange={(e)=>setQtys({...qtys,[i.itemName]:e.target.value})}/></div>)}<Field label="Reason"><Textarea value={reason} onChange={(e)=>setReason(e.target.value)}/></Field><PrimaryButton onClick={doReturn}><Printer className="size-4"/>Print Return Bill & Sync Stock</PrimaryButton></div>}</div></Section><Section title="Return History" icon={<History className="size-5"/>}><div className="space-y-3">{returns.filter(r=>r.branch===branch).map(r=><div key={r.id} className="rounded-2xl border p-4"><p className="font-black">{r.returnNo} · {money(r.total)}</p><p className="text-sm text-slate-500">Against {r.originalBillNo} · {new Date(r.createdAt).toLocaleString('en-IN')}</p></div>)}</div></Section></div>;
}

export function PurchaseTab({ branch, branchStock }: ModuleProps) {
  const { currentUser } = useAuthStore(); const { addPurchase } = useBranchOpsStore(); const { manualUpdateStock, fetchBranchData } = useBranchStore();
  const items = catalog(branch); const [f,setF] = useState({supplier:'',invoiceNo:'',itemName:items[0]?.name||'',quantity:'',cost:'',tax:'0'});
  const save = async () => { const qty=Number(f.quantity), cost=Number(f.cost), tax=Number(f.tax||0), total=qty*cost+tax; if(!f.supplier||!f.invoiceNo||!qty||!cost) return; addPurchase({branch,supplier:f.supplier,invoiceNo:f.invoiceNo,itemName:f.itemName,quantity:qty,cost,tax,total,enteredBy:currentUser?.displayName||'Staff'}); await manualUpdateStock(branch,f.itemName,stockQty(branchStock,f.itemName)+qty,currentUser?.displayName||'Staff'); await fetchBranchData(branch); setF({...f,quantity:'',cost:'',tax:'0'}); };
  return <Section title="Purchase Entry" icon={<Truck className="size-5"/>}><div className="grid gap-4 lg:grid-cols-3"><Field label="Supplier"><Input value={f.supplier} onChange={(e)=>setF({...f,supplier:e.target.value})}/></Field><Field label="Supplier Invoice"><Input value={f.invoiceNo} onChange={(e)=>setF({...f,invoiceNo:e.target.value})}/></Field><Field label="Item"><Select value={f.itemName} onChange={(e)=>setF({...f,itemName:e.target.value})}>{items.map(i=><option key={i.name}>{i.name}</option>)}</Select></Field><Field label="Quantity"><Input type="number" value={f.quantity} onChange={(e)=>setF({...f,quantity:e.target.value})}/></Field><Field label="Cost"><Input type="number" value={f.cost} onChange={(e)=>setF({...f,cost:e.target.value})}/></Field><Field label="Tax"><Input type="number" value={f.tax} onChange={(e)=>setF({...f,tax:e.target.value})}/></Field></div><div className="mt-4 flex items-center justify-between rounded-3xl bg-slate-50 p-4"><p className="text-lg font-black">Total: {money(Number(f.quantity||0)*Number(f.cost||0)+Number(f.tax||0))}</p><PrimaryButton onClick={save}><Package className="size-4"/>Save Purchase & Update Stock</PrimaryButton></div></Section>;
}

export function PurchasePayTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore(); const { purchases, purchasePayments, addPurchasePayment } = useBranchOpsStore(); const branchPurchases = purchases.filter(p=>p.branch===branch); const [supplier,setSupplier]=useState(''); const [amount,setAmount]=useState(''); const [mode,setMode]=useState<'cash'|'upi'|'card'|'bank'>('cash'); const [ref,setRef]=useState('');
  const pending = branchPurchases.reduce((s,p)=>s+Math.max(0,p.total-p.paidAmount),0); const paid = purchasePayments.filter(p=>p.branch===branch).reduce((s,p)=>s+p.amount,0);
  const save=()=>{ if(!supplier||!Number(amount)) return; addPurchasePayment({branch,supplier,amount:Number(amount),mode,reference:ref,remarks:'Supplier payment',paidBy:currentUser?.displayName||'Staff'}); setAmount(''); setRef(''); };
  return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><Kpi label="Paid" value={money(paid)} icon={<CheckCircle2/>} tone="green"/><Kpi label="Pending" value={money(pending)} icon={<AlertTriangle/>} tone="amber"/><Kpi label="Purchases" value={branchPurchases.length} icon={<Receipt/>}/></div><Section title="Purchase Pay" icon={<WalletCards className="size-5"/>}><div className="grid gap-3 lg:grid-cols-5"><Field label="Supplier"><Input value={supplier} onChange={(e)=>setSupplier(e.target.value)}/></Field><Field label="Amount"><Input type="number" value={amount} onChange={(e)=>setAmount(e.target.value)}/></Field><Field label="Mode"><Select value={mode} onChange={(e)=>setMode(e.target.value as typeof mode)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></Select></Field><Field label="Reference"><Input value={ref} onChange={(e)=>setRef(e.target.value)}/></Field><div className="flex items-end"><PrimaryButton onClick={save}>Pay</PrimaryButton></div></div></Section></div>;
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
  const { currentUser } = useAuthStore(); const { bankDeposits, addBankDeposit } = useBranchOpsStore(); const [f,setF]=useState({depositDate:new Date().toISOString().split('T')[0],amount:'',bankAccount:'Main Current Account',paymentMode:'Cash Deposit',slipNo:'',transactionRef:'',remarks:''});
  const save=()=>{ if(!Number(f.amount)) return; addBankDeposit({branch,depositDate:f.depositDate,amount:Number(f.amount),bankAccount:f.bankAccount,paymentMode:f.paymentMode as 'Cash Deposit' | 'UPI Transfer' | 'Card Settlement' | 'Bank Transfer',slipNo:f.slipNo,transactionRef:f.transactionRef,remarks:f.remarks,enteredBy:currentUser?.displayName||'Staff'}); setF({...f,amount:'',slipNo:'',transactionRef:'',remarks:''}); };
  const rows=bankDeposits.filter(d=>d.branch===branch); return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><Kpi label="Deposited Today" value={money(rows.filter(r=>today(r.createdAt)).reduce((s,r)=>s+r.amount,0))} icon={<Landmark/>} tone="green"/><Kpi label="This Month" value={money(rows.filter(r=>month(r.createdAt)).reduce((s,r)=>s+r.amount,0))} icon={<CalendarClock/>} tone="blue"/><Kpi label="Entries" value={rows.length} icon={<FileText/>}/></div><Section title="Bank Deposit Entry" icon={<Landmark className="size-5"/>}><div className="grid gap-3 lg:grid-cols-4"><Field label="Deposit Date"><Input type="date" value={f.depositDate} onChange={(e)=>setF({...f,depositDate:e.target.value})}/></Field><Field label="Amount"><Input type="number" value={f.amount} onChange={(e)=>setF({...f,amount:e.target.value})}/></Field><Field label="Bank Account"><Input value={f.bankAccount} onChange={(e)=>setF({...f,bankAccount:e.target.value})}/></Field><Field label="Payment Mode"><Select value={f.paymentMode} onChange={(e)=>setF({...f,paymentMode:e.target.value})}><option>Cash Deposit</option><option>UPI Transfer</option><option>Card Settlement</option><option>Bank Transfer</option></Select></Field><Field label="Deposit Slip Number"><Input value={f.slipNo} onChange={(e)=>setF({...f,slipNo:e.target.value})}/></Field><Field label="Transaction Reference"><Input value={f.transactionRef} onChange={(e)=>setF({...f,transactionRef:e.target.value})}/></Field><Field label="Remarks"><Input value={f.remarks} onChange={(e)=>setF({...f,remarks:e.target.value})}/></Field><div className="flex items-end"><PrimaryButton onClick={save}>Save Deposit</PrimaryButton></div></div></Section></div>;
}

export function PurchaseOrderTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore(); const { purchaseOrders, addPurchaseOrder, updatePoStatus } = useBranchOpsStore(); const items=catalog(branch); const [f,setF]=useState({supplier:'',itemName:items[0]?.name||'',quantity:'',expectedRate:'',expectedDeliveryDate:'',remarks:''}); const user=currentUser?.displayName||'Staff';
  const create=()=>{ const qty=Number(f.quantity), rate=Number(f.expectedRate); if(!f.supplier||!qty||!rate) return; addPurchaseOrder({branch,supplier:f.supplier,itemName:f.itemName,quantity:qty,expectedRate:rate,totalAmount:qty*rate,expectedDeliveryDate:f.expectedDeliveryDate,remarks:f.remarks,createdBy:user}); };
  const rows=purchaseOrders.filter(p=>p.branch===branch); return <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]"><Section title="Create Purchase Order" icon={<ClipboardCheck className="size-5"/>}><div className="space-y-3"><Field label="Supplier"><Input value={f.supplier} onChange={(e)=>setF({...f,supplier:e.target.value})}/></Field><Field label="Item"><Select value={f.itemName} onChange={(e)=>setF({...f,itemName:e.target.value})}>{items.map(i=><option key={i.name}>{i.name}</option>)}</Select></Field><div className="grid grid-cols-2 gap-2"><Field label="Quantity"><Input type="number" value={f.quantity} onChange={(e)=>setF({...f,quantity:e.target.value})}/></Field><Field label="Expected Rate"><Input type="number" value={f.expectedRate} onChange={(e)=>setF({...f,expectedRate:e.target.value})}/></Field></div><Field label="Expected Delivery"><Input type="date" value={f.expectedDeliveryDate} onChange={(e)=>setF({...f,expectedDeliveryDate:e.target.value})}/></Field><Field label="Remarks"><Textarea value={f.remarks} onChange={(e)=>setF({...f,remarks:e.target.value})}/></Field><PrimaryButton onClick={create}>Create PO</PrimaryButton></div></Section><Section title="PO Workflow" icon={<Truck className="size-5"/>}><div className="space-y-3">{rows.map((p:PurchaseOrderRecord)=><div key={p.id} className="rounded-3xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black">{p.poNo} · {p.supplier}</p><p className="text-sm text-slate-500">{p.itemName} · {p.quantity} × {money(p.expectedRate)} · {money(p.totalAmount)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{p.status}</span></div><div className="mt-3 flex flex-wrap gap-2">{(['Approved','Rejected','Ordered','Received','Closed'] as const).map(s=><SoftButton key={s} onClick={()=>updatePoStatus(p.id,s,user)}>{s}</SoftButton>)}</div></div>)}</div></Section></div>;
}

export function CashierClosureTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore();
  const { bills, returns, cashierClosures, purchasePayments, cashMovements, addCashierClosure } = useBranchOpsStore();
  const { creditSales, creditPayments, fetchCreditSales, fetchCreditPayments } = useBranchStore();
  const [opening, setOpening] = useState('0');
  const [closing, setClosing] = useState('');
  const [notes, setNotes] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const user = currentUser?.displayName || currentUser?.username || 'Cashier';

  useEffect(() => {
    void fetchCreditSales(branch);
    void fetchCreditPayments(branch);
  }, [branch, fetchCreditPayments, fetchCreditSales]);

  const todayBills = bills.filter((b) => b.branch === branch && today(b.createdAt));
  const todayReturns = returns.filter((r) => r.branch === branch && today(r.createdAt));
  const todayExpenses = purchasePayments.filter((p) => p.branch === branch && today(p.createdAt));
  const branchCredits = creditSales[branch] || [];
  const branchCreditPayments = creditPayments[branch] || [];
  const todayCreditSales = branchCredits.filter((c) => today(c.createdAt));
  const todayCreditCollections = branchCreditPayments.filter((m) => today(m.createdAt));
  const todayAdvancePayments = cashMovements.filter((m) => m.branch === branch && today(m.dateTime) && m.direction === 'in' && (m.purpose === 'Cake advance received' || m.purpose === 'Advance balance collection'));

  const totalSales = todayBills.reduce((s, b) => s + b.total, 0);
  const advanceCollectedToday = todayAdvancePayments.reduce((s, m) => s + m.amount, 0);
  const totalSalesIncAdvance = totalSales + advanceCollectedToday;
  const cash = todayBills.reduce((s, b) => s + (b.paymentMode === 'cash' ? b.total : b.paymentMode === 'split' ? Number(b.split?.cash || 0) : 0), 0);
  const upi = todayBills.reduce((s, b) => s + (b.paymentMode === 'upi' ? b.total : b.paymentMode === 'split' ? Number(b.split?.upi || 0) : 0), 0);
  const card = todayBills.reduce((s, b) => s + (b.paymentMode === 'card' ? b.total : b.paymentMode === 'split' ? Number(b.split?.card || 0) : 0), 0);
  const creditSalesTotal = todayCreditSales.reduce((s, c) => s + c.subtotal, 0);
  const creditCollectionCash = todayCreditCollections.filter((m) => m.paymentMode === 'cash').reduce((s, m) => s + m.amount, 0);
  const creditCollectionDigital = todayCreditCollections.filter((m) => m.paymentMode !== 'cash').reduce((s, m) => s + m.amount, 0);
  const advanceCash = todayAdvancePayments.filter((m) => m.paymentMode === 'cash').reduce((s, m) => s + m.amount, 0);
  const advanceDigital = todayAdvancePayments.filter((m) => m.paymentMode !== 'cash').reduce((s, m) => s + m.amount, 0);
  const advancePaid = todayAdvancePayments.filter((m) => m.purpose === 'Cake advance received').reduce((s, m) => s + m.amount, 0);
  const advanceFull = todayAdvancePayments.filter((m) => m.purpose === 'Advance balance collection').reduce((s, m) => s + m.amount, 0);
  const splitTotal = todayBills.filter((b) => b.paymentMode === 'split').reduce((s, b) => s + b.total, 0);
  const refunds = todayReturns.reduce((s, r) => s + r.total, 0);
  const expenses = todayExpenses.reduce((s, p) => s + p.amount, 0);
  const discounts = todayBills.reduce((s, b) => s + b.discount, 0);
  const duplicate = todayBills.filter((b) => b.printCount > 1).length;
  const expected = Number(opening || 0) + cash + creditCollectionCash + advanceCash - refunds - expenses;
  const countedCash = Number(closing || 0);
  const diff = countedCash - expected;

  const save = () => {
    addCashierClosure({ branch, cashier: user, openingCash: Number(opening || 0), closingCash: countedCash, expectedCash: expected, difference: diff, cash, upi, card, returns: refunds, discounts, billsCount: todayBills.length, duplicateBills: duplicate, creditSales: creditSalesTotal, creditCollections: creditCollectionCash + creditCollectionDigital, notes });
    setSavedMessage('Closure saved successfully.');
    setClosing('');
    setNotes('');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const printClosure = () => printHtml(`${branch} Cashier Closure`, `<div class="stamp">CASHIER CLOSURE</div><h2>${BRANCH_LABELS[branch]}</h2><div class="row"><span>Cashier</span><b>${user}</b></div><div class="row"><span>Bills</span><b>${todayBills.length}</b></div><div class="row"><span>Normal Bills</span><b>&#x20B9;${totalSales.toFixed(2)}</b></div><div class="row"><span>Advance Collected Today</span><b>&#x20B9;${advanceCollectedToday.toFixed(2)}</b></div><div class="row"><span>Total Sales (inc. Advance)</span><b>&#x20B9;${totalSalesIncAdvance.toFixed(2)}</b></div><div class="row"><span>Opening Cash</span><b>&#x20B9;${Number(opening || 0).toFixed(2)}</b></div><div class="row"><span>Cash Sales</span><b>&#x20B9;${cash.toFixed(2)}</b></div><div class="row"><span>UPI Sales</span><b>&#x20B9;${upi.toFixed(2)}</b></div><div class="row"><span>Card Sales</span><b>&#x20B9;${card.toFixed(2)}</b></div><div class="row"><span>Split Payments</span><b>&#x20B9;${splitTotal.toFixed(2)}</b></div><div class="row"><span>Credit Sales</span><b>&#x20B9;${creditSalesTotal.toFixed(2)}</b></div><div class="row"><span>Credit Collections</span><b>&#x20B9;${(creditCollectionCash + creditCollectionDigital).toFixed(2)}</b></div><div class="row"><span>Expenses</span><b>&#x20B9;${expenses.toFixed(2)}</b></div><div class="row"><span>Refunds</span><b>&#x20B9;${refunds.toFixed(2)}</b></div><div class="row"><span>Expected Cash</span><b>&#x20B9;${expected.toFixed(2)}</b></div><div class="row"><span>Counted Cash</span><b>&#x20B9;${countedCash.toFixed(2)}</b></div><div class="row"><span>Difference</span><b>&#x20B9;${diff.toFixed(2)}</b></div><p>${notes || ''}</p>`);

  const exportClosure = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Opening Cash', Number(opening || 0)],
      ['Normal Bills', totalSales],
      ['Advance Collected Today', advanceCollectedToday],
      ['Total Sales (inc. Advance)', totalSalesIncAdvance],
      ['Cash Sales', cash],
      ['UPI Sales', upi],
      ['Card Sales', card],
      ['Split Payments', splitTotal],
      ['Credit Sales', creditSalesTotal],
      ['Credit Collection Cash', creditCollectionCash],
      ['Credit Collection Digital', creditCollectionDigital],
      ['Advance Paid', advancePaid],
      ['Advance Full Balance', advanceFull],
      ['Advance Digital', advanceDigital],
      ['Expenses', expenses],
      ['Refunds', refunds],
      ['Expected Cash', expected],
      ['Counted Cash', countedCash],
      ['Difference', diff],
      ['Remarks', notes],
    ];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${branch}-cashier-closure.csv`;
    a.click();
  };

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
      <Kpi label="Opening Cash" value={money(Number(opening || 0))} icon={<Banknote/>}/>
      <Kpi label="Total Sales" value={money(totalSalesIncAdvance)} icon={<Receipt/>} tone="green"/>
      <Kpi label="Cash Sales" value={money(cash)} icon={<Banknote/>} tone="green"/>
      <Kpi label="UPI/Card" value={money(upi + card)} icon={<CreditCard/>} tone="blue"/>
      <Kpi label="Credit Due" value={money(branchCredits.filter((c)=>c.status !== 'settled').reduce((sum,c)=>sum+c.creditAmount,0))} icon={<WalletCards/>} tone="amber"/>
      <Kpi label="Expenses/Refunds" value={money(expenses + refunds)} icon={<RotateCcw/>} tone="red"/>
      <Kpi label="Expected Cash" value={money(expected)} icon={<WalletCards/>} tone="amber"/>
    </div>

    <Section title="Cashier Closure - Simple Shift Summary" icon={<WalletCards className="size-5"/>} action={<div className="flex flex-wrap gap-2"><SoftButton onClick={printClosure}><Printer className="size-4"/>Print</SoftButton><SoftButton onClick={exportClosure}><Download className="size-4"/>Export</SoftButton></div>}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-x-auto rounded-3xl border border-slate-200">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Section</th><th className="p-3 text-right">Amount</th><th className="p-3">Meaning</th></tr></thead>
            <tbody>
              <tr className="border-t"><td className="p-3 font-black">Opening Cash</td><td className="p-3 text-right font-black">{money(Number(opening || 0))}</td><td className="p-3 text-slate-500">Cash available before starting shift.</td></tr>
              <tr className="border-t"><td className="p-3 font-black">Normal Bills</td><td className="p-3 text-right font-black text-emerald-700">{money(totalSales)}</td><td className="p-3 text-slate-500">Revenue from regular counter bills today.</td></tr>
              <tr className="border-t bg-emerald-50/60"><td className="p-3 font-black text-emerald-800">Advance Collected Today</td><td className="p-3 text-right font-black text-emerald-700">{money(advanceCollectedToday)}</td><td className="p-3 text-slate-500">Advance + balance amounts received today for advance orders.</td></tr>
              <tr className="border-t bg-emerald-50"><td className="p-3 font-black">Total Sales (inc. Advance)</td><td className="p-3 text-right font-black text-emerald-700">{money(totalSalesIncAdvance)}</td><td className="p-3 text-slate-500">Normal bills + advance collected today.</td></tr>
              <tr className="border-t"><td className="p-3 font-black">Cash Sales</td><td className="p-3 text-right font-black text-emerald-700">{money(cash)}</td><td className="p-3 text-slate-500">Cash part of normal and split bills.</td></tr>
              <tr className="border-t"><td className="p-3 font-black">UPI Sales</td><td className="p-3 text-right font-black">{money(upi)}</td><td className="p-3 text-slate-500">UPI part of normal and split bills.</td></tr>
              <tr className="border-t"><td className="p-3 font-black">Card Sales</td><td className="p-3 text-right font-black">{money(card)}</td><td className="p-3 text-slate-500">Card part of normal and split bills.</td></tr>
              <tr className="border-t"><td className="p-3 font-black">Split Payments</td><td className="p-3 text-right font-black">{money(splitTotal)}</td><td className="p-3 text-slate-500">Bills collected through more than one payment mode.</td></tr>
              <tr className="border-t"><td className="p-3 font-black">Credit Sales</td><td className="p-3 text-right font-black text-amber-700">{money(creditSalesTotal)}</td><td className="p-3 text-slate-500">Credit bills made today. This is sale value, not drawer cash.</td></tr>
              <tr className="border-t"><td className="p-3 font-black">Credit Collections</td><td className="p-3 text-right font-black text-emerald-700">{money(creditCollectionCash + creditCollectionDigital)}</td><td className="p-3 text-slate-500">Payments collected today against older/new credit bills.</td></tr>
              <tr className="border-t"><td className="p-3 font-black">Advance Paid</td><td className="p-3 text-right font-black text-emerald-700">{money(advancePaid)}</td><td className="p-3 text-slate-500">Advance collected today for advance orders.</td></tr>
              <tr className="border-t"><td className="p-3 font-black">Advance Full / Balance</td><td className="p-3 text-right font-black text-emerald-700">{money(advanceFull)}</td><td className="p-3 text-slate-500">Final balance collected today for advance orders.</td></tr>
              <tr className="border-t"><td className="p-3 font-black">Expenses</td><td className="p-3 text-right font-black text-red-600">-{money(expenses)}</td><td className="p-3 text-slate-500">Supplier/purchase payments made today.</td></tr>
              <tr className="border-t"><td className="p-3 font-black">Refunds</td><td className="p-3 text-right font-black text-red-600">-{money(refunds)}</td><td className="p-3 text-slate-500">Return/refund amount paid today.</td></tr>
              <tr className="border-t bg-amber-50"><td className="p-3 font-black">Expected Cash</td><td className="p-3 text-right text-lg font-black">{money(expected)}</td><td className="p-3 text-slate-600">Opening + cash sales + cash credit collections + cash advances - cash out.</td></tr>
            </tbody>
          </table>
        </div>
        <div className="space-y-3 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <Field label="Opening Cash"><Input type="number" value={opening} onChange={(e)=>setOpening(e.target.value)}/></Field>
          <Field label="Counted Cash"><Input type="number" value={closing} onChange={(e)=>setClosing(e.target.value)} placeholder="Enter drawer cash counted"/></Field>
          <Field label="Difference"><div className={cn('flex h-12 items-center rounded-2xl px-4 text-xl font-black', diff===0?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700')}>{money(diff)}</div></Field>
          <Field label="Closing Remarks"><Textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Optional notes: shortage reason, expense details, handover note"/></Field>
          {savedMessage && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">{savedMessage}</p>}
          <PrimaryButton onClick={save} className="w-full">Save Cashier Closure</PrimaryButton>
        </div>
      </div>
    </Section>

    <Section title="Closure History" icon={<History className="size-5"/>}>
      <div className="space-y-2">{cashierClosures.filter(c=>c.branch===branch).map(c=><div key={c.id} className="rounded-2xl border p-4"><p className="font-black">{new Date(c.createdAt).toLocaleString('en-IN')} · {c.cashier}</p><p className="text-sm text-slate-500">Bills {c.billsCount} · Cash {money(c.cash)} · Expected {money(c.expectedCash)} · Counted {money(c.closingCash)} · Difference {money(c.difference)}</p>{c.notes && <p className="mt-2 text-sm font-semibold text-slate-600">{c.notes}</p>}</div>)}</div>
    </Section>
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
  const adminName = currentUser?.displayName || currentUser?.username || 'Admin';
  const rows = notifications.filter(n=>n.branch===branch);
  const mismatches = stockMismatches.filter(m=>m.branch===branch);
  return <div className="space-y-5"><div className="grid gap-3 md:grid-cols-3"><Kpi label="Pending Notifications" value={rows.filter(r=>r.status==='Unread').length} icon={<Bell/>} tone="amber"/><Kpi label="Stock Disputes" value={rows.filter(r=>r.type==='Stock Dispute'&&r.status!=='Resolved').length + mismatches.length} icon={<AlertTriangle/>} tone="red"/><Kpi label="Resolved" value={rows.filter(r=>r.status==='Resolved').length} icon={<CheckCircle2/>} tone="green"/></div><Section title="Admin Notifications - Review / Clear / Resolve" icon={<Bell className="size-5"/>}><div className="space-y-3">{rows.length === 0 ? <p className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">No admin notifications.</p> : rows.map(n=><div key={n.id} className="rounded-3xl border p-4"><div className="flex flex-col justify-between gap-3 lg:flex-row"><div><p className="font-black">{n.type}: {n.title}</p><p className="text-sm text-slate-500">{n.details}</p><p className="mt-1 text-xs font-bold text-slate-400">{new Date(n.createdAt).toLocaleString('en-IN')} · {n.raisedBy}</p></div><div className="flex flex-wrap items-start gap-2"><SoftButton onClick={()=>updateNotificationStatus(n.id,'Seen',adminName)}>Review</SoftButton><SoftButton onClick={()=>updateNotificationStatus(n.id,'Resolved',adminName)} className="text-emerald-700">Clear / Resolve</SoftButton><Select value={n.status} onChange={(e)=>updateNotificationStatus(n.id,e.target.value as typeof n.status,adminName)} className="w-36"><option>Unread</option><option>Seen</option><option>Resolved</option></Select></div></div></div>)}</div></Section><Section title="Stock Mismatch / Dispute Reports" icon={<AlertTriangle className="size-5"/>}><div className="space-y-2">{mismatches.map(m=><div key={m.id} className="rounded-2xl bg-red-50 p-4 text-red-800"><p className="font-black">{m.itemName}</p><p className="text-sm">Sold {m.soldQty} · Shortage {m.shortage} · Raised by {m.soldBy} · {new Date(m.soldAt).toLocaleString('en-IN')}</p></div>)}</div></Section></div>;
}

export function StoreOrdersTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore(); const { storeOrders, updateStoreOrderStatus } = useBranchOpsStore(); const [remarks,setRemarks]=useState(''); const rows=storeOrders.filter(o=>o.branch===branch);
  return <Section title="Store Orders" icon={<Store className="size-5"/>}><div className="mb-4 rounded-3xl bg-blue-50 p-4 text-sm font-semibold text-blue-900 ring-1 ring-blue-100"><p className="font-black">What are Store Orders?</p><p className="mt-1">Store Orders are internal branch requests sent to the store team, mainly from advance/custom cake orders or stock/order requests. The store can confirm, reject, or add remarks so the branch cashier knows whether the request is accepted and ready for fulfilment.</p></div><div className="space-y-3">{rows.length === 0 ? <p className="rounded-2xl bg-slate-50 p-6 text-center font-bold text-slate-500">No store orders are pending for this branch.</p> : rows.map(o=><div key={o.id} className="rounded-3xl border p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-black">{o.orderNo} · {o.customerName}</p><p className="text-sm text-slate-500">{o.mobile} · {o.details} · Required {o.requiredAt}</p><p className="mt-1 text-xs font-bold text-slate-400">Status: {o.status} {o.confirmerName ? `· ${o.confirmerName}` : ''}</p></div><div className="flex flex-wrap gap-2"><SoftButton onClick={()=>updateStoreOrderStatus(o.id,'Confirmed',currentUser?.displayName||'Store',remarks)}>Confirm</SoftButton><SoftButton onClick={()=>updateStoreOrderStatus(o.id,'Rejected',currentUser?.displayName||'Store',remarks)} className="text-red-600">Reject</SoftButton></div></div><Input value={remarks} onChange={(e)=>setRemarks(e.target.value)} placeholder="Remarks for confirmation/rejection" className="mt-3"/></div>)}</div></Section>;
}

export function AuditLogsTab({ branch }: ModuleProps) {
  const { auditLogs } = useBranchOpsStore(); const rows = auditLogs.filter(a=>a.branch===branch); return <Section title="Financial Audit Logs" icon={<ShieldCheck className="size-5"/>} action={<SoftButton onClick={()=>{const blob=new Blob([rows.map(r=>[r.createdAt,r.user,r.action,r.previousValue,r.newValue].join(',')).join('\n')],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${branch}-audit.csv`; a.click();}}><Download className="size-4"/>Export</SoftButton>}><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="p-3">Date/Time</th><th className="p-3">User</th><th className="p-3">Action</th><th className="p-3">Previous</th><th className="p-3">New</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t"><td className="p-3">{new Date(r.createdAt).toLocaleString('en-IN')}</td><td className="p-3">{r.user}</td><td className="p-3 font-black">{r.action}</td><td className="p-3">{r.previousValue}</td><td className="p-3">{r.newValue}</td></tr>)}</tbody></table></div></Section>;
}

export function BranchAdminKpiStrip({ branch }: { branch: Branch }) {
  const { bills, bankDeposits, returns, advanceCakeOrders, purchasePayments, notifications } = useBranchOpsStore();
  const b = bills.filter(x=>x.branch===branch&&today(x.createdAt));
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6"><Kpi label="Today's Sales" value={money(b.reduce((s,x)=>s+x.total,0))} icon={<Receipt/>} tone="green"/><Kpi label="Pending Advance" value={advanceCakeOrders.filter(o=>o.branch===branch&&o.status!=='Paid In Full').length} icon={<CalendarClock/>} tone="amber"/><Kpi label="Store Confirm" value={advanceCakeOrders.filter(o=>o.branch===branch&&o.status==='Store Confirmed').length} icon={<Store/>} tone="blue"/><Kpi label="Purchase Pay" value={money(purchasePayments.filter(p=>p.branch===branch&&today(p.createdAt)).reduce((s,p)=>s+p.amount,0))} icon={<WalletCards/>}/><Kpi label="Deposits" value={money(bankDeposits.filter(d=>d.branch===branch&&today(d.createdAt)).reduce((s,d)=>s+d.amount,0))} icon={<Landmark/>} tone="blue"/><Kpi label="Returns" value={money(returns.filter(r=>r.branch===branch&&today(r.createdAt)).reduce((s,r)=>s+r.total,0))} icon={<RotateCcw/>} tone="red"/><Kpi label="Disputes" value={notifications.filter(n=>n.branch===branch&&n.type==='Stock Dispute'&&n.status!=='Resolved').length} icon={<AlertTriangle/>} tone="red"/></div>;
}

