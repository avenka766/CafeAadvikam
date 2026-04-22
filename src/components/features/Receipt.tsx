import { X, Printer } from 'lucide-react';
import { formatCurrency, formatDate, formatTime } from '@/lib/utils';
import { CAFE_CONFIG } from '@/constants/config';
import type { Order } from '@/types';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', upi: 'UPI', card: 'Card', part_payment: 'Split Payment', unpaid: 'Unpaid',
};

interface ReceiptProps {
  order: Order;
  onClose: () => void;
}

export default function Receipt({ order, onClose }: ReceiptProps) {
  const handlePrint = () => { window.print(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-[90vw] max-w-sm max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="flex justify-between p-3 print:hidden">
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-body font-semibold active:scale-95">
            <Printer className="size-4" />
            Print
          </button>
          <button onClick={onClose} className="size-8 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 pb-6 font-body text-gray-900" id="receipt-content">
          {/* Header */}
          <div className="text-center mb-4">
            <h2 className="font-display text-xl font-bold text-gray-900">{CAFE_CONFIG.name}</h2>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{CAFE_CONFIG.tagline}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{CAFE_CONFIG.venture}</p>
            <p className="text-xs text-gray-500 mt-1">{CAFE_CONFIG.address}</p>
          </div>

          <div className="border-t border-dashed border-gray-300 my-3" />

          {/* Order Info */}
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Order #{String(order.orderNumber).padStart(3, '0')}</span>
            <span>{formatDate(order.createdAt)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{order.orderType === 'dine_in' ? `Table ${order.tableNumber}` : 'Takeaway'}</span>
            <span>{formatTime(order.createdAt)}</span>
          </div>
          {order.customerName && (
            <div className="text-xs text-gray-600 mb-1">Customer: {order.customerName}</div>
          )}

          <div className="border-t border-dashed border-gray-300 my-3" />

          {/* Items */}
          <div className="space-y-1.5">
            {order.items.map((ci) => (
              <div key={ci.menuItem.id} className="flex justify-between text-sm">
                <div className="flex-1">
                  <span className="text-gray-900">{ci.menuItem.name}</span>
                  <span className="text-gray-500 ml-1.5">×{ci.quantity}</span>
                </div>
                <span className="tabular-nums text-gray-900 ml-2 shrink-0">
                  {formatCurrency(ci.menuItem.price * ci.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-dashed border-gray-300 my-3" />

          {/* Totals */}
          {order.discount > 0 && (
            <>
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-700 mb-1">
                <span>Discount</span>
                <span className="tabular-nums">-{formatCurrency(order.discount)}</span>
              </div>
              <div className="border-t border-dashed border-gray-300 my-2" />
            </>
          )}
          <div className="flex justify-between font-bold text-base">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(order.total)}</span>
          </div>

          {/* GST line */}
          {order.status === 'served' && (
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>Incl. GST 5% (CGST 2.5% + SGST 2.5%)</span>
              <span className="tabular-nums">{formatCurrency(Math.round((order.total - order.total / 1.05) * 100) / 100)}</span>
            </div>
          )}

          {/* Payment info */}
          {order.paymentType && order.paymentType !== 'unpaid' && (
            <>
              <div className="border-t border-dashed border-gray-300 my-3" />
              <div className="text-xs text-gray-600">
                <p>Payment: {PAYMENT_LABELS[order.paymentType]}</p>
                {order.paymentType === 'part_payment' && order.paymentBreakdown && (
                  <div className="mt-1 space-y-0.5 text-gray-500">
                    {order.paymentBreakdown.cash > 0 && <p>Cash: {formatCurrency(order.paymentBreakdown.cash)}</p>}
                    {order.paymentBreakdown.upi > 0 && <p>UPI: {formatCurrency(order.paymentBreakdown.upi)}</p>}
                    {order.paymentBreakdown.card > 0 && <p>Card: {formatCurrency(order.paymentBreakdown.card)}</p>}
                  </div>
                )}
                {order.billedBy && <p className="mt-1">Billed by: {order.billedBy}</p>}
              </div>
            </>
          )}

          <div className="border-t border-dashed border-gray-300 my-3" />

          {/* Footer */}
          <div className="text-center text-xs text-gray-500">
            <p className="font-medium">Thank you for dining with us!</p>
            <p className="mt-0.5">~ {CAFE_CONFIG.type} ~</p>
          </div>
        </div>
      </div>
    </div>
  );
}
