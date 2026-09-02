import { X, Printer } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import type { Order } from '@/types';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', upi: 'Paid via UPI', card: 'Card', part_payment: 'Split Payment', unpaid: 'Unpaid',
};

// Actual cafe details matching the physical receipt
const CAFE = {
  name: 'Café Aadvikam',
  address: '#109/1C, Hosur main Road, Berigai,\nSoolagiri TK, Krishnagiri DT,\nTamilnadu 635105',
  gst: '33AAZFV1266C1ZZ',
  fssai: '12425011000098',
};

function fmt(n: number) { return n.toFixed(2); }

// GST 5% inclusive → split CGST 2.5% + SGST 2.5%.
// BUG FIX (audit): this used to run on `order.total` (post-discount, minus
// parcel charges) — but the bill actually printed at checkout time
// (BillingDashboard.tsx's receiptTotals/taxableAmount/gstParts) computes the
// Sub Total/CGST/SGST split from the PRE-discount gross of each line
// (price * qty), summed per item, with any discount shown as its own
// separate line below. For a discounted order those two calculations don't
// agree — the checkout bill and this "View Receipt"/"Print Duplicate" view
// of the SAME order would print different Sub Total/CGST/SGST figures,
// which matters for GST reconciliation. Mirrors the checkout math exactly
// so both are always the same number for the same order.
function taxableAmount(total: number): number {
  return Math.round((Number(total || 0) / 1.05) * 100) / 100;
}
function gstParts(total: number) {
  const taxable = taxableAmount(total);
  const tax = Math.max(0, Number(total || 0) - taxable);
  const cgst = Math.round((tax / 2) * 100) / 100;
  const sgst = Math.round((tax - cgst) * 100) / 100;
  return { taxable, cgst, sgst };
}

interface ReceiptProps {
  order: Order;
  onClose: () => void;
}

