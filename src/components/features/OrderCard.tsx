import { useState } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, formatTime } from '@/lib/utils';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/constants/config';
import { Clock, MapPin, User, ChevronDown, ChevronUp, Printer, QrCode, UserCheck, Bell, AlertCircle } from 'lucide-react';
import type { Order, PaymentType, PaymentBreakdown } from '@/types';
import Receipt from './Receipt';
import { AdvancePaymentPanel } from '@/pages/BillingDashboard';

const CANCEL_REASONS = [
  'Customer changed mind',
  'Item unavailable',
  'Wrong order placed',
  'Customer left',
  'Duplicate order',
  'Payment issue',
  'Long wait time',
];

interface OrderCardProps {
  order: Order;
  showActions?: boolean;
}

const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: '💵 Cash',
  upi: '📱 UPI',
  card: '💳 Card',
  part_payment: '🔀 Split Payment',
  unpaid: 'Unpaid',
  advance: '⏳ Advance',
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
  const [cancelCustomReason, setCancelCustomReason] = useState('');
  const [cancelPassword, setCancelPassword] = useState('');
  const [cancelPasswordError, setCancelPasswordError] = useState('');
  const [showAdvance, setShowAdvance] = useState(false);

  const [splitMode, setSplitMode] = useState(false);
  const [splitMethods, setSplitMethods] = useState<SplitMethod[]>([]);
  const [splitCash, setSplitCash] = useState('');
  const [splitUpi, setSplitUpi] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [splitError, setSplitError] = useState('');
  const [paymentError, setPaymentError] = useState('');

  const billerName = currentUser?.displayName || currentUser?.username || '';

  // Biller can ONLY collect payment — they cannot advance status
  const isBiller = currentUser?.role === 'billing';
  const isReadyOrder = order.status === 'ready';
  const canCollectPayment = showActions && isBiller && isReadyOrder && order.paymentType === 'unpaid';
  const canAdvanceNonBiller = showActions && !isBiller && order.status !== 'served' && order.status !== 'cancelled';

  const handleApplyDiscount = () => {
    const val = parseFloat(discValue);
    if (!isNaN(val) && val > 0) {
      applyDiscount(order.id, discType, val).catch(() => {});
      setShowDiscount(false);
      setDiscValue('');
    }
  };

  const handleSinglePayment = async (pt: PaymentType) => {
    setPaymentError('');
    try {
      await setPaymentType(order.id, pt, billerName);
      await updateOrderStatus(order.id, 'served');
      setShowPayment(false);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Payment failed — please try again.');
    }
  };

  const toggleSplitMethod = (method: SplitMethod) => {
    setSplitError('');
    setSplitMethods((prev) => {
      const newMethods = prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method];
      if (!newMethods.includes('cash')) setSplitCash('');
      if (!newMethods.includes('upi')) setSplitUpi('');
      if (!newMethods.includes('card')) setSplitCard('');
      return newMethods;
    });
  };

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

    const numVal = parseFloat(value) || 0;
    const otherFields = splitMethods.filter((m) => m !== field);

    if (otherFields.length === 1) {
      const otherField = otherFields[0];
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

  const handleSplitPayment = async () => {
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
    setPaymentError('');
    const breakdown: PaymentBreakdown = { cash: cashAmt, upi: upiAmt, card: cardAmt };
    try {
      await setPaymentType(order.id, 'part_payment', billerName, breakdown);
      await updateOrderStatus(order.id, 'served');
      resetPaymentState();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Payment failed — please try again.');
    }
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

  // Ready notification badge for billers
  const showReadyBadge = isBiller && isReadyOrder && order.paymentType === 'unpaid';
  const isKitchen = currentUser?.role === 'kitchen' || currentUser?.role === 'order_taker';

  return (
    <>
      <div className={`bg-card rounded-2xl overflow-hidden shadow-soft transition-all ${
        showReadyBadge
          ? 'ring-2 ring-emerald-400 shadow-lifted'
          : 'border border-border'
      }`}>
        {/* Ready notification for biller */}
        {showReadyBadge && (
          <div className="px-4 py-2.5 flex items-center gap-2"
            style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.06))', borderBottom: '1px solid rgba(16,185,129,0.25)' }}>
            <Bell className="size-4 text-emerald-600 animate-bounce" />
            <span className="text-xs font-body font-bold text-emerald-700">Order Ready — Collect Payment</span>
          </div>
        )}

        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-xl font-bold text-foreground">
              #{String(order.orderNumber).padStart(3, '0')}
            </span>
            <span className={`text-[10px] font-body font-bold px-2.5 py-0.5 rounded-full border ${ORDER_STATUS_COLORS[order.status]}`}>
              {ORDER_STATUS_LABELS[order.status]}
            </span>
            <span className={`text-[9px] font-body font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
              order.orderSource === 'qr'
                ? 'bg-violet-100 text-violet-700 border border-violet-200'
                : 'bg-blue-50 text-blue-600 border border-blue-200'
            }`}>
              {order.orderSource === 'qr' ? <><QrCode className="size-2.5" />QR</> : <><UserCheck className="size-2.5" />Staff</>}
            </span>
          </div>
          <button onClick={() => setExpanded(!expanded)}
            className="size-8 flex items-center justify-center rounded-xl bg-muted active:scale-90 transition-all">
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
              {!isKitchen && <span className="text-muted-foreground tabular-nums shrink-0 ml-2">{formatCurrency(ci.menuItem.price * ci.quantity)}</span>}
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

        {/* Totals — hidden for kitchen */}
        {!isKitchen && (
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
        )}

        {/* Payment badge — hidden for kitchen */}
        {!isKitchen && order.paymentType && order.paymentType !== 'unpaid' && (
          <div className="px-3.5 py-2">
            {order.paymentType === 'advance' && order.fullyPaidAt ? (
              // Fully paid advance order — show full breakdown
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-body font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    ✅ Fully Paid
                  </span>
                </div>
                <div className="bg-muted/40 rounded-lg px-3 py-2 space-y-1 text-xs font-body">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Bill</span>
                    <span className="font-bold tabular-nums">{formatCurrency(order.total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-700 flex items-center gap-1">
                      Advance
                      {order.advancePaidBy && <span className="px-1 py-0.5 rounded bg-amber-100 text-[9px] font-bold uppercase">{order.advancePaidBy}</span>}
                    </span>
                    <span className="font-bold text-amber-600 tabular-nums">−{formatCurrency(order.advanceAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 flex items-center gap-1">
                      Balance
                      {order.balancePaymentType && <span className="px-1 py-0.5 rounded bg-blue-100 text-[9px] font-bold uppercase">{order.balancePaymentType}</span>}
                    </span>
                    <span className="font-bold text-blue-600 tabular-nums">−{formatCurrency((order.total) - (order.advanceAmount || 0))}</span>
                  </div>
                </div>
                {order.billedBy && <p className="text-[10px] font-body text-muted-foreground">Closed by {order.billedBy}</p>}
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}

        {/* Biller Actions — Only collect payment on ready orders */}
        {canCollectPayment && (
          <div className="px-4 py-3 border-t border-border flex gap-2">
            <button
              onClick={() => setShowPayment(true)}
              className="flex-1 py-3 rounded-xl text-white text-sm font-body font-bold active:scale-[0.97] transition-all shadow-teal flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' }}
            >
              💰 Collect Payment
            </button>
            <button onClick={() => setShowDiscount(!showDiscount)} className="px-3 py-3 rounded-xl bg-accent/15 text-accent-foreground text-sm font-body font-semibold active:scale-90 border border-accent/20">%</button>
            <button onClick={() => setShowReceipt(true)} className="px-3 py-3 rounded-xl bg-muted text-foreground text-sm font-body active:scale-90 border border-border" aria-label="Print receipt">
              <Printer className="size-4" />
            </button>
            <button onClick={() => setShowCancelPrompt(true)} className="px-3 py-3 rounded-xl bg-destructive/10 text-destructive text-sm font-body font-semibold active:scale-90 border border-destructive/20">✕</button>
          </div>
        )}

        {/* Non-biller Actions (admin etc — full status control) */}
        {canAdvanceNonBiller && (
          <div className="px-3.5 py-2.5 border-t border-border flex gap-2">
            {order.status === 'pending' && (
              <button
                onClick={() => updateOrderStatus(order.id, 'preparing')}
                className="flex-1 py-2.5 rounded-lg cafe-gradient text-primary-foreground text-sm font-body font-bold active:scale-[0.97] transition-transform"
              >
                Mark as {ORDER_STATUS_LABELS['preparing']}
              </button>
            )}
            {order.status === 'preparing' && (
              <button
                onClick={() => updateOrderStatus(order.id, 'ready')}
                className="flex-1 py-2.5 rounded-lg cafe-gradient text-primary-foreground text-sm font-body font-bold active:scale-[0.97] transition-transform"
              >
                Mark as {ORDER_STATUS_LABELS['ready']}
              </button>
            )}
            {order.status === 'ready' && (
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

        {/* Biller: show pending/preparing status without actions */}
        {showActions && isBiller && !isReadyOrder && order.status !== 'served' && order.status !== 'cancelled' && (
          <div className="px-3.5 py-2.5 border-t border-border flex items-center gap-2">
            <div className="flex-1 py-2 rounded-lg bg-muted/50 text-center text-xs font-body font-semibold text-muted-foreground">
              {order.status === 'pending' ? '⏳ Waiting for kitchen to start' : '🍳 Kitchen is preparing'}
            </div>
            <button onClick={() => setShowCancelPrompt(true)} className="px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-body font-bold active:scale-95 flex items-center gap-1" title="Cancel Order">
              ✕ Cancel
            </button>
            <button onClick={() => setShowReceipt(true)} className="px-3 py-2.5 rounded-lg bg-muted text-foreground text-sm font-body active:scale-95" aria-label="Print receipt">
              <Printer className="size-4" />
            </button>
          </div>
        )}

        {/* Cancel Prompt — reason required + password required */}
        {showCancelPrompt && (() => {
          const finalReason = cancelReason === '__custom__' ? cancelCustomReason.trim() : cancelReason;
          const canConfirm = finalReason.length > 0 && cancelPassword.length > 0;

          const handleConfirmCancel = () => {
            setCancelPasswordError('');
            if (!finalReason) { setCancelPasswordError('Select or enter a reason.'); return; }
            if (currentUser?.password && cancelPassword !== currentUser.password) {
              setCancelPasswordError('Incorrect password. Try again.');
              return;
            }
            updateOrderStatus(order.id, 'cancelled', finalReason);
            setShowCancelPrompt(false);
            setCancelReason('');
            setCancelCustomReason('');
            setCancelPassword('');
            setCancelPasswordError('');
          };

          const handleBack = () => {
            setShowCancelPrompt(false);
            setCancelReason('');
            setCancelCustomReason('');
            setCancelPassword('');
            setCancelPasswordError('');
          };

          return (
            <div className="px-3.5 py-3 border-t border-destructive/30 bg-destructive/5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 text-destructive shrink-0" />
                <p className="text-xs font-body font-bold text-destructive">Cancel Order #{String(order.orderNumber).padStart(3, '0')}</p>
              </div>

              {/* Pre-populated reason chips */}
              <div>
                <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Select a reason <span className="text-destructive">*</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {CANCEL_REASONS.map(r => (
                    <button
                      key={r}
                      onClick={() => { setCancelReason(r); setCancelCustomReason(''); }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-body font-semibold transition-all active:scale-95 border ${
                        cancelReason === r
                          ? 'bg-destructive text-white border-destructive shadow-sm'
                          : 'bg-card border-border text-foreground hover:border-destructive/40'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                  <button
                    onClick={() => setCancelReason('__custom__')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-body font-semibold transition-all active:scale-95 border ${
                      cancelReason === '__custom__'
                        ? 'bg-destructive text-white border-destructive shadow-sm'
                        : 'bg-card border-border text-foreground hover:border-destructive/40'
                    }`}
                  >
                    + Other
                  </button>
                </div>
              </div>

              {/* Custom reason input */}
              {cancelReason === '__custom__' && (
                <textarea
                  placeholder="Describe the reason…"
                  value={cancelCustomReason}
                  onChange={e => setCancelCustomReason(e.target.value)}
                  rows={2}
                  autoFocus
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-destructive/30"
                />
              )}

              {/* Password confirmation */}
              <div>
                <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1.5">Your password <span className="text-destructive">*</span></p>
                <input
                  type="password"
                  placeholder="Enter your login password"
                  value={cancelPassword}
                  onChange={e => { setCancelPassword(e.target.value); setCancelPasswordError(''); }}
                  className={`w-full px-3 py-2 bg-card border rounded-lg text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive/30 ${
                    cancelPasswordError ? 'border-destructive' : 'border-border'
                  }`}
                />
                {cancelPasswordError && (
                  <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="size-3" />{cancelPasswordError}
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleConfirmCancel}
                  disabled={!canConfirm}
                  className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-body font-bold active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Confirm Cancel
                </button>
                <button
                  onClick={handleBack}
                  className="px-4 py-2.5 rounded-lg bg-muted text-foreground text-sm font-body font-semibold active:scale-95"
                >
                  Back
                </button>
              </div>
            </div>
          );
        })()}

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
                {paymentError && <p className="text-xs font-body text-destructive text-center">{paymentError}</p>}
                <button onClick={resetPaymentState} className="w-full py-2 text-xs font-body text-muted-foreground active:opacity-70">Cancel</button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-body font-semibold text-foreground">Split Payment</p>
                  <p className="text-xs font-body font-bold text-primary tabular-nums">Total: {formatCurrency(order.total)}</p>
                </div>

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
                {paymentError && <p className="text-xs font-body text-destructive">{paymentError}</p>}

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
