import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrderStore } from '@/stores/orderStore';
import { useShallow } from 'zustand/react/shallow';
import { formatTime, cn } from '@/lib/utils';
import { ORDER_STATUS_LABELS, CAFE_CONFIG } from '@/constants/config';
import type { OrderStatus, Order } from '@/types';
import {
  Inbox,
  Clock,
  MapPin,
  User as UserIcon,
  ChefHat,
  Bell,
  CheckCircle2,
  QrCode,
  UserCheck,
  Volume2,
  VolumeX,
  Printer,
  Trash2,
  Plus,
  Loader2,
  AlertTriangle,
  X,
  Flame,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import EmptyState from '@/components/ui/EmptyState';

type KitchenTab = 'active' | 'cancelled' | 'waste';

const TABS: { key: KitchenTab; label: string; hint: string }[] = [
  { key: 'active', label: 'Active', hint: 'New and cooking' },
  { key: 'cancelled', label: 'Cancelled', hint: 'Stop / verify' },
];

interface WasteEntry {
  id: string;
  food_item: string;
  quantity: string;
  logged_at: string;
  voided_at?: string | null;
  void_reason?: string | null;
}

function WasteTab() {
  const [entries, setEntries] = useState<WasteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [foodItem, setFoodItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const todayKey = new Date().toDateString();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const historyStart = new Date();
      historyStart.setDate(historyStart.getDate() - 30);
      const { data } = await supabase
        .from('kitchen_waste_log')
        .select('*')
        .gte('logged_at', historyStart.toISOString())
        .is('voided_at', null)
        .order('logged_at', { ascending: false });
      setEntries((data as WasteEntry[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const todaysEntries = useMemo(
    () => entries.filter(entry => new Date(entry.logged_at).toDateString() === todayKey),
    [entries, todayKey]
  );
  const historyEntries = useMemo(
    () => entries.filter(entry => new Date(entry.logged_at).toDateString() !== todayKey),
    [entries, todayKey]
  );

  const handleAdd = async () => {
    if (!foodItem.trim()) { setError('Enter a food item'); return; }
    if (!quantity.trim()) { setError('Enter a quantity'); return; }
    setSaving(true); setError('');
    const { data, error: err } = await supabase
      .from('kitchen_waste_log')
      .insert({ food_item: foodItem.trim(), quantity: quantity.trim() })
      .select()
      .single();
    if (err) { setError(err.message); setSaving(false); return; }
    setEntries(prev => [data as WasteEntry, ...prev]);
    setFoodItem(''); setQuantity('');
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const reason = window.prompt('Enter reason to void this waste log. The record will stay in Supabase for audit.');
    if (!reason?.trim()) { setDeleting(null); return; }
    const { error: err } = await supabase
      .from('kitchen_waste_log')
      .update({ voided_at: new Date().toISOString(), void_reason: reason.trim() })
      .eq('id', id);
    if (err) { setError(err.message); setDeleting(null); return; }
    setEntries(prev => prev.filter(e => e.id !== id));
    setDeleting(null);
  };

  const renderEntries = (items: WasteEntry[], emptyMessage: string) => (
    items.length === 0 ? (
      <EmptyState icon="Waste" message={emptyMessage} sub="Entries will appear here after they are logged." />
    ) : (
      <div className="kitchen-waste-items">
        {items.map(entry => (
          <article key={entry.id} className="kitchen-waste-item">
            <div>
              <h4>{entry.food_item}</h4>
              <p>{entry.quantity} - {new Date(entry.logged_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <button type="button" onClick={() => handleDelete(entry.id)} disabled={deleting === entry.id} aria-label={`Delete ${entry.food_item}`}>
              {deleting === entry.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            </button>
          </article>
        ))}
      </div>
    )
  );

  return (
    <div className="kitchen-waste-grid">
      <section className="kitchen-waste-form">
        <div className="kitchen-waste-head">
          <span><Trash2 className="size-5" /></span>
          <div>
            <h3>Today's Waste Log</h3>
            <p>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          {todaysEntries.length > 0 && <strong>{todaysEntries.length}</strong>}
        </div>

        <label>
          <span>Food item</span>
          <input
            value={foodItem}
            onChange={e => { setFoodItem(e.target.value); setError(''); }}
            placeholder="e.g. Idli batter, sambar, pastry cream"
          />
        </label>
        <label>
          <span>Quantity wasted</span>
          <input
            value={quantity}
            onChange={e => { setQuantity(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g. 2 kg, 15 pcs, half pot"
          />
        </label>

        {error && <div className="kitchen-inline-error"><AlertTriangle className="size-4" />{error}</div>}

        <button type="button" onClick={handleAdd} disabled={saving}>
          {saving ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
          Add to Waste Log
        </button>
      </section>

      <section className="kitchen-waste-list">
        <div className="kitchen-section-heading">
          <span>Today</span>
          <strong>{todaysEntries.length} record{todaysEntries.length !== 1 ? 's' : ''}</strong>
        </div>
        {loading ? <LoadingSkeleton variant="list" count={3} /> : renderEntries(todaysEntries, 'No wastage logged today')}

        <div className="kitchen-waste-history-block">
          <div className="kitchen-section-heading">
            <span>Log history</span>
            <strong>{historyEntries.length} record{historyEntries.length !== 1 ? 's' : ''}</strong>
          </div>
          {loading ? <LoadingSkeleton variant="list" count={3} /> : renderEntries(historyEntries, 'No previous waste logs in the last 30 days')}
        </div>
      </section>
    </div>
  );
}

let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playBeep() {
  try {
    const ctx = getAudioCtx();
    [0, 0.35, 0.7].forEach(offset => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = 'square';
      gain.gain.setValueAtTime(0, ctx.currentTime + offset);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.3);
      osc.start(ctx.currentTime + offset); osc.stop(ctx.currentTime + offset + 0.32);
    });
  } catch (e) { console.warn('playBeep failed:', e); }
}

function playCancelBeep() {
  try {
    const ctx = getAudioCtx();
    [0, 0.25, 0.5, 0.75].forEach((offset, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 400 - i * 60; osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0, ctx.currentTime + offset);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.22);
      osc.start(ctx.currentTime + offset); osc.stop(ctx.currentTime + offset + 0.24);
    });
  } catch (e) { console.warn('playCancelBeep failed:', e); }
}

function printKot(order: Order) {
  const win = window.open('', '_blank', 'width=320,height=600');
  if (!win) return;
  const items = order.items.map(ci =>
    `<tr><td style="font-size:16px;font-weight:900;padding:2px 0;width:36px">${ci.quantity}×</td><td style="font-size:15px;font-weight:700;padding:2px 6px">${ci.menuItem.name}</td></tr>`
  ).join('');
  win.document.write(`<!DOCTYPE html><html><head><title>KOT #${String(order.orderNumber).padStart(3,'0')}</title>
<style>@page{margin:4mm;size:80mm auto}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;width:72mm;margin:0 auto;padding:2mm}.c{text-align:center}.d{border-top:1px dashed #000;margin:5px 0}</style></head>
<body><div class="c" style="font-size:13px;font-weight:700">${CAFE_CONFIG.name}</div>
<div class="c" style="font-size:11px">KITCHEN ORDER TICKET</div><div class="d"></div>
<div class="c" style="font-size:36px;font-weight:900;margin:8px 0">#${String(order.orderNumber).padStart(3,'0')}</div>
<div class="d"></div>
<div style="display:flex;justify-content:space-between;font-size:12px;margin:4px 0">
<span>${order.orderType==='dine_in'&&order.tableNumber?'Table '+order.tableNumber:'📦 Takeaway'}</span>
<span>${formatTime(order.createdAt)}</span></div>
${order.customerName?`<div style="font-size:12px">Customer: ${order.customerName}</div>`:''}
<div class="d"></div><table style="width:100%">${items}</table>
${order.notes?`<div class="d"></div><div style="background:#f5f5f5;padding:4px 6px;font-size:12px">⚠️ ${order.notes}</div>`:''}
<div class="d"></div><div class="c" style="font-size:11px">${new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
</body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

export default function KitchenDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const wasteLogRequested = searchParams.get('tab') === 'waste';
  const { orders, updateOrderStatus, startPolling, stopPolling, polling } = useOrderStore(
    useShallow(s => ({
      orders: s.orders,
      updateOrderStatus: s.updateOrderStatus,
      startPolling: s.startPolling,
      stopPolling: s.stopPolling,
      polling: s.polling,
    }))
  );
  const [activeTab, setActiveTab] = useState<KitchenTab>(() => wasteLogRequested ? 'waste' : 'active');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<Record<string, string>>({});
  const lastIdsRef = useRef<Set<string>>(new Set());
  const alertRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCancelledIdsRef = useRef<Set<string>>(new Set());
  const [newlyCancelledIds, setNewlyCancelledIds] = useState<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (wasteLogRequested) {
      setActiveTab('waste');
      return;
    }
    setActiveTab(prev => prev === 'waste' ? 'active' : prev);
  }, [wasteLogRequested]);

  useEffect(() => {
    startPolling(1);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    const resume = () => { getAudioCtx(); document.removeEventListener('click', resume); document.removeEventListener('touchstart', resume); };
    document.addEventListener('click', resume);
    document.addEventListener('touchstart', resume);
    return () => {
      stopPolling();
      document.removeEventListener('click', resume);
      document.removeEventListener('touchstart', resume);
    };
  }, [startPolling, stopPolling]);

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => new Date(o.createdAt).toDateString() === today);
  }, [orders]);

  const pending = useMemo(() => todayOrders.filter(o => o.status === 'pending'), [todayOrders]);
  const preparing = useMemo(() => todayOrders.filter(o => o.status === 'preparing'), [todayOrders]);
  const activeKitchenOrders = useMemo(() => [...pending, ...preparing], [pending, preparing]);
  const cancelled = useMemo(() => todayOrders.filter(o => o.status === 'cancelled'), [todayOrders]);

  useEffect(() => {
    if (seededRef.current) return;
    if (orders.length === 0) return;
    lastIdsRef.current = new Set(orders.filter(o => o.status === 'pending').map(o => o.id));
    lastCancelledIdsRef.current = new Set(orders.filter(o => o.status === 'cancelled').map(o => o.id));
    seededRef.current = true;
  }, [orders]);

  useEffect(() => {
    const curr = new Set(pending.map(o => o.id));
    const newO = pending.filter(o => !lastIdsRef.current.has(o.id));
    if (newO.length > 0 && seededRef.current) {
      if (soundEnabled) playBeep();
      newO.forEach(o => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`🔔 New Order #${String(o.orderNumber).padStart(3,'0')}`, {
            body: o.items.map(ci => `${ci.quantity}× ${ci.menuItem.name}`).join(', '), tag: o.id,
          });
        }
      });
    }
    lastIdsRef.current = curr;
  }, [pending, soundEnabled]);

  useEffect(() => {
    const currCancelled = new Set(cancelled.map(o => o.id));
    const newCancelledOrders = cancelled.filter(o => !lastCancelledIdsRef.current.has(o.id));
    if (newCancelledOrders.length > 0 && seededRef.current) {
      const freshIds = new Set(newCancelledOrders.map(o => o.id));
      setNewlyCancelledIds(prev => new Set([...prev, ...freshIds]));
      if (soundEnabled) playCancelBeep();
      newCancelledOrders.forEach(o => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`❌ Order CANCELLED #${String(o.orderNumber).padStart(3,'0')}`, {
            body: `Reason: ${o.cancelReason || 'Not specified'} — STOP preparing this order`, tag: `cancel-${o.id}`,
          });
        }
      });
      setTimeout(() => {
        setNewlyCancelledIds(prev => {
          const next = new Set(prev);
          freshIds.forEach(id => next.delete(id));
          return next;
        });
      }, 30000);
    }
    lastCancelledIdsRef.current = currCancelled;
  }, [cancelled, soundEnabled]);

  useEffect(() => {
    if (alertRef.current) { clearInterval(alertRef.current); alertRef.current = null; }
    if (pending.length > 0 && soundEnabled) alertRef.current = setInterval(playBeep, 8000);
    return () => { if (alertRef.current) clearInterval(alertRef.current); };
  }, [pending.length, soundEnabled]);

  const filtered = useMemo(() => {
    if (activeTab === 'active') return activeKitchenOrders;
    if (activeTab === 'waste') return [];
    return cancelled;
  }, [activeKitchenOrders, cancelled, activeTab]);

  const elapsedMins = (t: string) => Math.floor((Date.now() - new Date(t).getTime()) / 60000);

  const tabCount = (key: KitchenTab) => {
    if (key === 'active') return activeKitchenOrders.length;
    if (key === 'cancelled') return cancelled.length;
    return 0;
  };

  const handleTabChange = (tab: KitchenTab) => {
    setActiveTab(tab);
    if (searchParams.get('tab') === 'waste') setSearchParams({}, { replace: true });
  };

  const handleStatusUpdate = async (orderId: string, status: OrderStatus) => {
    setUpdatingId(orderId);
    setStatusError(prev => ({ ...prev, [orderId]: '' }));
    try {
      await updateOrderStatus(orderId, status);
    } catch (e) {
      setStatusError(prev => ({ ...prev, [orderId]: e instanceof Error ? e.message : 'Failed to update — please retry.' }));
    } finally {
      setUpdatingId(null);
    }
  };

  if (activeTab === 'waste') {
    return (
      <div className="kitchen-screen dashboard-screen kitchen-waste-screen">
        <WasteTab />
      </div>
    );
  }

  return (
    <div className="kitchen-screen dashboard-screen">
      <section className="kitchen-command-center">
        <div className="kitchen-title-area">
          <span className="kitchen-eyebrow"><Flame className="size-4" /> Kitchen command</span>
          <h2>Live KOT Board</h2>
        </div>

        <div className="kitchen-live-tools">
          <div className="kitchen-live-pill">
            <span className={cn(polling && 'is-live')} />
            <div>
              <strong>{polling ? 'Live polling' : 'Offline'}</strong>
              <small>{polling ? 'Refreshing every few seconds' : 'Reconnect to receive orders'}</small>
            </div>
          </div>
          {pending.length > 0 && (
            <div className="kitchen-new-alert">
              <Bell className="size-5" />
              <strong>{pending.length} new</strong>
            </div>
          )}
          <button type="button" onClick={() => setSoundEnabled(!soundEnabled)} className="kitchen-sound-toggle" aria-label={soundEnabled ? 'Mute alerts' : 'Enable alerts'}>
            {soundEnabled ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            <span>{soundEnabled ? 'Sound on' : 'Muted'}</span>
          </button>
        </div>
      </section>


      {newlyCancelledIds.size > 0 && (
        <section className="kitchen-cancel-banner">
          <ShieldAlert className="size-8" />
          <div>
            <h3>Order cancelled — stop preparing</h3>
            {[...newlyCancelledIds].map(cid => {
              const o = orders.find(x => x.id === cid);
              if (!o) return null;
              return <p key={cid}>#{String(o.orderNumber).padStart(3,'0')} · {o.cancelReason || 'Reason not specified'}</p>;
            })}
          </div>
          <button type="button" onClick={() => setNewlyCancelledIds(new Set())} aria-label="Dismiss cancelled order alert"><X className="size-5" /></button>
        </section>
      )}

      <nav className="kitchen-tab-rail" aria-label="Kitchen tabs">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const count = tabCount(tab.key);
          return (
            <button key={tab.key} type="button" onClick={() => handleTabChange(tab.key)} className={cn('kitchen-tab', isActive && 'active')} data-tab={tab.key}>
              <span>{tab.label}</span>
              <small>{tab.hint}</small>
              {count > 0 && <strong>{count}</strong>}
            </button>
          );
        })}
      </nav>

      <section className="kitchen-board">
          <div className="kitchen-section-heading">
            <span>{activeTab === 'active' ? 'Live kitchen tickets' : TABS.find(tab => tab.key === activeTab)?.label}</span>
            <strong>{filtered.length} order{filtered.length !== 1 ? 's' : ''}</strong>
          </div>

          {filtered.length === 0 ? (
            <div className="kitchen-empty-state">
              <Inbox className="size-14" />
              <h3>
                {activeTab === 'active' && 'No active orders right now'}
                {activeTab === 'cancelled' && 'No cancelled orders today'}
              </h3>
              <p>The board will update automatically when orders arrive.</p>
            </div>
          ) : (
            <div className="kitchen-order-grid">
              {filtered.map(order => {
                const elapsed = elapsedMins(order.createdAt);
                const isUrgent = order.status === 'pending' && elapsed > 5;
                const isNewlyCancelled = newlyCancelledIds.has(order.id);
                return (
                  <article
                    key={order.id}
                    className={cn('kitchen-order-card', `status-${order.status}`, isUrgent && 'is-urgent', isNewlyCancelled && 'is-cancelled-now')}
                  >
                    <header className="kitchen-order-head">
                      <div>
                        <span>KOT</span>
                        <strong>#{String(order.orderNumber).padStart(3, '0')}</strong>
                      </div>
                      <div className="kitchen-order-status">
                        <b>{isNewlyCancelled ? 'CANCELLED' : ORDER_STATUS_LABELS[order.status]}</b>
                        <small><Clock className="size-4" /> {elapsed}m · {formatTime(order.createdAt)}</small>
                      </div>
                      <button type="button" onClick={() => printKot(order)} aria-label={`Print KOT ${order.orderNumber}`}>
                        <Printer className="size-5" />
                      </button>
                    </header>

                    <div className="kitchen-order-meta">
                      {order.orderType === 'dine_in' && order.tableNumber && <span><MapPin className="size-4" /> Table {order.tableNumber}</span>}
                      {order.orderType === 'takeaway' && <span>📦 Takeaway</span>}
                      {order.orderSource === 'qr' ? <span><QrCode className="size-4" /> QR order</span> : <span><UserCheck className="size-4" /> Staff</span>}
                      {order.customerName && <span><UserIcon className="size-4" /> {order.customerName}</span>}
                    </div>

                    <div className="kitchen-order-items">
                      {order.items.map(ci => (
                        <div key={ci.menuItem.id} className="kitchen-order-item">
                          <strong>{ci.quantity}×</strong>
                          <span>{ci.menuItem.name}</span>
                        </div>
                      ))}
                    </div>

                    {order.notes && <p className="kitchen-order-notes"><AlertTriangle className="size-4" /> {order.notes}</p>}
                    {order.cancelReason && <p className="kitchen-order-cancel-reason"><ShieldAlert className="size-4" /> {order.cancelReason}</p>}

                    {statusError[order.id] && <p className="kitchen-inline-error"><AlertTriangle className="size-4" />{statusError[order.id]}</p>}

                    <footer className="kitchen-order-actions">
                      {order.status === 'pending' && (
                        <button type="button" disabled={updatingId === order.id} onClick={() => handleStatusUpdate(order.id, 'preparing')} className="start">
                          {updatingId === order.id ? <Loader2 className="size-5 animate-spin" /> : <ChefHat className="size-5" />} Start Cooking
                        </button>
                      )}
                      {order.status === 'preparing' && (
                        <button type="button" disabled={updatingId === order.id} onClick={() => handleStatusUpdate(order.id, 'ready')} className="ready">
                          {updatingId === order.id ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />} Mark Ready
                        </button>
                      )}
                      {order.status === 'ready' && <div className="ready-state"><CheckCircle2 className="size-5" /> Ready for Pickup</div>}
                      {order.status === 'cancelled' && <div className="cancel-state"><ShieldAlert className="size-5" /> Cancelled / stopped</div>}
                      <button type="button" onClick={() => printKot(order)} className="print"><Printer className="size-5" /> Print</button>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </section>

    </div>
  );
}