export default function Receipt({ order, onClose }: ReceiptProps) {
  // BUG FIX (audit): this used to open a real, visible `window.open(...)`
  // popup for every print — a whole separate browser window flashing on
  // screen. BillingDashboard.tsx's printCounterSlip already solved this for
  // every other Cafe print (KOT, bill, credit slip, advance slip) with an
  // off-screen, aria-hidden 1x1 iframe that's never visible at any point —
  // that fix never reached this component, which every "View Receipt" /
  // "Print Duplicate" action in OrderCard still routes through. Same silent
  // pattern here now.
  const handlePrint = () => {
    const el = document.getElementById('receipt-print-area');
    if (!el) return;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.left = '-10000px';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.border = '0';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';
    document.body.appendChild(frame);

    const win = frame.contentWindow;
    if (!win) { frame.remove(); return; }

    win.document.open();
    win.document.write(`<!DOCTYPE html><html><head><title>Bill #${order.orderNumber}</title>
<style>
@page{margin:4mm;size:80mm auto}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;width:76mm;font-size:12px;color:#000}
.c{text-align:center}.r{text-align:right}.bold{font-weight:900}
.d{border-top:1px dashed #000;margin:4px 0}.s{border-top:1px solid #000;margin:4px 0}
table{width:100%;border-collapse:collapse}td{padding:1px 2px;vertical-align:top}
</style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();

    let cleaned = false;
    const finish = () => { if (cleaned) return; cleaned = true; frame.remove(); };
    win.onafterprint = finish;
    window.setTimeout(finish, 60_000);
    setTimeout(() => { try { win.focus(); win.print(); } catch { finish(); } }, 350);
  };

  const dateObj = new Date(order.createdAt);
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yy = String(dateObj.getFullYear()).slice(2);
  const dateStr = `${dd}/${mm}/${yy}`;
  const timeStr = formatTime(order.createdAt);
  // OFFLINE FIX (2026-09-01): an order completed while offline doesn't have
  // a real, sequential bill number yet — orderNumber is a 0 placeholder
  // until it syncs (see orderStore.ts's submitOrder / Order.pendingSync).
  // Never print the placeholder as if it were a real number.
  const billNo  = order.pendingSync ? `OFFLINE-${order.id.slice(0, 8).toUpperCase()}` : String(order.orderNumber).padStart(4, '0');
  const kotNo   = String(order.orderNumber).padStart(2, '0');
  const orderLabel = order.orderType === 'dine_in' && order.tableNumber
    ? `Table ${order.tableNumber}` : 'Pick Up';

  // C-06 FIX: compute GST only on food total — parcel charges are not subject
  // to food GST (naturally excluded here since only order.items are summed;
  // parcelCharges is a separate field, never part of this total).
  const parcelCharges = order.parcelCharges ?? 0;
  const grossFoodTotal = order.items.reduce((s, ci) => s + ci.menuItem.price * ci.quantity, 0);
  const base = order.items.reduce((s, ci) => s + taxableAmount(ci.menuItem.price * ci.quantity), 0);
  const { cgst, sgst } = gstParts(grossFoodTotal);
  const totalQty = order.items.reduce((s, ci) => s + ci.quantity, 0);
  const cashierName = order.billedBy || order.createdBy || 'biller';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-[92vw] max-w-sm max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Action buttons */}
        <div className="flex justify-between p-3 print:hidden sticky top-0 bg-white z-10 border-b border-gray-100">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-bold active:scale-95 transition-all">
            <Printer className="size-4" /> Print Receipt
          </button>
          <button onClick={onClose} className="size-9 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        {/* ── RECEIPT ── */}
        <div id="receipt-print-area" className="px-5 py-4 font-mono text-[12px] text-gray-900 select-none leading-snug">

          {/* KOT SLIP */}
          <div className="text-center mb-1">
            <p className="font-bold">{dateStr} {timeStr}</p>
            <p className="font-bold">KOT - {kotNo}</p>
            <p className="text-base font-black tracking-wide">{orderLabel}</p>
          </div>
          <div className="border-t border-dashed border-gray-500 my-2" />
          <table className="w-full">
            <thead>
              <tr className="font-bold text-[11px]">
                <td className="pb-0.5">Item</td>
                <td className="text-center pb-0.5">Special Note</td>
                <td className="text-right pb-0.5">Qty.</td>
              </tr>
            </thead>
            <tbody>
              {order.items.map(ci => (
                <tr key={ci.menuItem.id} className="font-bold">
                  <td className="py-0.5 pr-2">{ci.menuItem.name}</td>
                  <td className="text-center text-gray-500 text-[11px]">{ci.notes || '--'}</td>
                  <td className="text-right">{ci.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Divider between KOT and Bill */}
          <div className="border-t-2 border-dashed border-gray-500 my-3" />

          {/* PAID BILL */}
          {order.pendingSync && (
            <div className="text-center mb-2 border border-dashed border-black py-1">
              <p className="text-[11px] font-black">PROVISIONAL - OFFLINE</p>
              <p className="text-[10px] font-bold">Not a final GST bill</p>
            </div>
          )}
          <div className="text-center mb-2">
            <p className="text-sm font-black tracking-widest">PAID</p>
            <p className="text-sm font-black">{CAFE.name}</p>
            <p className="text-[10px] text-gray-600 whitespace-pre-line leading-tight mt-0.5">{CAFE.address}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">GST No: {CAFE.gst}</p>
            <p className="text-[10px] text-gray-600">FSSAI No: {CAFE.fssai}</p>
          </div>

          <div className="border-t border-gray-500 my-2" />

          <div className="text-[11px] mb-1">
            <span className="font-bold">Name: </span>
            <span>{order.customerName || ''}</span>
          </div>

          <div className="border-t border-gray-500 my-1" />

          <div className="grid grid-cols-2 text-[11px] mb-0.5">
            <span>Date: {dateStr}</span>
            <span className="text-right font-bold">{orderLabel}</span>
          </div>
          <div className="text-[11px] mb-1">{timeStr}</div>
          <div className="grid grid-cols-2 text-[11px] mb-1">
            <span>Cashier: {cashierName}</span>
            <span className="text-right">Bill No.: {billNo}</span>
          </div>

          <div className="border-t border-gray-500 my-2" />

          <table className="w-full text-[11px]">
            <thead>
              <tr className="font-bold border-b border-gray-400">
                <td className="pb-1">Item</td>
                <td className="text-center pb-1">Qty.</td>
                <td className="text-right pb-1">Price</td>
                <td className="text-right pb-1">Amount</td>
              </tr>
            </thead>
            <tbody>
              {order.items.map(ci => {
                const unitBase = ci.menuItem.price / 1.05;
                return (
                  <tr key={ci.menuItem.id}>
                    <td className="py-0.5 pr-1">{ci.menuItem.name}</td>
                    <td className="text-center">{ci.quantity}</td>
                    <td className="text-right tabular-nums">{fmt(unitBase)}</td>
                    <td className="text-right tabular-nums">{fmt(unitBase * ci.quantity)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="border-t border-gray-500 my-2" />

          <table className="w-full text-[11px]">
            <tbody>
              <tr>
                <td>Total Qty: {totalQty}</td>
                <td className="text-right">Sub Total</td>
                <td className="text-right tabular-nums pl-3">{fmt(base)}</td>
              </tr>
              <tr>
                <td />
                <td className="text-right">CGST@2.5  2.5%</td>
                <td className="text-right tabular-nums pl-3">{fmt(cgst)}</td>
              </tr>
              <tr>
                <td />
                <td className="text-right">SGST@2.5  2.5%</td>
                <td className="text-right tabular-nums pl-3">{fmt(sgst)}</td>
              </tr>
              {/* C-06 FIX: show parcel charges as a separate line item */}
              {parcelCharges > 0 && (
                <tr>
                  <td />
                  <td className="text-right">Parcel Charges</td>
                  <td className="text-right tabular-nums pl-3">{fmt(parcelCharges)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="border-t-2 border-gray-900 my-1.5" />
          <div className="flex justify-between font-black text-sm">
            <span>Grand Total</span>
            <span className="tabular-nums">₹{fmt(order.total)}</span>
          </div>
          <div className="border-t-2 border-gray-900 my-1.5" />

          {order.discount > 0 && (
            <div className="flex justify-between text-[11px] text-emerald-700 mb-1">
              <span>Discount</span>
              <span className="tabular-nums">-₹{fmt(order.discount)}</span>
            </div>
          )}

          {order.paymentType && order.paymentType !== 'unpaid' && (
            <p className="text-[11px] text-gray-600 mt-0.5">{PAYMENT_LABELS[order.paymentType] || order.paymentType}</p>
          )}
          {order.paymentType === 'part_payment' && order.paymentBreakdown && (
            <div className="text-[11px] text-gray-500 ml-2 space-y-0.5 mt-0.5">
              {order.paymentBreakdown.cash > 0 && <p>Cash: ₹{fmt(order.paymentBreakdown.cash)}</p>}
              {order.paymentBreakdown.upi  > 0 && <p>UPI:  ₹{fmt(order.paymentBreakdown.upi)}</p>}
              {order.paymentBreakdown.card > 0 && <p>Card: ₹{fmt(order.paymentBreakdown.card)}</p>}
            </div>
          )}

          <div className="border-t border-dashed border-gray-400 my-2" />
          <p className="text-center text-[11px] font-bold">Thank You &amp; Visit Again...!!!</p>
        </div>
      </div>
    </div>
  );
}
