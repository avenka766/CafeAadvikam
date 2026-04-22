import { useState } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatTime } from '@/lib/utils';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/constants/config';
import { Clock, MapPin, User, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import type { Order, OrderStatus, PaymentType, PaymentBreakdown } from '@/types';
import Receipt from './Receipt';

interface OrderCardProps {
  order: Order;
  showActions?: boolean;
}

const STATUS_FLOW: OrderStatus[] = ['pending', 'preparing', 'ready', 'served'];

const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: '💵 Cash',
  upi: '📱 UPI',
  card: '💳 Card',
  part_payment: '🔀 Split Payment',
  unpaid: 'Unpaid',
};

type SplitMethod = 'cash' | 'upi' | 'card';

export default function OrderCard({ order, showActions = false }: OrderCardProps) {
  const { updateOrderStatus, applyDiscount, setPaymentType } = useOrderStore();
  const { currentUser } = useAuthStore();
  const [expanded, setExpanded] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discType, setDiscType] = useState<'percentage' | 'flat'>('percentage');
  const [discValue, setDiscValue] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Split payment state
  const [splitMode, setSplitMode] = useState(false);
  const [splitMethods, setSplitMethods] = useState<SplitMethod[]>([]);
  const [splitCash, setSplitCash] = useState('');
  const [splitUpi, setSplitUpi] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [splitError, setSplitError] = useState('');

  const currentIdx = STATUS_FLOW.indexOf(order.status);
  const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;
  const billerName = currentUser?.displayName || currentUser?.username || '';

  const handleApplyDiscount = () => {
    const val = parseFloat(discValue);
    if (!isNaN(val) && val > 0) {
      applyDiscount(order.id, discType, val);
      setShowDiscount(false);
      setDiscValue('');
    }
  };

  const handleSinglePayment = (pt: PaymentType) => {
    setPaymentType(order.id, pt, billerName);
    updateOrderStatus(order.id, 'served');
    setShowPayment(false);
  };

  // Toggle a split method on/off
  const toggleSplitMethod = (method: SplitMethod) => {
    setSplitError('');
    setSplitMethods((prev) => {
      const newMethods = prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method];
      // Reset amounts when methods change
      if (!newMethods.includes('cash')) setSplitCash('');
      if (!newMethods.includes('upi')) setSplitUpi('');
      if (!newMethods.includes('card')) setSplitCard('');
      return newMethods;
    });
  };

  // Auto-fill remaining amount for the last empty field
  const getAutoFillAmount = (field: SplitMethod): string => {
    const cashAmt = field === 'cash' ? 0 : parseFloat(splitCash) || 0;
    const upiAmt = field === 'upi' ? 0 : parseFloat(splitUpi) || 0;
    const cardAmt = field === 'card' ? 0 : parseFloat(splitCard) || 0;
    const filled = cashAmt + upiAmt + cardAmt;
    const remaining = order.total - filled;
    return remaining > 0 ? String(remaining) : '';
  };

  const handleSplitFieldChange = (field: SplitMethod, value: string) => {
    setSplitError('');
    if (field === 'cash') setSplitCash(value);
    if (field === 'upi') setSplitUpi(value);
    if (field === 'card') setSplitCard(value);

    // Auto-fill the remaining field
    const numVal = parseFloat(value) || 0;
    const otherFields = splitMethods.filter((m) => m !== field);

    if (otherFields.length === 1) {
      const otherField = otherFields[0];
      // Calculate what the third field already has
      const thirdField = splitMethods.find((m) => m !== field && m !== otherField);
      let thirdAmt = 0;
      if (thirdField) {
        if (thirdField === 'cash') thirdAmt = parseFloat(splitCash) || 0;
        if (thirdField === 'upi') thirdAmt = parseFloat(splitUpi) || 0;
        if (thirdField === 'card') thirdAmt = parseFloat(splitCard) || 0;
      }
      const remaining = Math.max(0, order.total - numVal - thirdAmt);
      if (otherField === 'cash') setSplitCash(remaining > 0 ? String(remaining) : '');
      if (otherField === 'upi') setSplitUpi(remaining > 0 ? String(remaining) : '');
      if (otherField === 'card') setSplitCard(remaining > 0 ? String(remaining) : '');
    }
  };

  const handleSplitPayment = () => {
    const cashAmt = splitMethods.includes('cash') ? (parseFloat(splitCash) || 0) : 0;
    const upiAmt = splitMethods.includes('upi') ? (parseFloat(splitUpi) || 0) : 0;
    const cardAmt = splitMethods.includes('card') ? (parseFloat(splitCard) || 0) : 0;
    const totalPaid = cashAmt + upiAmt + cardAmt;

    if (Math.abs(totalPaid - order.total) > 0.5) {
      if (totalPaid < order.total) {
        setSplitError(`Short by ${formatCurrency(order.total - totalPaid)}. Total: ${formatCurrency(order.total)}`);
      } else {
        setSplitError(`Over by ${formatCurrency(totalPaid - order.total)}. Total: ${formatCurrency(order.total)}`);
      }
      return;
    }

    setSplitError('');
    const breakdown: PaymentBreakdown = { cash: cashAmt, upi: upiAmt, card: cardAmt };
    setPaymentType(order.id, 'part_payment', billerName, breakdown);
    updateOrderStatus(order.id, 'served');
    resetPaymentState();
  };

  const resetPaymentState = () => {
    setShowPayment(false);
    setSplitMode(false);
    setSplitMethods([]);
    setSplitCash('');
    setSplitUpi('');
    setSplitCard('');
    setSplitError('');
  };

  // Workflow: pending→preparing→ready (advance buttons), ready→served needs payment
  const canAdvance = showActions && order.status !== 'served' && order.status !== 'cancelled';
  const isPaymentStep = nextStatus === 'served';

  return (
    <>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-bold text-foreground">
              #{String(order.orderNumber).padStart(3, '0')}
            </span>
            <span className={`text-[10px] font-body font-bold px-2 py-0.5 rounded-full border ${ORDER_STATUS_COLORS[order.status]}`}>
              {ORDER_STATUS_LABELS[order.status]}
            </span>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="size-8 flex items-center justify-center rounded-md active:bg-muted">
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>

        {/* Meta */}
        <div className="px-3.5 pb-2 flex flex-wrap gap-3 text-xs text-muted-foreground font-body">
          <span className="flex items-center gap-1"><Clock className="size-3" />{formatTime(order.createdAt)}</span>
          {order.orderType === 'dine_in' && order.tableNumber && (
            <span className="flex items-center gap-1"><MapPin className="size-3" />Table {order.tableNumber}</span>
          )}
          {order.orderType === 'takeaway' && <span className="flex items-center gap-1">📦 Takeaway</span>}
          {order.customerName && <span className="flex items-center gap-1"><User className="size-3" />{order.customerName}</span>}
        </div>

        {/* Items */}
        <div className="px-3.5 pb-2">
          {(expanded ? order.items : order.items.slice(0, 3)).map((ci) => (
            <div key={ci.menuItem.id} className="flex justify-between py-1 text-sm font-body">
              <span className="text-foreground">{ci.quantity}× {ci.menuItem.name}</span>
              <span className="text-muted-foreground tabular-nums shrink-0 ml-2">{formatCurrency(ci.menuItem.price * ci.quantity)}</span>
            </div>
          ))}
          {!expanded && order.items.length > 3 && (
            <p className="text-xs text-muted-foreground font-body py-1">+{order.items.length - 3} more items</p>
          )}
        </div>

        {/* Notes */}
        {order.notes && expanded && (
          <div className="px-3.5 pb-2">
            <p className="text-xs font-body text-muted-foreground bg-muted px-2 py-1.5 rounded-md">📝 {order.notes}</p>
          </div>
        )}

        {/* Totals */}
        <div className="px-3.5 py-2 border-t border-border bg-muted/30">
          {order.discount > 0 && (
            <>
              <div className="flex justify-between text-xs font-body text-muted-foreground mb-1">
                <span>Subtotal</span><span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs font-body text-emerald-600 mb-1">
                <span>Discount ({order.discountType === 'percentage' ? `${order.discountValue}%` : 'flat'})</span>
                <span className="tabular-nums">-{formatCurrency(order.discount)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <span className="text-sm font-body font-semibold">Total</span>
            <span className="font-display text-lg font-bold text-foreground tabular-nums">{formatCurrency(order.total)}</span>
          </div>
        </div>

        {/* Payment badge */}
        {order.paymentType && order.paymentType !== 'unpaid' && (
          <div className="px-3.5 py-2">
            <span className="text-xs font-body font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              {PAYMENT_LABELS[order.paymentType]}
            </span>
            {order.paymentType === 'part_payment' && order.paymentBreakdown && (
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {order.paymentBreakdown.cash > 0 && <span className="text-[10px] font-body bg-muted px-1.5 py-0.5 rounded">💵 {formatCurrency(order.paymentBreakdown.cash)}</span>}
                {order.paymentBreakdown.upi > 0 && <span className="text-[10px] font-body bg-muted px-1.5 py-0.5 rounded">📱 {formatCurrency(order.paymentBreakdown.upi)}</span>}
                {order.paymentBreakdown.card > 0 && <span className="text-[10px] font-body bg-muted px-1.5 py-0.5 rounded">💳 {formatCurrency(order.paymentBreakdown.card)}</span>}
              </div>
            )}
            {order.billedBy && <p className="text-[10px] font-body text-muted-foreground mt-1">Billed by {order.billedBy}</p>}
          </div>
        )}

        {/* Actions */}
        {canAdvance && (
          <div className="px-3.5 py-2.5 border-t border-border flex gap-2">
            {nextStatus && !isPaymentStep && (
              <button
                onClick={() => updateOrderStatus(order.id, nextStatus)}
                className="flex-1 py-2.5 rounded-lg cafe-gradient text-primary-foreground text-sm font-body font-bold active:scale-[0.97] transition-transform"
              >
                Mark as {ORDER_STATUS_LABELS[nextStatus]}
              </button>
            )}
            {isPaymentStep && (
              <button
                onClick={() => setShowPayment(true)}
                className="flex-1 py-2.5 rounded-lg cafe-gradient text-primary-foreground text-sm font-body font-bold active:scale-[0.97] transition-transform"
              >
                Collect Payment
              </button>
            )}
            {order.status !== 'ready' && (
              <button onClick={() => setShowDiscount(!showDiscount)} className="px-3 py-2.5 rounded-lg bg-accent/20 text-accent-foreground text-sm font-body font-semibold active:scale-95">💰</button>
            )}
            <button onClick={() => setShowReceipt(true)} className="px-3 py-2.5 rounded-lg bg-muted text-foreground text-sm font-body active:scale-95" aria-label="Print receipt">
              <Printer className="size-4" />
            </button>
            <button onClick={() => setShowCancelPrompt(true)} className="px-3 py-2.5 rounded-lg bg-destructive/10 text-destructive text-sm font-body font-semibold active:scale-95">✕</button>
          </div>
        )}

        {/* Cancel Reason */}
        {showCancelPrompt && (
          <div className="px-3.5 py-3 border-t border-border bg-destructive/5 space-y-2">
            <p className="text-xs font-body font-semibold text-destructive">Reason for cancellation</p>
            <textarea
              placeholder="e.g. Customer changed mind, item unavailable..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { updateOrderStatus(order.id, 'cancelled', cancelReason || 'No reason provided'); setShowCancelPrompt(false); setCancelReason(''); }}
                className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-body font-bold active:scale-95"
              >
                Confirm Cancel
              </button>
              <button onClick={() => { setShowCancelPrompt(false); setCancelReason(''); }} className="px-4 py-2 rounded-lg bg-muted text-foreground text-sm font-body font-semibold active:scale-95">Back</button>
            </div>
          </div>
        )}

        {/* Payment Panel */}
        {showPayment && (
          <div className="px-3.5 py-3 border-t border-border bg-emerald-50/50 space-y-3">
            {!splitMode ? (
              <>
                <p className="text-xs font-body font-semibold text-foreground">Select Payment Method</p>
                <p className="text-lg font-display font-bold text-primary tabular-nums">{formatCurrency(order.total)}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['cash', 'upi', 'card'] as PaymentType[]).map((pt) => (
                    <button key={pt} onClick={() => handleSinglePayment(pt)} className="py-2.5 rounded-lg bg-card border border-border text-sm font-body font-semibold active:scale-95 transition-transform hover:border-primary">
                      {PAYMENT_LABELS[pt]}
                    </button>
                  ))}
                  <button onClick={() => setSplitMode(true)} className="py-2.5 rounded-lg bg-card border border-border text-sm font-body font-semibold active:scale-95 transition-transform hover:border-primary">
                    🔀 Split Payment
                  </button>
                </div>
                <button onClick={resetPaymentState} className="w-full py-2 text-xs font-body text-muted-foreground active:opacity-70">Cancel</button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-body font-semibold text-foreground">Split Payment</p>
                  <p className="text-xs font-body font-bold text-primary tabular-nums">Total: {formatCurrency(order.total)}</p>
                </div>

                {/* Method selection chips */}
                <p className="text-[10px] font-body text-muted-foreground uppercase font-semibold">Select payment methods</p>
                <div className="flex gap-2">
                  {(['cash', 'upi', 'card'] as SplitMethod[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => toggleSplitMethod(m)}
                      className={`flex-1 py-2 rounded-lg text-sm font-body font-semibold border transition-all active:scale-95 ${
                        splitMethods.includes(m)
                          ? 'cafe-gradient text-primary-foreground border-transparent'
                          : 'bg-card border-border text-foreground'
                      }`}
                    >
                      {m === 'cash' ? '💵 Cash' : m === 'upi' ? '📱 UPI' : '💳 Card'}
                    </button>
                  ))}
                </div>

                {/* Amount inputs for selected methods */}
                {splitMethods.length >= 2 && (
                  <div className="space-y-2">
                    {splitMethods.map((m) => (
                      <div key={m} className="flex items-center gap-2">
                        <span className="text-sm w-16 shrink-0 font-body font-semibold">
                          {m === 'cash' ? '💵 Cash' : m === 'upi' ? '📱 UPI' : '💳 Card'}
                        </span>
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                          <input
                            type="number"
                            placeholder={getAutoFillAmount(m) ? `Remaining: ₹${getAutoFillAmount(m)}` : 'Amount'}
                            value={m === 'cash' ? splitCash : m === 'upi' ? splitUpi : splitCard}
                            onChange={(e) => handleSplitFieldChange(m, e.target.value)}
                            className="w-full pl-7 pr-3 py-2 bg-card border border-border rounded-lg text-sm font-body tabular-nums"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {splitMethods.length < 2 && (
                  <p className="text-xs font-body text-muted-foreground text-center py-2">
                    Select at least 2 payment methods to split
                  </p>
                )}

                {/* Running total */}
                {splitMethods.length >= 2 && (
                  <div className="flex justify-between text-xs font-body bg-card rounded-lg px-3 py-2">
                    <span className="text-muted-foreground">Entered total</span>
                    <span className={`font-bold tabular-nums ${
                      Math.abs(((splitMethods.includes('cash') ? parseFloat(splitCash) || 0 : 0) +
                        (splitMethods.includes('upi') ? parseFloat(splitUpi) || 0 : 0) +
                        (splitMethods.includes('card') ? parseFloat(splitCard) || 0 : 0)) - order.total) < 0.5
                        ? 'text-emerald-600'
                        : 'text-destructive'
                    }`}>
                      {formatCurrency(
                        (splitMethods.includes('cash') ? parseFloat(splitCash) || 0 : 0) +
                        (splitMethods.includes('upi') ? parseFloat(splitUpi) || 0 : 0) +
                        (splitMethods.includes('card') ? parseFloat(splitCard) || 0 : 0)
                      )}
                      {' / '}
                      {formatCurrency(order.total)}
                    </span>
                  </div>
                )}

                {splitError && <p className="text-xs font-body text-destructive">{splitError}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={handleSplitPayment}
                    disabled={splitMethods.length < 2}
                    className="flex-1 py-2.5 rounded-lg cafe-gradient text-primary-foreground text-sm font-body font-bold active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Confirm Split
                  </button>
                  <button onClick={() => { setSplitMode(false); setSplitMethods([]); setSplitError(''); }} className="px-4 py-2.5 rounded-lg bg-muted text-foreground text-sm font-body font-semibold active:scale-95">Back</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Discount Panel */}
        {showDiscount && (
          <div className="px-3.5 py-3 border-t border-border bg-accent/5 space-y-2">
            <div className="flex gap-2">
              <button onClick={() => setDiscType('percentage')} className={`flex-1 py-2 rounded-md text-xs font-body font-semibold ${discType === 'percentage' ? 'bg-accent text-accent-foreground' : 'bg-muted'}`}>Percentage %</button>
              <button onClick={() => setDiscType('flat')} className={`flex-1 py-2 rounded-md text-xs font-body font-semibold ${discType === 'flat' ? 'bg-accent text-accent-foreground' : 'bg-muted'}`}>Flat ₹</button>
            </div>
            <div className="flex gap-2">
              <input type="number" placeholder={discType === 'percentage' ? 'e.g. 10' : 'e.g. 50'} value={discValue} onChange={(e) => setDiscValue(e.target.value)} className="flex-1 px-3 py-2 bg-card border border-border rounded-md text-sm font-body" />
              <button onClick={handleApplyDiscount} className="px-4 py-2 rounded-md cafe-gradient text-primary-foreground text-sm font-body font-bold active:scale-95">Apply</button>
            </div>
          </div>
        )}

        {/* Cancel reason display */}
        {order.status === 'cancelled' && order.cancelReason && (
          <div className="px-3.5 py-2 border-t border-border bg-destructive/5">
            <p className="text-xs font-body text-destructive"><span className="font-semibold">Cancel Reason:</span> {order.cancelReason}</p>
          </div>
        )}

        {/* Served/Cancelled receipt button */}
        {showActions && (order.status === 'served' || order.status === 'cancelled') && (
          <div className="px-3.5 py-2.5 border-t border-border">
            <button onClick={() => setShowReceipt(true)} className="w-full py-2 rounded-lg bg-muted text-foreground text-sm font-body font-medium flex items-center justify-center gap-2 active:scale-[0.97]">
              <Printer className="size-4" />View Receipt
            </button>
          </div>
        )}
      </div>

      {showReceipt && <Receipt order={order} onClose={() => setShowReceipt(false)} />}
    </>
  );
}
