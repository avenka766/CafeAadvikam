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

// GST 5% inclusive → split CGST 2.5% + SGST 2.5%
function calcGst(total: number) {
  const base = Math.round((total / 1.05) * 100) / 100;
  const half = Math.round(((total - base) / 2) * 100) / 100;
  return { base, cgst: half, sgst: half };
}

interface ReceiptProps {
  order: Order;
  onClose: () => void;
}

export default function Receipt({ order, onClose }: ReceiptProps) {
  const handlePrint = () => {
    const el = document.getElementById('receipt-print-area');
    if (!el) return;
    const win = window.open('', '_blank', 'width=380,height=700');
    if (!win) return;
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
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const dateObj = new Date(order.createdAt);
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yy = String(dateObj.getFullYear()).slice(2);
  const dateStr = `${dd}/${mm}/${yy}`;
  const timeStr = formatTime(order.createdAt);
  const billNo  = String(order.orderNumber).padStart(4, '0');
  const kotNo   = String(order.orderNumber).padStart(2, '0');
  const orderLabel = order.orderType === 'dine_in' && order.tableNumber
    ? `Table ${order.tableNumber}` : 'Pick Up';

  // C-06 FIX: compute GST only on food total — parcel charges are not subject to food GST
  const parcelCharges = order.parcelCharges ?? 0;
  const foodTotal = order.total - parcelCharges;
  const { base, cgst, sgst } = calcGst(foodTotal);
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
