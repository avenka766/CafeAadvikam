import { useMemo, useState } from 'react';
import type React from 'react';
import {
  AlertTriangle, Banknote, Bell, Building2, CalendarClock, CheckCircle2, ClipboardCheck,
  CreditCard, Download, FileClock, FileText, Gift, History, IndianRupee, Landmark, Package,
  Plus, Printer, Receipt, RotateCcw, Search, ShieldCheck, Smartphone, Store, Trash2,
  Truck, UserRound, WalletCards, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useBranchStore, type SaleRecord, type StockItem } from '../branchStore';
import type { Branch } from '../types';
import { BRANCH_LABELS } from '../types';
import {
  money, nextBranchInvoice, useBranchOpsStore,
  type BranchBillItem, type BranchBillRecord,
  type CakeAdvanceOrder, type PurchaseOrderRecord,
} from '../branchOpsStore';
import { SNB_ITEMS } from '../snbItems';
import { VRSNB_ITEMS } from '../vrsnbItems';

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
function printHtml(title: string, body: string) { const w = window.open('', '_blank', 'width=600,height=800'); if (w) { w.document.write(`<!doctype html><html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}.b{font-weight:800}.c{text-align:center}.row{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:6px 0}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}.right{text-align:right}.stamp{border:2px solid #111;padding:8px;text-align:center;font-weight:900;margin-bottom:12px}</style></head><body>${body}<script>window.onload=()=>window.print()</script></body></html>`); w.document.close(); } }

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
    printHtml(
      `Duplicate ${bill.billNo}`,
      `<div class="stamp">DUPLICATE BILL</div><h2 class="c">${BRANCH_LABELS[branch]}</h2><p class="c b">${bill.billNo}</p><table>${bill.items.map(i=>`<tr><td>${i.itemName}<br/>${i.quantity} ${i.unit} × ₹${i.price}</td><td class="right">₹${i.lineTotal.toFixed(2)}</td></tr>`).join('')}</table><h2 class="right">Total: ₹${bill.total.toFixed(2)}</h2>${isVRSNB ? `<p>Cashier: ${bill.biller}</p>` : `<p>Salesperson: ${bill.salesperson}</p><p>Cashier: ${bill.biller}</p>`}`,
    );
  };
  return <Section title="Bill History" icon={<History className="size-5"/>} action={<div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><Input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={isVRSNB ? 'Search bill or cashier' : 'Search bill or salesperson'} className="pl-9"/></div>}><div className="overflow-x-auto"><table className={cn('w-full text-sm', isVRSNB ? 'min-w-[760px]' : 'min-w-[850px]')}><thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="p-3">Bill</th><th className="p-3">Time</th>{!isVRSNB && <th className="p-3">Salesperson</th>}<th className="p-3">Cashier</th><th className="p-3">Mode</th><th className="p-3 text-right">Total</th><th className="p-3">Print Status</th><th className="p-3 text-right">Action</th></tr></thead><tbody>{rows.map(b=><tr key={b.id} className="border-t"><td className="p-3 font-black">{b.billNo}</td><td className="p-3">{new Date(b.createdAt).toLocaleString('en-IN')}</td>{!isVRSNB && <td className="p-3">{b.salesperson}</td>}<td className="p-3">{b.biller}</td><td className="p-3 uppercase">{b.paymentMode}</td><td className="p-3 text-right font-black">{money(b.total)}</td><td className="p-3"><span className={cn('rounded-full px-2 py-1 text-xs font-black', b.printCount > 1 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>{b.printCount > 1 ? 'Duplicate Printed' : 'Original Bill'}</span></td><td className="p-3 text-right"><SoftButton onClick={()=>reprint(b)}><Printer className="size-4"/>Duplicate</SoftButton></td></tr>)}</tbody></table></div></Section>;
}


export function CreditSalesTab({ branch }: ModuleProps) {
  const { currentUser } = useAuthStore();
  const { creditSales, collectCreditPayment, writeOffCreditSale } = useBranchOpsStore();
  const user = currentUser?.displayName || currentUser?.username || 'Cashier';
  const isAdmin = ['admin', 'admin_snb', 'admin_vrsnb', 'owner'].includes(currentUser?.role || '');
  const isVRSNB = branch === 'VRSNB';
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({ amount: '', mode: 'cash', reference: '', remarks: '' });
  const [message, setMessage] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return creditSales
      .filter((c) => c.branch === branch)
      .filter((c) => !q || c.billNo.toLowerCase().includes(q) || c.customerName.toLowerCase().includes(q) || c.mobile.includes(q))
      .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
  }, [branch, creditSales, query]);

  const selected = rows.find((r) => r.id === selectedId);
  const pending = rows.filter((r) => r.status !== 'Paid' && r.status !== 'Written Off');
  const totalCredit = rows.reduce((s, r) => s + r.total, 0);
  const collected = rows.reduce((s, r) => s + r.paidAmount, 0);
  const outstanding = pending.reduce((s, r) => s + r.balanceDue, 0);
  const dueToday = pending.filter((r) => r.dueDate && new Date(r.dueDate).toDateString() === new Date().toDateString()).reduce((s, r) => s + r.balanceDue, 0);

  const startCollection = (id: string) => {
    const row = rows.find((r) => r.id === id);
    setSelectedId(id);
    setForm({ amount: row ? String(row.balanceDue) : '', mode: 'cash', reference: '', remarks: '' });
    setMessage('');
  };

  const saveCollection = () => {
    if (!selected) { setMessage('Select a credit bill first.'); return; }
    const amount = Number(form.amount || 0);
    if (!amount || amount <= 0) { setMessage('Enter a valid collection amount.'); return; }
    if (amount > selected.balanceDue) { setMessage('Collection amount cannot be more than pending balance.'); return; }
    collectCreditPayment(selected.id, {
      amount,
      mode: form.mode as 'cash' | 'upi' | 'card' | 'bank',
      reference: form.reference,
      remarks: form.remarks,
      collectedBy: user,
    });
    setMessage(`Collected ${money(amount)} for ${selected.billNo}.`);
    setSelectedId('');
    setForm({ amount: '', mode: 'cash', reference: '', remarks: '' });
  };

  const printReport = () => printHtml(`${branch} Credit Sales`, `<div class="stamp">CREDIT SALES REPORT</div><h2>${BRANCH_LABELS[branch]}</h2><div class="row"><span>Outstanding</span><b>₹${outstanding.toFixed(2)}</b></div><table><thead><tr><th>Bill</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>${rows.map((r)=>`<tr><td>${r.billNo}</td><td>${r.customerName}<br/>${r.mobile}</td><td>₹${r.total.toFixed(2)}</td><td>₹${r.paidAmount.toFixed(2)}</td><td>₹${r.balanceDue.toFixed(2)}</td><td>${r.status}</td></tr>`).join('')}</tbody></table>`);

  const exportCsv = () => {
    const csvRows = [
      ['Bill No', 'Customer', 'Mobile', 'Date', 'Due Date', 'Total', 'Paid', 'Balance', 'Status', isVRSNB ? 'Cashier' : 'Salesperson', 'Remarks'],
      ...rows.map((r) => [r.billNo, r.customerName, r.mobile, new Date(r.createdAt).toLocaleString('en-IN'), r.dueDate, r.total, r.paidAmount, r.balanceDue, r.status, r.salesperson, r.remarks]),
    ];
    const blob = new Blob([csvRows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${branch}-credit-sales.csv`;
    a.click();
  };

  const statusClass = (status: string) => cn(
    'rounded-full px-3 py-1 text-xs font-black',
    status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
    status === 'Part Paid' ? 'bg-blue-100 text-blue-700' :
    status === 'Written Off' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700',
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
              <tbody>{rows.length === 0 ? <tr><td colSpan={8} className="p-6 text-center font-bold text-slate-500">No credit sales found.</td></tr> : rows.map((r)=><tr key={r.id} className="border-t align-top"><td className="p-3"><p className="font-black">{r.billNo}</p><p className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString('en-IN')}</p></td><td className="p-3"><p className="font-bold">{r.customerName}</p><p className="text-xs text-slate-500">{r.mobile || '-'}</p></td><td className="p-3">{r.dueDate || '-'}</td><td className="p-3 text-right font-black">{money(r.total)}</td><td className="p-3 text-right font-black text-emerald-700">{money(r.paidAmount)}</td><td className="p-3 text-right font-black text-amber-700">{money(r.balanceDue)}</td><td className="p-3"><span className={statusClass(r.status)}>{r.status}</span></td><td className="p-3 text-right"><div className="flex justify-end gap-2"><SoftButton onClick={()=>startCollection(r.id)} disabled={r.status === 'Paid' || r.status === 'Written Off'}>Collect</SoftButton>{isAdmin && r.status !== 'Paid' && r.status !== 'Written Off' && <SoftButton onClick={()=>writeOffCreditSale(r.id,user,'Admin write off')} className="text-red-600">Write off</SoftButton>}</div></td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="space-y-3 rounded-3xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <h4 className="text-lg font-black text-slate-950">Collect Payment</h4>
          <p className="text-sm font-semibold text-slate-500">{selected ? `${selected.billNo} · ${selected.customerName} · Pending ${money(selected.balanceDue)}` : 'Choose a pending credit bill from the table.'}</p>
          <Field label="Amount"><Input type="number" min="0" max={selected?.balanceDue || undefined} value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})}/></Field>
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
  const { manualUpdateStock, fetchBranchData } = useBranchStore();
  const isVRSNB = branch === 'VRSNB';
  const user = currentUser?.displayName || currentUser?.username || 'Cashier';
  const items = catalog(branch);
  const [mode, setMode] = useState<'store' | 'cake'>('store');
  const [finalPaymentMode, setFinalPaymentMode] = useState<'cash' | 'upi' | 'card'>('cash');
  const [form, setForm] = useState({ customerName:'', mobile:'', deliveryDate:'', deliveryTime:'', cakeKg:'', flavor:'', shape:'', messageOnCake:'', designNotes:'', orderValue:'', advanceAmount:'', salesperson:'', paymentMode:'cash', attachmentName:'' });
  const [storeForm, setStoreForm] = useState({ customerName:'', mobile:'', deliveryDate:'', deliveryTime:'', itemName: items[0]?.name || '', quantity:'1', advanceAmount:'', paymentMode:'cash' });
  const [error, setError] = useState('');
  const people = isVRSNB ? [] : salespeople.filter((p)=>p.branch===branch && p.active).map((p)=>p.name);
  const orders = advanceCakeOrders.filter((o)=>o.branch===branch);
  const update = (k: string, v: string) => { setForm((f)=>({...f,[k]:v})); setError(''); };
  const updateStore = (k: string, v: string) => { setStoreForm((f)=>({...f,[k]:v})); setError(''); };

  const saveStoreAdvance = () => {
    const item = items.find((i)=>i.name===storeForm.itemName);
    const qty = Number(storeForm.quantity || 0);
    const adv = Number(storeForm.advanceAmount || 0);
    if (!storeForm.customerName.trim() || !storeForm.mobile.trim() || !storeForm.deliveryDate || !item || qty <= 0) {
      setError('Please fill customer name, mobile, delivery date, item and quantity.');
      return;
    }
    const available = stockQty(branchStock, item.name);
    if (qty > available) { setError(`Only ${available} available for ${item.name}.`); return; }
    const orderValue = qty * item.price;
    if (adv < 0 || adv > orderValue) { setError('Advance amount cannot be more than order value.'); return; }
    const order = addAdvanceCakeOrder({ branch, customerName: storeForm.customerName, mobile: storeForm.mobile, orderDate: new Date().toISOString().split('T')[0], deliveryDate: storeForm.deliveryDate, deliveryTime: storeForm.deliveryTime, cakeKg: String(qty), flavor: item.name, shape: item.uom, messageOnCake: 'Existing branch stock item', designNotes: 'Existing branch stock advance order', attachmentName: '', orderValue, advanceAmount: adv, balanceAmount: orderValue - adv, salesperson: user, paymentMode: storeForm.paymentMode as 'cash'|'upi'|'card' });
    printHtml(`Advance ${order.orderNo}`, `<div class="stamp">ADVANCE ORDER SLIP</div><h2>${order.orderNo}</h2><div class="row"><span>Customer</span><b>${order.customerName}</b></div><div class="row"><span>Mobile</span><b>${order.mobile}</b></div><div class="row"><span>Item</span><b>${item.name}</b></div><div class="row"><span>Qty</span><b>${qty} ${item.uom}</b></div><div class="row"><span>Delivery</span><b>${order.deliveryDate} ${order.deliveryTime}</b></div><div class="row"><span>Total</span><b>Rs ${order.orderValue}</b></div><div class="row"><span>Advance</span><b>Rs ${order.advanceAmount}</b></div><div class="row"><span>Balance</span><b>Rs ${order.balanceAmount}</b></div><p>Stock will reduce only on full payment/final invoice.</p>`);
    setStoreForm({ customerName:'', mobile:'', deliveryDate:'', deliveryTime:'', itemName: items[0]?.name || '', quantity:'1', advanceAmount:'', paymentMode:'cash' });
  };

  const save = () => {
    const required = isVRSNB
      ? ['customerName','mobile','deliveryDate','cakeKg','flavor','shape','orderValue','advanceAmount']
      : ['customerName','mobile','deliveryDate','cakeKg','flavor','shape','orderValue','advanceAmount','salesperson'];
    const missing = required.find((k)=>!String(form[k as keyof typeof form]).trim());
    if (missing) { setError(isVRSNB ? 'Please fill customer name, mobile, delivery date, cake, value and advance details.' : 'Please fill customer name, mobile, delivery date, cake, value, advance and salesperson.'); return; }
    const orderValue = Number(form.orderValue), adv = Number(form.advanceAmount);
    if (!orderValue || adv < 0 || adv > orderValue) { setError('Check order value and advance amount.'); return; }
    const orderStaff = isVRSNB ? user : form.salesperson;
    const order = addAdvanceCakeOrder({ branch, customerName: form.customerName, mobile: form.mobile, orderDate: new Date().toISOString().split('T')[0], deliveryDate: form.deliveryDate, deliveryTime: form.deliveryTime, cakeKg: form.cakeKg, flavor: form.flavor, shape: form.shape, messageOnCake: form.messageOnCake, designNotes: form.designNotes, attachmentName: form.attachmentName, orderValue, advanceAmount: adv, balanceAmount: orderValue - adv, salesperson: orderStaff, paymentMode: form.paymentMode as 'cash'|'upi'|'card' });
    printHtml(`Sales Order ${order.orderNo}`, `<div class="stamp">SALES ORDER SLIP</div><h2>${order.orderNo}</h2><div class="row"><span>Customer</span><b>${order.customerName}</b></div><div class="row"><span>Mobile</span><b>${order.mobile}</b></div><div class="row"><span>Cake</span><b>${order.cakeKg}kg ${order.flavor} ${order.shape}</b></div><div class="row"><span>Delivery</span><b>${order.deliveryDate} ${order.deliveryTime}</b></div><div class="row"><span>Total</span><b>Rs ${order.orderValue}</b></div><div class="row"><span>Advance</span><b>Rs ${order.advanceAmount}</b></div><div class="row"><span>Balance</span><b>Rs ${order.balanceAmount}</b></div><div class="row"><span>${isVRSNB ? 'Cashier' : 'Salesperson'}</span><b>${orderStaff}</b></div>`);
    setForm({ customerName:'', mobile:'', deliveryDate:'', deliveryTime:'', cakeKg:'', flavor:'', shape:'', messageOnCake:'', designNotes:'', orderValue:'', advanceAmount:'', salesperson:'', paymentMode:'cash', attachmentName:'' });
  };

  const finalInvoice = async (o: CakeAdvanceOrder) => {
    const { billNo } = nextBranchInvoice(branch);
    if (o.designNotes === 'Existing branch stock advance order') {
      const qty = Number(o.cakeKg || 0);
      await manualUpdateStock(branch, o.flavor, Math.max(0, stockQty(branchStock, o.flavor) - qty), currentUser?.displayName || 'Staff');
      await fetchBranchData(branch);
    }
    if (o.balanceAmount > 0) {
      addCashMovement({ branch, amount: o.balanceAmount, paymentMode: finalPaymentMode, direction: 'in', purpose: 'Advance balance collection', enteredBy: currentUser?.displayName || 'Staff', referenceNumber: billNo, remarks: `${o.orderNo} ${o.customerName}` });
    }
    updateAdvanceStatus(o.id, 'Paid In Full', currentUser?.displayName || 'Staff', { finalInvoiceBillNo: billNo, balanceAmount: 0 });
    const itemLabel = o.designNotes === 'Existing branch stock advance order' ? `${o.flavor} - ${o.cakeKg} ${o.shape}` : `${o.cakeKg}kg ${o.flavor} ${o.shape}`;
    printHtml(`Final Invoice ${billNo}`, `<div class="stamp">ORIGINAL BILL</div><h2>Final Tax Invoice</h2><p class="b">${billNo}</p><div class="row"><span>Customer</span><b>${o.customerName}</b></div><div class="row"><span>Mobile</span><b>${o.mobile}</b></div><div class="row"><span>Order Number</span><b>${o.orderNo}</b></div><div class="row"><span>Delivery</span><b>${o.deliveryDate} ${o.deliveryTime}</b></div><div class="row"><span>Item</span><b>${itemLabel}</b></div><div class="row"><span>Total Order Amount</span><b>Rs ${o.orderValue}</b></div><div class="row"><span>Advance Received</span><b>Rs ${o.advanceAmount}</b></div><div class="row"><span>Balance Received Today</span><b>Rs ${o.balanceAmount}</b></div><div class="row"><span>Total Received</span><b>Rs ${o.orderValue}</b></div><div class="row"><span>Status</span><b>PAID IN FULL</b></div><p>${isVRSNB ? 'Cashier' : 'Salesperson'}: ${o.salesperson}</p><p>Biller: ${currentUser?.displayName || 'Staff'}</p>`);
  };

  return <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
    <Section title="Advance Order" icon={<Gift className="size-5"/>}>
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
        <button onClick={()=>setMode('store')} className={cn('rounded-xl px-3 py-2 text-sm font-black', mode==='store'?'bg-slate-950 text-white':'text-slate-600')}>Store Items</button>
        <button onClick={()=>setMode('cake')} className={cn('rounded-xl px-3 py-2 text-sm font-black', mode==='cake'?'bg-slate-950 text-white':'text-slate-600')}>Cake Orders</button>
      </div>
      {mode === 'store' ? <div className="grid gap-3">
        <Field label="Customer Name *"><Input value={storeForm.customerName} onChange={(e)=>updateStore('customerName',e.target.value)}/></Field>
        <Field label="Mobile Number *"><Input value={storeForm.mobile} onChange={(e)=>updateStore('mobile',e.target.value)}/></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Delivery Date *"><Input type="date" value={storeForm.deliveryDate} onChange={(e)=>updateStore('deliveryDate',e.target.value)}/></Field><Field label="Delivery Time"><Input type="time" value={storeForm.deliveryTime} onChange={(e)=>updateStore('deliveryTime',e.target.value)}/></Field></div>
        <Field label="Item"><Select value={storeForm.itemName} onChange={(e)=>updateStore('itemName',e.target.value)}>{items.map((i)=><option key={i.name}>{i.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Quantity"><Input type="number" min="0" value={storeForm.quantity} onChange={(e)=>updateStore('quantity',e.target.value)}/></Field><Field label="Advance Amount"><Input type="number" min="0" value={storeForm.advanceAmount} onChange={(e)=>updateStore('advanceAmount',e.target.value)}/></Field></div>
        <Field label="Payment Mode"><Select value={storeForm.paymentMode} onChange={(e)=>updateStore('paymentMode',e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></Select></Field>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-black text-red-700">{error}</p>}
        <PrimaryButton onClick={saveStoreAdvance}><Printer className="size-4"/>Save Store Item Advance</PrimaryButton>
      </div> : <div className="grid gap-3">
        <Field label="Customer Name *"><Input value={form.customerName} onChange={(e)=>update('customerName',e.target.value)}/></Field><Field label="Mobile Number *"><Input value={form.mobile} onChange={(e)=>update('mobile',e.target.value)}/></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Delivery Date *"><Input type="date" value={form.deliveryDate} onChange={(e)=>update('deliveryDate',e.target.value)}/></Field><Field label="Delivery Time"><Input type="time" value={form.deliveryTime} onChange={(e)=>update('deliveryTime',e.target.value)}/></Field></div>
        <div className="grid grid-cols-3 gap-3"><Field label="Cake KG *"><Input value={form.cakeKg} onChange={(e)=>update('cakeKg',e.target.value)}/></Field><Field label="Flavor *"><Input value={form.flavor} onChange={(e)=>update('flavor',e.target.value)}/></Field><Field label="Shape *"><Input value={form.shape} onChange={(e)=>update('shape',e.target.value)}/></Field></div>
        <Field label="Message on cake"><Input value={form.messageOnCake} onChange={(e)=>update('messageOnCake',e.target.value)}/></Field><Field label="Design notes"><Textarea value={form.designNotes} onChange={(e)=>update('designNotes',e.target.value)}/></Field><Field label="Attachment/Image filename"><Input value={form.attachmentName} onChange={(e)=>update('attachmentName',e.target.value)} placeholder="Attach through real file storage later"/></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Order Value *"><Input type="number" value={form.orderValue} onChange={(e)=>update('orderValue',e.target.value)}/></Field><Field label="Advance Amount *"><Input type="number" value={form.advanceAmount} onChange={(e)=>update('advanceAmount',e.target.value)}/></Field></div>
        <div className="grid grid-cols-2 gap-3">{!isVRSNB && <Field label="Salesperson *"><Select value={form.salesperson} onChange={(e)=>update('salesperson',e.target.value)}><option value="">Select</option>{people.concat(['Counter Sales']).map(p=><option key={p}>{p}</option>)}</Select></Field>}<Field label="Payment Mode"><Select value={form.paymentMode} onChange={(e)=>update('paymentMode',e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></Select></Field>{isVRSNB && <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800 ring-1 ring-emerald-100">Cashier: {user}</div>}</div>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-black text-red-700">{error}</p>}
        <PrimaryButton onClick={save}><Printer className="size-4"/>Generate Sales Order Slip & Send to Store</PrimaryButton>
      </div>}
    </Section>
    <Section title="Advance Order Pipeline" icon={<CalendarClock className="size-5"/>} action={<Select value={finalPaymentMode} onChange={(e)=>setFinalPaymentMode(e.target.value as typeof finalPaymentMode)} className="w-40"><option value="cash">Final Cash</option><option value="upi">Final UPI</option><option value="card">Final Card</option></Select>}>
      <div className="space-y-3">{orders.map(o=><div key={o.id} className="rounded-3xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-black">{o.orderNo} - {o.customerName}</p><p className="text-sm font-bold text-slate-500">{o.mobile} - {o.designNotes === 'Existing branch stock advance order' ? `${o.flavor} ${o.cakeKg} ${o.shape}` : `${o.cakeKg}kg ${o.flavor} ${o.shape}`} - Delivery {o.deliveryDate} {o.deliveryTime}</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">{o.status}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-4"><Kpi label="Order" value={money(o.orderValue)} icon={<Receipt className="size-4"/>}/><Kpi label="Advance" value={money(o.advanceAmount)} icon={<Banknote className="size-4"/>} tone="green"/><Kpi label="Balance" value={money(o.balanceAmount)} icon={<IndianRupee className="size-4"/>} tone="amber"/><div className="flex flex-col justify-center gap-2"><SoftButton onClick={()=>void finalInvoice(o)} disabled={o.status === 'Paid In Full'}><Printer className="size-4"/>Final Invoice</SoftButton></div></div></div>)}</div>
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
  const { bills, creditSales, returns, cashierClosures, purchasePayments, cashMovements, addCashierClosure } = useBranchOpsStore();
  const [opening, setOpening] = useState('0');
  const [closing, setClosing] = useState('');
  const [notes, setNotes] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const user = currentUser?.displayName || currentUser?.username || 'Cashier';

  const todayBills = bills.filter((b) => b.branch === branch && today(b.createdAt));
  const todayReturns = returns.filter((r) => r.branch === branch && today(r.createdAt));
  const todayExpenses = purchasePayments.filter((p) => p.branch === branch && today(p.createdAt));
  const todayCreditSales = creditSales.filter((c) => c.branch === branch && today(c.createdAt));
  const todayCreditCollections = cashMovements.filter((m) => m.branch === branch && today(m.dateTime) && m.direction === 'in' && (m.purpose === 'Credit collection' || m.purpose === 'Credit upfront collection'));
  const todayAdvancePayments = cashMovements.filter((m) => m.branch === branch && today(m.dateTime) && m.direction === 'in' && (m.purpose === 'Cake advance received' || m.purpose === 'Advance balance collection'));

  const totalSales = todayBills.reduce((s, b) => s + b.total, 0);
  const cash = todayBills.reduce((s, b) => s + (b.paymentMode === 'cash' ? b.total : b.paymentMode === 'split' ? Number(b.split?.cash || 0) : 0), 0);
  const upi = todayBills.reduce((s, b) => s + (b.paymentMode === 'upi' ? b.total : b.paymentMode === 'split' ? Number(b.split?.upi || 0) : 0), 0);
  const card = todayBills.reduce((s, b) => s + (b.paymentMode === 'card' ? b.total : b.paymentMode === 'split' ? Number(b.split?.card || 0) : 0), 0);
  const creditSalesTotal = todayCreditSales.reduce((s, c) => s + c.total, 0);
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

  const printClosure = () => printHtml(`${branch} Cashier Closure`, `<div class="stamp">CASHIER CLOSURE</div><h2>${BRANCH_LABELS[branch]}</h2><div class="row"><span>Cashier</span><b>${user}</b></div><div class="row"><span>Bills</span><b>${todayBills.length}</b></div><div class="row"><span>Total Sales</span><b>₹${totalSales.toFixed(2)}</b></div><div class="row"><span>Opening Cash</span><b>₹${Number(opening || 0).toFixed(2)}</b></div><div class="row"><span>Cash Sales</span><b>₹${cash.toFixed(2)}</b></div><div class="row"><span>UPI Sales</span><b>₹${upi.toFixed(2)}</b></div><div class="row"><span>Card Sales</span><b>₹${card.toFixed(2)}</b></div><div class="row"><span>Split Payments</span><b>₹${splitTotal.toFixed(2)}</b></div><div class="row"><span>Credit Sales</span><b>₹${creditSalesTotal.toFixed(2)}</b></div><div class="row"><span>Credit Collections</span><b>₹${(creditCollectionCash + creditCollectionDigital).toFixed(2)}</b></div><div class="row"><span>Expenses</span><b>₹${expenses.toFixed(2)}</b></div><div class="row"><span>Refunds</span><b>₹${refunds.toFixed(2)}</b></div><div class="row"><span>Expected Cash</span><b>₹${expected.toFixed(2)}</b></div><div class="row"><span>Counted Cash</span><b>₹${countedCash.toFixed(2)}</b></div><div class="row"><span>Difference</span><b>₹${diff.toFixed(2)}</b></div><p>${notes || ''}</p>`);

  const exportClosure = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Opening Cash', Number(opening || 0)],
      ['Total Sales', totalSales],
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
      <Kpi label="Total Sales" value={money(totalSales)} icon={<Receipt/>} tone="green"/>
      <Kpi label="Cash Sales" value={money(cash)} icon={<Banknote/>} tone="green"/>
      <Kpi label="UPI/Card" value={money(upi + card)} icon={<CreditCard/>} tone="blue"/>
      <Kpi label="Credit Due" value={money(creditSales.filter((c)=>c.branch===branch && c.status !== 'Paid' && c.status !== 'Written Off').reduce((sum,c)=>sum+c.balanceDue,0))} icon={<WalletCards/>} tone="amber"/>
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

