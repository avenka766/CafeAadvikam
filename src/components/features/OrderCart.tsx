import { useState, useRef, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { useAuthStore } from '@/stores/authStore';
import {
  X, Minus, Plus, Trash2, ShoppingBag,
  MapPin, User as UserIcon, StickyNote,
  ChevronDown, AlertCircle, Undo2, Send, CheckCircle2,
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<typeof cart | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) setSubmitError(null);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const handleClearAll = () => {
    setUndoSnapshot([...cart]);
    clearCart();
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), 5000);
  };

  const handleUndo = () => {
    if (!undoSnapshot) return;
    useOrderStore.getState().clearCart();
    undoSnapshot.forEach(item => {
      useOrderStore.getState().addToCart(item.menuItem);
      const diff = item.quantity - 1;
      if (diff > 0) {
        for (let i = 0; i < diff; i++) useOrderStore.getState().addToCart(item.menuItem);
      }
    });
    setUndoSnapshot(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  const total = getCartTotal();

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    if (!currentUser) return;
    if (orderType === 'dine_in' && !tableNumber) { setTableError(true); return; }

    setTableError(false);
    setSubmitError(null);
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
      successTimerRef.current = setTimeout(() => { setShowSuccess(false); onClose(); }, 1800);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to place order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="order-cart-overlay" role="dialog" aria-modal="true" aria-label="Review order ticket">
      <button className="order-cart-backdrop" onClick={onClose} aria-label="Close cart" />
      <section className="order-cart-sheet">
        {showSuccess ? (
          <div className="order-cart-success">
            <div><CheckCircle2 className="size-14" /></div>
            <h2>Order Sent!</h2>
            <p>The billing counter and kitchen have received the order.</p>
          </div>
        ) : (
          <>
            <header className="order-cart-header">
              <div>
                <span>Order ticket</span>
                <h2>Review & send</h2>
                <p>{cart.length} line item{cart.length !== 1 ? 's' : ''} · {formatCurrency(total)}</p>
              </div>
              <div className="order-cart-header-actions">
                {cart.length > 0 && <button type="button" onClick={handleClearAll} className="order-cart-clear">Clear all</button>}
                <button type="button" onClick={onClose} className="order-cart-close" aria-label="Close cart"><X className="size-5" /></button>
              </div>
            </header>

            {undoSnapshot !== null && (
              <div className="order-cart-undo">
                <span>Cleared {undoSnapshot.length} item{undoSnapshot.length !== 1 ? 's' : ''}</span>
                <button type="button" onClick={handleUndo}><Undo2 className="size-4" /> Undo</button>
              </div>
            )}

            <div className="order-cart-content">
              {cart.length === 0 ? (
                <div className="order-cart-empty">
                  <ShoppingBag className="size-14" />
                  <h3>No items added yet</h3>
                  <p>Browse the menu and add items to create a ticket.</p>
                </div>
              ) : (
                <div className="order-cart-lines">
                  {cart.map((cartItem) => (
                    <article key={cartItem.menuItem.id} className="order-cart-line">
                      {cartItem.menuItem.imageUrl ? (
                        <img src={cartItem.menuItem.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <div className="order-cart-line-placeholder" aria-hidden="true">🍽️</div>
                      )}
                      <div className="order-cart-line-main">
                        <h3>{cartItem.menuItem.name}</h3>
                        <p>{formatCurrency(cartItem.menuItem.price)} each</p>
                        <strong>{formatCurrency(cartItem.menuItem.price * cartItem.quantity)}</strong>
                      </div>
                      <div className="order-cart-line-controls">
                        <button type="button" onClick={() => updateCartQuantity(cartItem.menuItem.id, cartItem.quantity - 1)} aria-label={`Remove ${cartItem.menuItem.name}`}><Minus className="size-4" /></button>
                        <span>{cartItem.quantity}</span>
                        <button type="button" onClick={() => updateCartQuantity(cartItem.menuItem.id, cartItem.quantity + 1)} aria-label={`Add ${cartItem.menuItem.name}`}><Plus className="size-4" /></button>
                        <button type="button" onClick={() => removeFromCart(cartItem.menuItem.id)} className="order-cart-delete" aria-label={`Delete ${cartItem.menuItem.name}`}><Trash2 className="size-4" /></button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
                <div className="order-cart-details">
                  <div className="order-cart-toggle">
                    <button type="button" onClick={() => { setOrderType('dine_in'); setTableError(false); setShowTableSelect(false); setSubmitError(null); }} className={orderType === 'dine_in' ? 'active' : ''}>🍽️ Dine In</button>
                    <button type="button" onClick={() => { setOrderType('takeaway'); setTableError(false); setShowTableSelect(false); setSubmitError(null); }} className={orderType === 'takeaway' ? 'active' : ''}>📦 Takeaway</button>
                  </div>

                  {orderType === 'dine_in' ? (
                    <div>
                      <div className="order-cart-field order-cart-select-field">
                        <MapPin className="size-5" />
                        <button type="button" onClick={() => setShowTableSelect(!showTableSelect)} className={tableError ? 'has-error' : ''}>
                          {tableNumber ? `Table ${tableNumber}` : 'Select Table *'}
                        </button>
                        <ChevronDown className="size-5" />
                        {showTableSelect && (
                          <>
                            <button className="order-cart-click-catcher" type="button" aria-label="Close table selector" onClick={() => setShowTableSelect(false)} />
                            <div className="order-cart-table-grid">
                              {TABLE_NUMBERS.map((num) => (
                                <button key={num} type="button" onClick={() => { setTableNumber(num); setShowTableSelect(false); setTableError(false); }} className={tableNumber === num ? 'active' : ''}>{num}</button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                      {tableError && <div className="order-cart-error"><AlertCircle className="size-4" /><span>Table number is required for Dine In orders.</span></div>}
                    </div>
                  ) : (
                    <label className="order-cart-field">
                      <UserIcon className="size-5" />
                      <input type="text" placeholder="Customer name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                    </label>
                  )}

                  <label className="order-cart-notes">
                    <StickyNote className="size-5" />
                    <textarea placeholder="Order notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                  </label>

                  <div className="order-cart-suggestions">
                    {[
                      'Less spicy', 'Extra spicy', 'No onion', 'No garlic',
                      'Less oil', 'Extra chutney', 'Pack separately', 'Allergy – check ingredients',
                    ].map((suggestion) => (
                      <button key={suggestion} type="button"
                        onClick={() => setNotes(prev => prev ? `${prev}, ${suggestion}` : suggestion)}>
                        + {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <footer className="order-cart-footer">
                <div className="order-cart-total">
                  <span>Total amount</span>
                  <strong>{formatCurrency(total)}</strong>
                </div>
                {submitError && (
                  <div className="order-cart-error order-cart-submit-error">
                    <AlertCircle className="size-4" />
                    <span>{submitError}</span>
                  </div>
                )}
                <button type="button" onClick={handleSubmit} disabled={submitting} className="order-cart-send">
                  <Send className="size-5" /> {submitting ? 'Sending order…' : 'Send to Kitchen & Billing'}
                </button>
              </footer>
            )}
          </>
        )}
      </section>
    </div>
  );
}
