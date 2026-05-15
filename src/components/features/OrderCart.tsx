import { useState } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useAuthStore } from '@/stores/authStore';
import {
  X, Minus, Plus, Trash2, ShoppingBag,
  MapPin, User as UserIcon, StickyNote,
  ChevronDown, AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { TABLE_NUMBERS } from '@/constants/config';
import type { OrderType } from '@/types';

interface OrderCartProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OrderCart({ isOpen, onClose }: OrderCartProps) {
  const { cart, updateCartQuantity, removeFromCart, clearCart, getCartTotal, submitOrder } = useOrderStore();
  const { currentUser } = useAuthStore();

  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableNumber, setTableNumber] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showTableSelect, setShowTableSelect] = useState(false);
  const [tableError, setTableError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const total = getCartTotal();

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    if (!currentUser) return;
    if (orderType === 'dine_in' && !tableNumber) { setTableError(true); return; }

    setTableError(false);
    setSubmitting(true);
    try {
      await submitOrder({
        tableNumber: orderType === 'dine_in' ? (tableNumber ?? undefined) : undefined,
        orderType,
        notes: notes || undefined,
        customerName: customerName || undefined,
        createdBy: currentUser.username,
        orderSource: 'staff',
      });
      setShowSuccess(true);
      setNotes('');
      setCustomerName('');
      setTableNumber(null);
      setTimeout(() => { setShowSuccess(false); onClose(); }, 1800);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to place order. Please try again.';
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        {showSuccess ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="size-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
              <ShoppingBag className="size-10 text-emerald-600" />
            </div>
            <h2 className="font-display text-2xl font-bold text-foreground">Order Sent!</h2>
            <p className="text-muted-foreground font-body mt-1">The billing counter and kitchen have received your order.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <h2 className="font-display text-xl font-bold">Your Order</h2>
                <p className="text-xs text-muted-foreground font-body">{cart.length} item{cart.length !== 1 ? 's' : ''} · {formatCurrency(total)}</p>
              </div>
              <div className="flex gap-2">
                {cart.length > 0 && <button onClick={clearCart} className="px-3 py-1.5 text-xs font-body font-semibold text-destructive bg-destructive/10 rounded-lg active:scale-95">Clear All</button>}
                <button onClick={onClose} className="size-9 rounded-full bg-muted flex items-center justify-center" aria-label="Close cart"><X className="size-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ShoppingBag className="size-12 mb-3 opacity-40" />
                  <p className="font-body font-medium">No items added yet</p>
                  <p className="text-sm">Browse the menu to add items</p>
                </div>
              ) : (
                cart.map((cartItem) => (
                  <div key={cartItem.menuItem.id} className="flex items-center gap-3 py-2">
                    {cartItem.menuItem.imageUrl ? <img src={cartItem.menuItem.imageUrl} alt="" className="size-12 rounded-lg object-cover shrink-0" /> : <div className="size-12 rounded-lg bg-muted shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-body font-semibold truncate">{cartItem.menuItem.name}</p>
                      <p className="text-sm text-accent-foreground font-bold tabular-nums bg-accent/20 inline-block px-1.5 rounded mt-0.5">{formatCurrency(cartItem.menuItem.price * cartItem.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => updateCartQuantity(cartItem.menuItem.id, cartItem.quantity - 1)} className="size-7 rounded-md bg-muted flex items-center justify-center active:scale-90"><Minus className="size-3.5" /></button>
                      <span className="w-5 text-center text-sm font-bold tabular-nums">{cartItem.quantity}</span>
                      <button onClick={() => updateCartQuantity(cartItem.menuItem.id, cartItem.quantity + 1)} className="size-7 rounded-md cafe-gradient text-primary-foreground flex items-center justify-center active:scale-90"><Plus className="size-3.5" /></button>
                      <button onClick={() => removeFromCart(cartItem.menuItem.id)} className="size-7 rounded-md bg-destructive/10 text-destructive flex items-center justify-center active:scale-90 ml-1" aria-label="Remove item"><Trash2 className="size-3.5" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <>
                <div className="px-4 py-3 border-t border-border space-y-3 bg-muted/50">
                  <div className="flex gap-2">
                    <button onClick={() => { setOrderType('dine_in'); setTableError(false); }} className={`flex-1 py-2.5 rounded-lg text-sm font-body font-semibold transition-all ${orderType === 'dine_in' ? 'cafe-gradient text-primary-foreground shadow-md' : 'bg-card text-foreground border border-border'}`}>🍽️ Dine In</button>
                    <button onClick={() => { setOrderType('takeaway'); setTableError(false); }} className={`flex-1 py-2.5 rounded-lg text-sm font-body font-semibold transition-all ${orderType === 'takeaway' ? 'cafe-gradient text-primary-foreground shadow-md' : 'bg-card text-foreground border border-border'}`}>📦 Takeaway</button>
                  </div>

                  {orderType === 'dine_in' ? (
                    <div>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <button onClick={() => setShowTableSelect(!showTableSelect)} className={`w-full pl-9 pr-9 py-2.5 bg-card border rounded-lg text-left text-sm font-body ${tableError ? 'border-destructive ring-1 ring-destructive/30' : 'border-border'}`}>
                          {tableNumber ? `Table ${tableNumber}` : 'Select Table *'}
                        </button>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        {showTableSelect && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 p-2 grid grid-cols-5 gap-1 max-h-40 overflow-y-auto">
                            {TABLE_NUMBERS.map((num) => (
                              <button key={num} onClick={() => { setTableNumber(num); setShowTableSelect(false); setTableError(false); }} className={`py-2 rounded-md text-sm font-body font-medium ${tableNumber === num ? 'cafe-gradient text-primary-foreground' : 'hover:bg-muted'}`}>{num}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      {tableError && <div className="flex items-center gap-1 mt-1.5 text-destructive"><AlertCircle className="size-3" /><span className="text-xs font-body">Table number is required for Dine In orders</span></div>}
                    </div>
                  ) : (
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <input type="text" placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground" />
                    </div>
                  )}

                  <div className="relative">
                    <StickyNote className="absolute left-3 top-3 size-4 text-muted-foreground" />
                    <textarea placeholder="Order notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm font-body placeholder:text-muted-foreground resize-none" />
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {[
                        'Less spicy', 'Extra spicy', 'No onion', 'No garlic',
                        'Less oil', 'Extra chutney', 'Pack separately', 'Allergy – check ingredients',
                      ].map((suggestion) => (
                        <button key={suggestion} type="button"
                          onClick={() => setNotes(prev => prev ? `${prev}, ${suggestion}` : suggestion)}
                          className="px-2 py-1 rounded-md text-[11px] font-body font-semibold bg-muted border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-95 transition-all">
                          + {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-border bg-background">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-body text-sm text-muted-foreground">Total</span>
                    <span className="font-display text-2xl font-bold text-foreground tabular-nums">{formatCurrency(total)}</span>
                  </div>
                  <button onClick={handleSubmit} disabled={submitting} className="w-full py-3.5 rounded-xl cafe-gradient text-primary-foreground font-body font-bold text-base active:scale-[0.98] transition-transform shadow-lg disabled:opacity-60">
                    {submitting ? 'Sending...' : 'Send to Kitchen & Billing'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
